import { test, expect, type Locator } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { loginAs } from './helpers/auth';
import { requireStagingCredential } from '../scripts/staging-credentials.mjs';
import { assertReadOnlyRun, classifyReadOnlyRequest, redactReadOnlyError } from './helpers/maternelleReadOnly.mjs';
import { exactReadOnlyPreview } from './helpers/maternelleDeployment';
import { createTestSchoolReader, fingerprint, type LabelClass } from './helpers/maternelleTestSchoolReader';
import { getClassOptionLabel, getDisplayClassName } from '../src/utils/classCatalog';

async function assertOptions(select: Locator, classes: LabelClass[], suffix = false) {
  await expect(select).toBeVisible();
  const read = () => select.locator('option').evaluateAll(options => options.map(option => ({ value: option.value, label: option.textContent?.trim() || '' })).filter(option => option.value && option.value !== 'all'));
  await expect.poll(async () => (await read()).length).toBe(classes.length);
  const options = await read();
  expect(options.map(option => option.value).sort()).toEqual(classes.map(item => item.id).sort());
  expect(new Set(options.map(option => option.label)).size).toBe(classes.length);
  for (const item of classes) {
    const actual = options.find(option => option.value === item.id)!.label;
    const expected = getClassOptionLabel(item, classes);
    expect(suffix ? actual.startsWith(`${expected} (`) : actual === expected, 'Every stored class keeps its id and expected display label').toBe(true);
  }
}

test('seven exact-SHA authenticated screens are read-only for the existing TEST school', async ({ browser }) => {
  const phase = assertReadOnlyRun(process.env);
  expect(process.env.STAGING_APP_URL, 'Existing login helper must not override the mutation guard').toBeUndefined();
  const appOrigin = await exactReadOnlyPreview(phase);
  const password = requireStagingCredential('alpha');
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  expect(Boolean(bypass), 'Official Vercel automation bypass available').toBe(true);
  const context = await browser.newContext({ baseURL: appOrigin, viewport: { width: 1440, height: 1050 }, serviceWorkers: 'block', acceptDownloads: false });
  const violations: string[] = [];
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  let auditRequestsBlocked = 0;
  let stagingReads = 0;
  let idToken = '';
  let uid = '';
  let stage = 'authenticate';
  let reader: Awaited<ReturnType<typeof createTestSchoolReader>> | undefined;
  let before: Awaited<ReturnType<NonNullable<typeof reader>['snapshot']>> | undefined;
  const report: Record<string, unknown> = { phase, sha: process.env.GITHUB_SHA, scope: 'existing-alpha-test-school', screenshots: 'runner-only; no export', screens: {} };
  const screens = report.screens as Record<string, string>;
  let failure: Error | undefined;
  await context.route('**/*', async route => {
    const request = route.request();
    const verdict = classifyReadOnlyRequest(request.url(), request.method(), { appOrigin, apiKey: process.env.STAGING_FIREBASE_API_KEY, storageBucket: process.env.STAGING_FIREBASE_STORAGE_BUCKET });
    if (verdict === 'blocked-login-audit') { auditRequestsBlocked++; return route.abort('blockedbyclient'); }
    if (verdict.startsWith('forbidden')) { violations.push(verdict); return route.abort('blockedbyclient'); }
    if (verdict === 'blocked-external-post') return route.abort('blockedbyclient');
    if (verdict === 'read' && new URL(request.url()).hostname === 'firestore.googleapis.com') stagingReads++;
    if (verdict === 'app') return route.continue({ headers: { ...request.headers(), 'x-vercel-protection-bypass': bypass!, 'x-vercel-set-bypass-cookie': 'true' } });
    return route.continue();
  });
  try {
    const page = await context.newPage();
    page.on('pageerror', error => pageErrors.push(fingerprint(error.message)));
    page.on('console', message => {
      if (message.type() !== 'error') return;
      const text = message.text();
      if (!text.includes('Failed to log LOGIN action') && !text.includes('net::ERR_BLOCKED_BY_CLIENT')) consoleErrors.push(fingerprint(text));
    });
    await Promise.all([
      page.waitForResponse(response => response.url().startsWith('https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?') && response.request().method() === 'POST').then(async response => {
        expect(response.ok(), 'Existing TEST sign-in succeeds').toBe(true);
        const auth = await response.json() as { idToken: string; localId: string };
        idToken = auth.idToken; uid = auth.localId;
      }),
      loginAs(page, 'owner.alpha@ecoscolaire.com', password),
    ]);
    await expect(page.getByTestId('sidebar')).toBeVisible();
    reader = await createTestSchoolReader(idToken, uid);
    const classes = await reader.classes();
    expect(classes.length).toBeGreaterThan(0);
    const required = ['Maternelle Petite Section', 'Maternelle Moyenne Section', 'Maternelle Grande Section', 'Pré-maternelle', 'SIL', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];
    for (const label of required) expect(classes.some(item => getDisplayClassName(item.name) === label), `TEST fixture contains ${label}`).toBe(true);
    const fees = await reader.fees();
    before = await reader.snapshot();
    await mkdir('test-results/maternelle-remote-private', { recursive: true });
    const capture = async (name: string, locator: Locator) => {
      await locator.screenshot({ path: `test-results/maternelle-remote-private/${name}.png` });
      screens[name] = 'PASS';
    };
    const navigate = async (route: string, title: RegExp) => {
      await page.goto(`/#/${route}`);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
      expect(new URL(page.url()).origin).toBe(appOrigin);
    };
    const classSelect = () => page.locator('select').filter({ has: page.locator(`option[value=${JSON.stringify(classes[0].id)}]`) });

    stage = 'Settings';
    await navigate('settings', /^Paramètres$/);
    const feeCard = page.locator('.card').filter({ has: page.getByRole('heading', { name: 'Frais scolaires par classe', exact: true }) });
    const feeRows = feeCard.locator('tbody tr');
    await expect(feeRows).toHaveCount(classes.length);
    const displayedFees = await feeRows.evaluateAll(rows => rows.map(row => ({ label: row.querySelector('td')?.textContent?.trim(), values: Array.from(row.querySelectorAll('input')).map(input => input.value) })));
    expect(new Set(displayedFees.map(row => row.label)).size).toBe(classes.length);
    for (const item of classes) {
      const row = displayedFees.find(candidate => candidate.label === getClassOptionLabel(item, classes));
      const values = ['registration', 'tuition', 't1', 't2', 't3'].map(key => fees[item.name]?.[key]?.toString() || '');
      expect(Boolean(row) && fingerprint(row?.values) === fingerprint(values), 'Displayed fees match existing stored keys/amounts').toBe(true);
    }
    await capture('Settings', feeCard);

    stage = 'Classes';
    await navigate('classes', /^Classes/);
    await page.locator('button[aria-haspopup="listbox"]').click();
    const listbox = page.getByRole('listbox', { name: 'Classes disponibles' });
    await expect(listbox.getByRole('option')).toHaveCount(classes.length);
    const classRows = await listbox.getByRole('option').allTextContents();
    for (const item of classes) expect(classRows.some(text => text.includes(getClassOptionLabel(item, classes)))).toBe(true);
    await capture('Classes', listbox);

    stage = 'Students';
    await navigate('students', /^Élèves$/);
    const studentSelect = page.getByRole('combobox', { name: 'Filtrer par classe' });
    await assertOptions(studentSelect, classes);
    await capture('Students', studentSelect);

    stage = 'Attendance';
    await navigate('attendance', /^Présences$/);
    await assertOptions(classSelect(), classes);
    await capture('Attendance', classSelect());

    stage = 'Grades';
    await navigate('grades', /^Notes & Bulletins$/);
    const ranking = page.getByRole('button', { name: /Palmarès/ });
    if (await ranking.isVisible()) await ranking.click();
    else {
      await expect(page.getByRole('button', { name: 'Saisir des Notes' })).toBeEnabled();
      await page.getByRole('button', { name: 'Saisir des Notes' }).click();
      for (const label of ['Année Scolaire', 'Période']) {
        const select = page.locator('.form-group').filter({ has: page.locator('label').filter({ hasText: new RegExp(`^${label}$`) }) }).locator('select');
        await expect(select).toBeVisible();
        if (!(await select.inputValue())) {
          const option = await select.locator('option').evaluateAll(options => options.find(item => item.value && !item.disabled)?.value);
          expect(Boolean(option), `Existing ${label} required; never create one`).toBe(true);
          await select.selectOption(option!);
        }
      }
    }
    await assertOptions(classSelect(), classes, true);
    await capture('Grades', classSelect());

    stage = 'ReportCards';
    await navigate('report-cards', /^Bulletins scolaires$/);
    const reportSelect = page.getByTestId('report-card-class');
    await assertOptions(reportSelect, classes);
    await capture('ReportCards', reportSelect);

    stage = 'Pedagogy';
    await navigate('pedagogy', /^Pilotage pédagogique$/);
    await navigate('pedagogy/planning', /^Planification hebdomadaire$/);
    const pedagogySelect = page.getByRole('combobox', { name: 'Classe', exact: true });
    await assertOptions(pedagogySelect, classes.filter(item => item.isActive !== false));
    await capture('Pedagogy', pedagogySelect);
    expect(pageErrors, 'No uncaught UI error').toEqual([]);
    expect(consoleErrors, 'No unexpected console error').toEqual([]);
    expect(violations, 'No attempted business mutation or Production access').toEqual([]);
    expect(stagingReads, 'UI actually reads authenticated ecoscolaire-staging data').toBeGreaterThan(0);
    report.overall = 'PASS';
  } catch (error) {
    failure = new Error(redactReadOnlyError(error, { ...process.env, TEST_ID_TOKEN: idToken }));
    report.overall = 'FAIL'; report.failedStage = stage;
  } finally {
    await context.close();
    if (reader && before) {
      try {
        const after = await reader.snapshot();
        report.before = before; report.after = after;
        if (fingerprint(before) !== fingerprint(after)) { failure = new Error('TEST school data changed during read-only validation'); report.overall = 'FAIL'; }
      } catch { failure = new Error('Post-smoke TEST school read-only comparison failed'); report.overall = 'FAIL'; }
    }
    report.auditRequestsBlocked = auditRequestsBlocked;
    report.stagingReads = stagingReads;
    report.businessWrites = 0;
    report.productionRequests = 0;
    report.violations = violations;
    report.consoleErrorCount = consoleErrors.length;
    report.pageErrorCount = pageErrors.length;
    // No identities, business fields, credentials, or screenshots leave the runner.
    console.log(`MATERNELLE_READONLY_RESULT ${JSON.stringify(report)}`);
  }
  if (failure) throw failure;
});

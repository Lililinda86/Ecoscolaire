import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { initializeApp, applicationDefault, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { chromium, expect } from '@playwright/test';

const project = 'ecoscolaire-staging';
assert.equal(process.env.VITE_FIREBASE_PROJECT_ID, project);
assert.equal(process.env.TARGET_DEPLOYMENT_VERIFIED, 'true');
assert.match(process.env.EXPECTED_STAGING_SHA || '', /^[a-f0-9]{40}$/);
const runId = process.env.ALL_FEES_RUN_ID || '';
assert.match(runId, /^\d+-\d+$/);
const origin = new URL(process.env.STAGING_APP_URL).origin;
assert.match(origin, /^https:\/\/ecoscolaire-[a-z0-9]+-linda-lemofouet-s-projects\.vercel\.app$/);
assert.ok(process.env.VITE_FIREBASE_API_KEY);
const schoolId = `globalsettings-staging-${runId}`;
const yearId = `${schoolId}-year`, year = '2026-2027';
const app = initializeApp({ projectId: project, credential: applicationDefault() }, schoolId);
const db = getFirestore(app), auth = getAuth(app);
const tagged = { testFixture: true, testRunId: runId };
const users = {}, refs = [], students = {};
let browser;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const pass = label => console.log(`${label}: PASS`);
async function seed(collection, id, data) {
  const ref = db.collection(collection).doc(id);
  refs.push(ref);
  await ref.create({ ...data, ...tagged });
}
async function makeUser(role, foreign = false) {
  const password = randomBytes(32).toString('base64url') + '!aA1';
  const email = `allfees-${role}-${runId}${foreign ? '-foreign' : ''}@staging.ecoscolaire.test`;
  const user = await auth.createUser({ email, password, emailVerified: true });
  const record = { uid: user.uid, email, password };
  users[foreign ? 'foreign' : role] = record;
  await seed('users', user.uid, { id: user.uid, email, name: `Validation ${role}`, role, schoolId: foreign ? `${schoolId}-foreign` : schoolId, active: true, isActive: true });
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.VITE_FIREBASE_API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, returnSecureToken: true })
  });
  const body = await response.json();
  assert.equal(response.ok, true, 'Test identity sign-in failed');
  assert.ok(body.idToken);
  record.token = body.idToken;
}
async function call(name, data, role = 'secretary') {
  const response = await fetch(`https://us-central1-${project}.cloudfunctions.net/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${users[role].token}` },
    body: JSON.stringify({ data: { schoolId, ...data } })
  });
  assert.notEqual(response.status, 404, `${name} must be deployed`);
  const body = await response.json();
  if (!response.ok || body.error) {
    const error = new Error(`${name}: ${body.error?.message || response.status}`);
    error.status = body.error?.status;
    throw error;
  }
  return body.result;
}
const account = studentId => call('getStudentFinancialAccount', { studentId, academicYear: year, monthlyTransport: true });
const denied = promise => assert.rejects(promise, error => error.status === 'PERMISSION_DENIED');

try {
  await seed('schools', schoolId, { id: schoolId, name: 'Validation tous frais Staging', academicYear: year, activeAcademicYearId: yearId,
    feeCatalog: [{ id: 'legacy-test', label: 'Frais historique TEST', amount: 2500, cycles: ['secondary'], active: true }],
    active: true, subscriptionStatus: 'active', studentsCount: 6, studentLimit: 30,
    classFees: Object.fromEntries(['Maternelle Petite Section', 'Maternelle Moyenne Section', 'CP', 'Form 1'].map(name => [name, { registration: 15000, tuition: 150000, t1: 60000, t2: 50000, t3: 40000 }])),
    globalFees: { feeT1: 0, feeT2: 0, feeT3: 0, feeTransport: 0, feeUniforms: 0 }, transportPolicy: { secretaryManageAll: false, pkRates: { pk14To33: 4000, pk34To42: 5000 }, feePolicyId: 'ITALO_PK_2026', billingPeriods: ['2026-09', '2026-10', '2026-11'] } });
  await seed('academicYears', yearId, { schoolId, name: year, status: 'active', startDate: '2026-09-01', endDate: '2027-06-30', version: 1, tuitionPaymentDeadlines: { T1: '2026-09-05', T2: '2027-01-10', T3: '2027-04-10' } });
  await makeUser('owner'); await makeUser('secretary'); await makeUser('director'); await makeUser('secretary', true);
  for (const [cycle, name] of [['nursery', 'Maternelle Petite Section'], ['primary', 'CP'], ['secondary', 'Form 1']]) {
    const classId = `${schoolId}-${cycle}`;
    await seed('classes', classId, { id: classId, schoolId, name, cycle, level: cycle, academicYearId: yearId });
    for (const pk of [18, 36]) {
      const id = `${classId}-${pk}`; students[`${cycle}${pk}`] = id;
      await seed('students', id, { id, schoolId, classId, academicYearId: yearId, academicYear: year, usesTransport: cycle === 'primary',
        name: `ALLFEES ${cycle} PK${pk}`, matricule: `AF-${cycle}-${pk}`, schoolingStatus: 'active', gender: 'M', section: 'francophone' });
      await seed('studentPrivate', id, { id, studentId: id, schoolId, transportZonePk: pk });
      await seed('studentFinance', id, { id, studentId: id, schoolId, registrationFeeExpected: 15000, registrationFeePaid: 0, feeT1: 0, feeT2: 0, feeT3: 0 });
      const before = await account(id);
      if (cycle !== 'primary') assert.equal(before.lines.some(line => line.type === 'transport'), false);
      const plan = await call('setStudentTransportPlan', { studentId: id, usesTransport: true });
      assert.equal((await db.collection('studentPrivate').doc(id).get()).data().transportZonePk, pk);
      const amount = cycle === 'secondary' ? 0 : pk === 18 ? 4000 : 5000;
      assert.equal(plan.monthlyGrossAmount, amount);
      const lines = (await account(id)).lines.filter(line => line.type === 'transport');
      if (cycle === 'secondary') assert.equal(lines.length, 0);
      else {
        assert.ok(lines.length > 0); assert.ok(lines.every(line => line.grossExpectedAmount === amount));
        if (cycle === 'nursery') assert.ok(lines.every(line => line.period >= plan.effectivePeriod));
      }
      pass(`${cycle.toUpperCase()} PK${pk}`);
    }
  }
  for (const [key, name, active] of [['ms', 'Maternelle Moyenne Section', true], ['gs', 'Maternelle Grande Section', true], ['en', 'Nursery 2', true], ['old', 'Maternelle 2', false]]) {
    await seed('classes', `${schoolId}-${key}`, { schoolId, name, cycle: 'nursery', academicYearId: yearId, isActive: active });
  }
  students.nurseryMS = `${schoolId}-ms-student`;
  await seed('students', students.nurseryMS, { schoolId, classId: `${schoolId}-ms`, academicYearId: yearId, academicYear: year, usesTransport: false, name: 'ALLFEES Maternelle MS', matricule: 'AF-MS', schoolingStatus: 'active', gender: 'F', section: 'francophone' });
  await seed('studentPrivate', students.nurseryMS, { schoolId, studentId: students.nurseryMS, transportZonePk: null });
  await seed('studentFinance', students.nurseryMS, { schoolId, studentId: students.nurseryMS, registrationFeeExpected: 15000 });
  assert.equal((await account(students.nurseryMS)).lines.find(l => l.key === 'tuition:T1').grossExpectedAmount, 60000);
  const studentId = students.primary18;
  await denied(call('getStudentFinancialAccount', { studentId, academicYear: year }, 'foreign'));

  await seed('grades', `${schoolId}-legacy-grade`, { id: `${schoolId}-legacy-grade`, schoolId, studentId, subjectId: 'legacy-test', date: '2025-10-01', score: 12, maxScore: 20, status: 'legacy' });
  const legacyGrade = (await db.collection('grades').doc(`${schoolId}-legacy-grade`).get()).data();
  browser = await chromium.launch({ headless: true });
  const errors = [];
  async function login(role) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('dialog', dialog => dialog.accept());
    if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) await page.route(`${origin}/**`, route => route.continue({ headers: { ...route.request().headers(), 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET, 'x-vercel-set-bypass-cookie': 'true' } }));
    await page.goto(`${origin}/#/login`);
    await page.getByTestId('login-email').fill(users[role].email);
    await page.getByTestId('login-password').fill(users[role].password);
    await page.getByTestId('login-submit').click();
    await page.getByTestId('sidebar').waitFor({ timeout: 45000 });
    await page.goto(`${origin}/#/settings`);
    return page;
  }
  const owner = await login('owner');
  const nav = (page, name) => page.getByRole('navigation', { name: 'Sections des paramètres' }).getByRole('button', { name, exact: true }).click();
  await nav(owner, 'Établissement');
  const field = text => owner.locator('label').filter({ hasText: text }).filter({ has: owner.locator('xpath=following-sibling::input') }).locator('xpath=following-sibling::input').first();
  const fields = [["Nom de l'école",'name','UX établissement TEST'], ['Numéro d\'Agrément','accreditationNumber','UX-AGREMENT'], ['Téléphone Officiel','phone','+237600000000'], ['Email Officiel','email','ux@example.test'], ['Adresse Complète','address','Adresse synthétique PK18'], ['Fondateur / Promoteur','founderName','Fondateur TEST'], ['Directeur maternelle et primaire','directorName','Direction TEST'], ['Principal du secondaire','principalName','Principal TEST'], ['Nom officiel maternelle','cycleNames.nursery','Maternelle TEST'], ['Nom officiel primaire','cycleNames.primary','Primaire TEST'], ['Nom officiel secondaire','cycleNames.secondary','Secondaire TEST'], ['Agrément maternelle','cycleAccreditationNumbers.nursery','N-TEST'], ['Agrément primaire','cycleAccreditationNumbers.primary','P-TEST'], ['Agrément secondaire','cycleAccreditationNumbers.secondary','S-TEST']];
  const schoolBefore = (await db.collection('schools').doc(schoolId).get()).data();
  const classBefore = (await db.collection('classes').where('schoolId','==',schoolId).get()).docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.id.localeCompare(b.id));
  for (const [label,,value] of fields) await field(label).fill(value);
  const institution = owner.locator('details').filter({ has: owner.locator('#institution') }).first();
  for (const cycle of ['Maternelle','Primaire','Secondaire']) await institution.getByRole('checkbox',{name:cycle,exact:true}).check();
  await nav(owner,'Politiques');
  await owner.locator('#secretaryManageAllTransport').check();
  await owner.getByRole('button',{name:'Enregistrer les modifications',exact:true}).click();
  await expect.poll(async()=> (await db.collection('schools').doc(schoolId).get()).data().name).toBe('UX établissement TEST');
  const saved = (await db.collection('schools').doc(schoolId).get()).data();
  for (const [,key,value] of fields) assert.equal(key.split('.').reduce((v,k)=>v[k],saved),value);
  assert.deepEqual(saved.classFees,schoolBefore.classFees);
  assert.deepEqual(saved.feeCatalog,schoolBefore.feeCatalog);
  assert.equal(saved.transportPolicy.secretaryManageAll,true);
  await owner.reload(); await nav(owner,'Établissement');
  for (const [label,,value] of fields) await expect(field(label)).toHaveValue(value);
  await expect(field('Année Scolaire')).toHaveValue(year);
  pass('ESTABLISHMENT ALL FIELDS / OWNER SAVE / RELOAD / GOVERNANCE / POLICY / EXISTING TARIFFS PRESERVED');
  await owner.locator('input[type=file]').setInputFiles({ name:'test.png', mimeType:'image/png', buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1sAAAAASUVORK5CYII=','base64') });
  await expect.poll(async()=> (await db.collection('schools').doc(schoolId).get()).data().logoUrl || '').toMatch(/^data:image\/png;base64,/);
  await expect(owner.getByAltText('Aperçu du logo')).toBeVisible();
  await owner.getByRole('button',{name:'Supprimer le logo',exact:true}).click();
  await expect.poll(async()=> (await db.collection('schools').doc(schoolId).get()).data().logoUrl).toBeNull();
  pass('LOGO UPLOAD / AUTO SAVE / PREVIEW / REMOVE');
  await owner.getByRole('button',{name:'Gérer les années et périodes',exact:true}).click();
  await expect(owner).toHaveURL(`${origin}/#/academic-periods`);
  await expect(owner.getByTestId('academic-periods-page')).toBeVisible({timeout:30000});
  assert.deepEqual((await db.collection('grades').doc(`${schoolId}-legacy-grade`).get()).data(),legacyGrade);
  await owner.goto(`${origin}/#/settings`);
  pass('NEW YEAR ACTION OPENS CANONICAL CALENDAR / EXISTING LEGACY GRADE UNCHANGED');

  await nav(owner,'Année académique');
  await owner.getByRole('button',{name:'Modifier les dates',exact:true}).click();
  const yearModal=owner.locator('div').filter({has:owner.getByRole('heading',{name:"Modifier les dates de l'année scolaire",exact:true})}).filter({has:owner.getByRole('button',{name:'Enregistrer',exact:true})}).last();
  await yearModal.locator('input[type=date]').nth(0).fill('2026-08-25');
  await yearModal.locator('input[type=date]').nth(1).fill('2027-07-05');
  await yearModal.getByRole('button',{name:'Enregistrer',exact:true}).click();
  await expect.poll(async()=> (await db.collection('academicYears').doc(yearId).get()).data().startDate).toBe('2026-08-25');
  await owner.getByTestId('add-academic-period').click();
  await owner.locator('#periodNameInput').fill('UX Trimestre');
  await owner.locator('#periodStartDateInput').fill('2026-09-01');
  await owner.locator('#periodEndDateInput').fill('2026-12-15');
  await owner.getByTestId('save-academic-period').click();
  await expect(owner.locator('#periodNameInput')).toHaveCount(0,{timeout:30000});
  const periods=await db.collection('periods').where('schoolId','==',schoolId).get(); assert.equal(periods.size,1);
  const periodId=periods.docs[0].id;
  await owner.getByTestId(`edit-period-${periodId}`).click();
  await owner.locator('#periodNameInput').fill('UX Trimestre modifié');
  await owner.getByTestId('save-academic-period').click();
  await expect(owner.locator('#periodNameInput')).toHaveCount(0,{timeout:30000});
  await owner.getByTestId(`open-period-${periodId}`).click();
  await expect(owner.getByTestId(`close-period-${periodId}`)).toBeVisible({timeout:30000});
  assert.equal((await db.collection('academicYears').doc(yearId).get()).data().openPeriodId,periodId);
  await owner.getByTestId(`close-period-${periodId}`).click();
  await expect.poll(async()=> (await db.collection('periods').doc(periodId).get()).data().status).toBe('closed');
  assert.equal((await db.collection('periods').doc(periodId).get()).data().name,'UX Trimestre modifié');
  pass('ACADEMIC YEAR BOUNDS / PERIOD CREATE EDIT OPEN CLOSE / CANONICAL YEAR LINK');
  await owner.goto(`${origin}/#/grades`);
  await expect(owner.getByTestId('grades-configuration-required')).toContainText('Aucune période ouverte');
  await owner.goto(`${origin}/#/report-cards`);
  await owner.getByTestId('report-card-year').selectOption(yearId);
  await owner.getByTestId('report-card-period').selectOption(periodId);
  await expect(owner.getByTestId('report-card-period')).toHaveValue(periodId);
  pass('CLOSED PERIOD BLOCKS NEW GRADING / REMAINS AVAILABLE FOR REPORT CARDS');
  await owner.goto(`${origin}/#/pedagogy/planning`);
  await owner.getByRole('button',{name:'Initialiser les semaines',exact:true}).click();
  await expect(owner.getByText('Semaines prêtes.',{exact:true})).toBeVisible({timeout:30000});
  const weeks=await db.collection('teachingWeeks').where('schoolId','==',schoolId).get();
  assert.ok(weeks.size>0);
  for(const item of weeks.docs) {
    assert.equal(item.data().academicYearId,yearId);
    assert.ok(item.data().weekStartDate>='2026-08-25' && item.data().weekStartDate<='2027-07-05');
  }
  assert.ok(weeks.docs.some(item=>item.data().periodId===periodId));
  await owner.getByRole('button',{name:'Initialiser les semaines',exact:true}).click();
  await expect.poll(async()=> (await db.collection('teachingWeeks').where('schoolId','==',schoolId).get()).size).toBe(weeks.size);
  pass('PEDAGOGY WEEKS USE YEAR BOUNDS AND PERIOD IDS / NO DUPLICATES');


  await denied(call('manageAcademicPeriod',{action:'OPEN',schoolId,academicYearId:yearId,periodId}));
  const director=await login('director'); await nav(director,'Établissement');
  await expect(director.getByRole('button',{name:'Enregistrer les modifications',exact:true})).toBeDisabled();
  await expect(director.locator('input[name=new-admin-pin]')).toHaveCount(0);
  await nav(director,'Finances & tarifs');
  for (const [key,label] of [['T1','1re'],['T2','2e'],['T3','3e']]) await expect(director.getByLabel(`Échéance ${label} tranche`,{exact:true})).toHaveValue((await db.collection('academicYears').doc(yearId).get()).data().tuitionPaymentDeadlines[key]);
  await director.getByText('Créer un nouveau frais',{exact:true}).click();
  for (const type of ['uniform','sports_uniform','ceremony_uniform','other_uniform','activity_kit','event','excursion','school_trip','cultural_activity','activity','photo','supplies','books','canteen','childcare','contribution','other','exam','exceptional']) {
    await director.getByLabel('Type de frais').selectOption(type);
    await expect(director.getByLabel('Type de frais')).toHaveValue(type);
  }
  pass('ALL 19 CATALOGUE TYPE CHOICES');
  await director.getByLabel('Type de frais').selectOption('exam');
  await director.getByLabel('Libellé précis du frais',{exact:true}).fill('UX-VALIDATION-FEE');
  await director.getByLabel('Montant (FCFA)',{exact:true}).fill('4321');
  await director.getByRole('combobox',{name:'Périodicité',exact:true}).selectOption('recurring');
  await director.getByRole('combobox',{name:'Périodicité',exact:true}).selectOption('one_off');
  const mandatory=director.getByRole('checkbox',{name:'Obligatoire pour les élèves concernés',exact:true});
  await mandatory.uncheck(); await mandatory.check();
  const cycles=director.getByRole('group',{name:'Cycles concernés',exact:true}), classes=director.getByRole('group',{name:'Classes concernées',exact:true}), pupils=director.getByRole('group',{name:'Élèves concernés',exact:true});
  for (const [cycle,names,count] of [['Maternelle',['Maternelle Petite Section','Maternelle Moyenne Section','Maternelle Grande Section','Nursery 2'],3],['Primaire',['CP'],2],['Secondaire',['Form 1'],2]]) {
    await cycles.getByRole('checkbox',{name:cycle,exact:true}).check();
    await expect(classes.getByRole('checkbox')).toHaveCount(names.length+1);
    for (const name of names) await expect(classes.getByRole('checkbox',{name,exact:true})).toBeVisible();
    await expect(pupils.getByRole('checkbox')).toHaveCount(count+1);
    await cycles.getByRole('checkbox',{name:cycle,exact:true}).uncheck();
  }
  await cycles.getByRole('button',{name:'Tout sélectionner — cycles',exact:true}).click();
  await classes.getByRole('checkbox',{name:'Tout sélectionner — classes',exact:true}).check();
  await pupils.getByRole('checkbox',{name:'Tout sélectionner — élèves',exact:true}).check();
  await pupils.getByRole('button',{name:'Tout désélectionner — élèves',exact:true}).click();
  await classes.getByRole('button',{name:'Tout désélectionner — classes',exact:true}).click();
  await cycles.getByRole('button',{name:'Tout désélectionner — cycles',exact:true}).click();
  await cycles.getByRole('checkbox',{name:'Primaire',exact:true}).check();
  await classes.getByRole('searchbox').fill('CP'); await classes.getByRole('checkbox',{name:'CP',exact:true}).check();
  await pupils.getByRole('searchbox').fill('AF-primary-18');
  await pupils.getByRole('checkbox',{name:'ALLFEES primary PK18 — AF-primary-18',exact:true}).check();
  await director.getByRole('button',{name:'Vérifier avant publication',exact:true}).click();
  await director.getByRole('button',{name:'Publier le frais',exact:true}).click();
  await expect.poll(async()=> (await db.collection('schools').doc(schoolId).get()).data().feeCatalog.some(f=>f.label==='UX-VALIDATION-FEE')).toBe(true);
  const fee=(await db.collection('schools').doc(schoolId).get()).data().feeCatalog.find(f=>f.label==='UX-VALIDATION-FEE');
  const line=(await account(studentId)).lines.find(l=>l.feeId===fee.id);
  assert.equal(line.grossExpectedAmount,4321); assert.equal(line.netExpectedAmount,4321); assert.equal(line.previousPaid,0); assert.equal(line.remainingBalance,4321);
  for(const id of Object.values(students).filter(id=>id!==studentId)) assert.equal((await account(id)).lines.some(l=>l.feeId===fee.id),false);
  const secretary=await login('secretary');
  await expect(secretary.getByText('Créer un nouveau frais',{exact:true})).toHaveCount(0);
  await secretary.goto(`${origin}/#/payments`); await secretary.getByTestId('open-cash-payment').click();
  await secretary.getByTestId('cash-payment-student').selectOption(studentId);
  const amount=secretary.getByLabel('Montant reçu pour UX-VALIDATION-FEE',{exact:true});
  await amount.waitFor({state:'attached',timeout:30000});
  const group=amount.locator('xpath=ancestor::details[contains(@class,"account-fee-group")]');
  if(await group.count() && await group.getAttribute('open')===null) await group.locator('summary').click();
  await expect(amount).toBeVisible({timeout:30000});
  // Verify displayed due/paid/remaining values in the fee's own card.
  const card=secretary.locator('.obligation-values').filter({hasText:/4[\s\u00a0\u202f]?321/});
  await expect(card).toContainText('Montant dû'); await expect(card).toContainText('Déjà payé'); await expect(card).toContainText('Reste à payer');
  await expect(card.locator('span').filter({hasText:'Déjà payé'})).toContainText(/0\s*FCFA/);
  await secretary.screenshot({path:'all-fees-global-unpaid.png',fullPage:true});
  await secretary.getByTestId('cash-payment-student').selectOption(students.primary36);
  await expect(amount).toHaveCount(0,{timeout:30000});
  pass('UX-VALIDATION-FEE PUBLICATION / EXACT TARGET / LABEL AMOUNT DUE PAID REMAINING / NO PAYMENT');
  const feeRow=director.locator('.school-fee-list li').filter({has:director.getByText('UX-VALIDATION-FEE',{exact:true})});
  await feeRow.getByRole('button',{name:'Modifier le frais',exact:true}).click();
  await director.getByLabel('Montant (FCFA)',{exact:true}).fill('5000');
  await director.getByLabel('Description',{exact:true}).fill('Révision synthétique sans paiement');
  await director.getByLabel('Motif de la modification du frais').fill('Validation du versionnement');
  await director.getByRole('button',{name:'Vérifier avant publication',exact:true}).click();
  await director.getByRole('button',{name:'Publier les modifications',exact:true}).click();
  await expect(feeRow).toContainText('Révision synthétique sans paiement');
  assert.deepEqual((await account(studentId)).lines.find(l=>l.feeId===fee.id),line);
  await feeRow.getByRole('button',{name:'Désactiver les nouvelles affectations',exact:true}).click();
  await expect(feeRow).toContainText('INACTIF');
  assert.deepEqual((await account(studentId)).lines.find(l=>l.feeId===fee.id),line);
  pass('FEE REVISION / VERSIONING / DEACTIVATION / ESTABLISHED DEBT UNCHANGED');
  await director.getByRole('button', { name: 'Ajouter un frais', exact: true }).click();
  await director.getByLabel('Type de frais').selectOption('excursion');
  await director.getByLabel('Libellé précis du frais', { exact: true }).fill('UX-VALIDATION-FEE-OPTIONAL');
  await director.getByLabel('Montant (FCFA)', { exact: true }).fill('2000');
  await director.getByLabel('Obligatoire pour les élèves concernés').uncheck();
  await cycles.getByRole('checkbox', { name: 'Maternelle', exact: true }).check();
  await classes.getByRole('checkbox', { name: 'Maternelle Moyenne Section', exact: true }).check();
  await director.getByRole('button', { name: 'Vérifier avant publication', exact: true }).click();
  await director.getByRole('button', { name: 'Publier le frais', exact: true }).click();
  await expect.poll(async () => (await db.collection('schools').doc(schoolId).get()).data().feeCatalog.some(f => f.label === 'UX-VALIDATION-FEE-OPTIONAL')).toBe(true);
  const optionalFee = (await db.collection('schools').doc(schoolId).get()).data().feeCatalog.find(f => f.label === 'UX-VALIDATION-FEE-OPTIONAL');
  assert.equal((await account(students.nurseryMS)).lines.some(l => l.feeId === optionalFee.id), false);
  await director.getByRole('combobox', { name: 'Frais facultatif', exact: true }).selectOption(optionalFee.id);
  const eligibleOptional = director.getByRole('combobox', { name: 'Élève concerné', exact: true });
  await expect(eligibleOptional.locator('option')).toHaveCount(2);
  await eligibleOptional.selectOption(students.nurseryMS);
  await director.getByRole('button', { name: 'Affecter à l’élève', exact: true }).click();
  await expect.poll(async () => (await account(students.nurseryMS)).lines.find(l => l.feeId === optionalFee.id)?.grossExpectedAmount).toBe(2000);
  assert.equal((await account(students.nursery18)).lines.some(l => l.feeId === optionalFee.id), false);
  pass('OPTIONAL FEE UI / NO AUTOMATIC DEBT / FILTERED EXPLICIT ASSIGNMENT');
  assert.deepEqual((await db.collection('classes').where('schoolId','==',schoolId).get()).docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>a.id.localeCompare(b.id)),classBefore);
  for(const collection of ['payments','receipts']) assert.equal((await db.collection(collection).where('schoolId','==',schoolId).get()).size,0);
  assert.deepEqual((await db.collection('grades').doc(`${schoolId}-legacy-grade`).get()).data(),legacyGrade);
  assert.deepEqual(errors,[]);
  await owner.goto(`${origin}/#/settings`); await nav(owner,'Établissement');
  await owner.screenshot({path:'all-fees-global-owner.png',fullPage:true});
  pass('GLOBAL SETTINGS / NO CLASS DUPLICATE / PAYMENT AND RECEIPT WRITES ZERO');
} finally {
  if (browser) await browser.close();
  const collections = ['studentFinancialObligations', 'studentFeeAssignments', 'studentTransportPlans', 'financialBenefits', 'paymentMoratoriums', 'payments', 'receipts',
    'paymentAllocations', 'transportPaymentAllocations', 'audit_logs', 'cashLedgerDays', 'cashClosures', 'studentPrivate', 'studentFinance',
    'studentParentPrivate', 'studentParentFinance', 'students', 'classes', 'grades', 'periods', 'teachingWeeks', 'academicYears'];
  // Allow fixture-only async projections to finish, then remove only this run's school data.
  await pause(5000);
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const collection of collections) {
      const docs = await db.collection(collection).where('schoolId', '==', schoolId).get();
      for (const doc of docs.docs) { assert.equal(doc.data().schoolId, schoolId); await doc.ref.delete(); }
    }
    await pause(2000);
  }
  await db.collection('counters').doc(`receipts_${schoolId}`).delete();
  const versions = db.collection('schools').doc(schoolId).collection('financialTariffVersions');
  for (const version of (await versions.get()).docs) await version.ref.delete();
  assert.equal((await versions.get()).size, 0);
  for (const ref of refs.reverse()) {
    const snap = await ref.get();
    if (snap.exists) { assert.equal(snap.data().testRunId, runId); await ref.delete(); }
  }
  for (const user of Object.values(users)) await auth.deleteUser(user.uid);
  for (const collection of collections) assert.equal((await db.collection(collection).where('schoolId', '==', schoolId).get()).size, 0, collection);
  for (const user of Object.values(users)) await assert.rejects(auth.getUser(user.uid), error => error.code === 'auth/user-not-found');
  console.log('CLEANUP: PASS\nRESIDUALS: 0 (isolated test school)\nORPHANS: 0 (isolated test school)\nPRODUCTION TOUCHED: NO');
  await deleteApp(app);
}



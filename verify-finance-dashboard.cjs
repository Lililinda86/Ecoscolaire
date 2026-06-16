const { chromium } = require('playwright');

async function run() {
    console.log("Starting Finance Dashboard UI Verification...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Login as Owner
    console.log("\n--- LOGIN ---");
    await page.goto('http://localhost:5174/');
    await page.waitForTimeout(2000);
    
    await page.fill('input[type="email"]', 'owner.alpha@ecoscolaire.com');
    await page.fill('input[type="password"]', 'Test@2026Alpha!');
    await page.click('button:has-text("Se connecter")');
    await page.waitForTimeout(5000);
    
    await page.goto('http://localhost:5174/#/payments');
    await page.waitForTimeout(3000);
    
    // 1. Check Finance Mobile Money Tab
    console.log("\n--- TEST ONGLET FINANCE ---");
    try {
        await page.waitForSelector('button:has-text("Finance Mobile Money")', { timeout: 10000 });
        console.log("SUCCESS: Onglet 'Finance Mobile Money' trouvé.");
    } catch (e) {
        console.error("FAIL: L'onglet 'Finance Mobile Money' n'est pas apparu après 10s.");
        await page.screenshot({ path: 'verify-finance-error.png' });
        process.exit(1);
    }
    
    const financeBtn = await page.$('button:has-text("Finance Mobile Money")');
    await financeBtn.click();
    await page.waitForTimeout(2000);
    console.log("SUCCESS: Onglet cliqué avec succès.");

    // 2. Check KPIs
    console.log("\n--- TEST KPIs ---");
    const kpiLabels = [
        'Total Encaissé CASH',
        'Total Encaissé MoMo',
        'Reçus Générés',
        'Tx SUCCESS',
        'Tx PENDING',
        'Tx FAILED'
    ];

    for (const label of kpiLabels) {
        const hasKpi = await page.$(`text="${label}"`);
        if (hasKpi) {
            console.log(`SUCCESS: KPI '${label}' affiché.`);
        } else {
            console.error(`FAIL: KPI '${label}' manquant.`);
        }
    }

    // 3. Check Audit Block
    console.log("\n--- TEST AUDIT COMPTABLE ---");
    const auditTextContent = await page.textContent('body');
    const hasAudit = auditTextContent.includes("Anomalies Comptables");
    const hasNoAnomalies = auditTextContent.includes("Aucune anomalie comptable");
    
    if (hasAudit || hasNoAnomalies) {
        console.log("SUCCESS: Bloc d'audit affiché correctement.");
    } else {
        console.error("FAIL: Le bloc d'audit (Anomalies) est introuvable.");
    }

    // 4. Test CSV Export
    console.log("\n--- TEST EXPORT CSV ---");
    const exportBtn = await page.$('button:has-text("Exporter CSV")');
    if (exportBtn) {
        console.log("SUCCESS: Bouton 'Exporter CSV' visible.");
        try {
            const [download] = await Promise.all([
                page.waitForEvent('download', { timeout: 10000 }),
                exportBtn.click()
            ]);
            const path = await download.path();
            const suggestedName = download.suggestedFilename();
            console.log(`SUCCESS: Fichier CSV généré et téléchargé vers ${path} (${suggestedName})`);
        } catch (err) {
            console.error("FAIL: Erreur lors du téléchargement du CSV.", err.message);
        }
    } else {
        console.error("FAIL: Bouton 'Exporter CSV' introuvable.");
    }

    await browser.close();
    console.log("\n--- FIN DU TEST UI ---");
}

run().catch(console.error);

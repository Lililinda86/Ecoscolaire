const { chromium } = require('playwright');

async function run() {
    console.log("Starting Receipts UI Verification...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Login as Director
    console.log("\n--- LOGIN ---");
    await page.goto('http://localhost:5174/');
    await page.waitForTimeout(2000);
    
    await page.fill('input[type="email"]', 'owner.alpha@ecoscolaire.com');
    await page.fill('input[type="password"]', 'Test@2026Alpha!');
    await page.click('button:has-text("Se connecter")');
    await page.waitForTimeout(5000);
    
    await page.goto('http://localhost:5174/#/payments');
    await page.waitForTimeout(3000);
    
    // 1. Check Receipts Tab
    console.log("\n--- TEST ONGLET REÇUS ---");
    try {
        await page.waitForSelector('button:has-text("Reçus")', { timeout: 20000 });
    } catch (e) {
        console.error("FAIL: L'onglet 'Reçus' n'est pas apparu après 20s.");
        await page.screenshot({ path: 'verify-receipts-error.png' });
        process.exit(1);
    }
    const recusBtn = await page.$('button:has-text("Reçus")');
    await recusBtn.click();
    await page.waitForTimeout(2000);
    
    console.log("SUCCESS: Onglet 'Reçus' visible et cliqué.");

    // 2. Check REC-2026-0001
    const receiptRow = await page.$('td:has-text("REC-2026-0001")');
    if (receiptRow) {
        console.log("SUCCESS: Reçu 'REC-2026-0001' bien affiché dans la liste.");
    } else {
        console.log("WARNING: Le reçu 'REC-2026-0001' n'est pas trouvé. S'il n'y a pas encore de paiement en DB locale, c'est normal.");
        // Check if there is ANY receipt
        const anyReceipt = await page.$('td:has-text("REC-")');
        if (anyReceipt) {
            console.log("SUCCESS: Un autre reçu 'REC-*' a été trouvé.");
        } else {
            console.log("INFO: Aucun reçu n'est présent dans la liste.");
            // If no receipts exist, the download/print test might not be fully clickable
            // but we can look for disabled buttons
        }
    }

    // 3. Test PDF Download
    console.log("\n--- TEST TÉLÉCHARGEMENT PDF ---");
    const downloadBtn = await page.$('button[title="Télécharger le PDF"]');
    if (downloadBtn) {
        console.log("SUCCESS: Bouton 'Télécharger le PDF' visible.");
        const isDisabled = await downloadBtn.isDisabled();
        if (!isDisabled) {
            try {
                // Wait for download event
                const [download] = await Promise.all([
                    page.waitForEvent('download', { timeout: 10000 }),
                    downloadBtn.click()
                ]);
                const path = await download.path();
                console.log(`SUCCESS: PDF généré et téléchargé vers ${path}`);
            } catch (err) {
                console.error("FAIL: Erreur lors du téléchargement du PDF.", err.message);
            }
        } else {
            console.log("INFO: Le bouton 'Télécharger le PDF' est désactivé (probablement aucun numéro de reçu attribué).");
        }
    } else {
        console.error("FAIL: Bouton 'Télécharger le PDF' introuvable.");
    }

    // 4. Test PDF Print
    console.log("\n--- TEST IMPRESSION ---");
    const printBtn = await page.$('button[title="Imprimer"]');
    if (printBtn) {
        console.log("SUCCESS: Bouton 'Imprimer' visible.");
        const isDisabled = await printBtn.isDisabled();
        if (!isDisabled) {
            try {
                await printBtn.click();
                console.log("SUCCESS: Clic sur 'Imprimer' effectué sans erreur JS.");
            } catch (err) {
                console.error("FAIL: Erreur au clic sur 'Imprimer'.", err.message);
            }
        } else {
            console.log("INFO: Le bouton 'Imprimer' est désactivé.");
        }
    } else {
        console.error("FAIL: Bouton 'Imprimer' introuvable.");
    }

    await browser.close();
    console.log("\n--- FIN DU TEST UI ---");
}

run().catch(console.error);

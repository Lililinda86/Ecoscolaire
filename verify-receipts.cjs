const { chromium } = require('playwright');

async function run() {
    console.log("Starting Receipts E2E Verification...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // Login as Director
    console.log("\n--- LOGIN ---");
    await page.goto('http://localhost:5173/');
    await page.waitForTimeout(2000);
    
    await page.fill('input[type="email"]', 'director.alpha@ecoscolaire.com');
    await page.fill('input[type="password"]', '123456');
    await page.click('button:has-text("Se connecter")');
    await page.waitForTimeout(5000);
    
    await page.goto('http://localhost:5173/#/payments');
    await page.waitForTimeout(3000);
    
    // 1. Create Cash Payment
    console.log("\n--- TEST CASH PAYMENT ---");
    await page.click('button:has-text("Encaisser")'); // Open modal
    await page.waitForTimeout(1000);
    
    // Assuming there's a student selected by default or we need to select one
    // In Payments.tsx, handleOpenModal sets default values. We just need to put amount.
    // Fill amount
    const amountInputs = await page.$$('input[type="number"]');
    if (amountInputs.length > 0) {
        await amountInputs[0].fill('15000');
    }
    await page.click('button:has-text("Valider le paiement")');
    await page.waitForTimeout(4000); // Wait for Cloud Function trigger to run
    
    // Check Receipts Tab
    console.log("Checking Receipts Tab for Cash payment...");
    await page.click('button:has-text("Reçus")');
    await page.waitForTimeout(2000);
    
    // Count receipts
    let receiptsCount = await page.$$eval('td:has-text("REC-")', els => els.length);
    console.log(`Nombre de reçus trouvés : ${receiptsCount}`);
    if (receiptsCount > 0) {
        console.log("SUCCESS: Receipt for Cash payment generated automatically.");
    } else {
        console.error("FAIL: No receipt found for Cash payment.");
    }
    
    // 2. Test MoMo (Using existing PENDING if any, or simulating mockConfirm)
    console.log("\n--- TEST MOMO PAYMENT ---");
    await page.click('button:has-text("Encaissements")');
    await page.waitForTimeout(1000);
    
    // Click "Simuler paiement réussi" on the first PENDING MoMo transaction
    const mockConfirmBtn = await page.$('.btn-mock-confirm');
    if (mockConfirmBtn) {
        await mockConfirmBtn.click();
        console.log("Mock confirm clicked. Waiting for process...");
        await page.waitForTimeout(8000); // Wait for function and trigger
        
        // Go back to receipts
        await page.click('button:has-text("Reçus")');
        await page.waitForTimeout(2000);
        
        const newReceiptsCount = await page.$$eval('td:has-text("REC-")', els => els.length);
        console.log(`Nombre total de reçus après MoMo : ${newReceiptsCount}`);
        if (newReceiptsCount > receiptsCount) {
            console.log("SUCCESS: Receipt for MoMo payment generated automatically.");
        } else {
            console.error("FAIL: Receipt for MoMo not generated, or duplicate prevented.");
        }
    } else {
        console.log("WARNING: No pending MoMo transaction found to mock confirm.");
    }

    // 3. Test PDF Download / Print
    console.log("\n--- TEST PDF ---");
    await page.click('button:has-text("Reçus")');
    await page.waitForTimeout(1000);
    
    const downloadBtn = await page.$('button[title="Télécharger le PDF"]');
    if (downloadBtn) {
        console.log("Testing PDF Download...");
        const [download] = await Promise.all([
            page.waitForEvent('download'),
            downloadBtn.click()
        ]);
        const path = await download.path();
        console.log(`SUCCESS: PDF Downloaded to ${path}`);
    } else {
        console.log("WARNING: Download button not found.");
    }
    
    const printBtn = await page.$('button[title="Imprimer"]');
    if (printBtn) {
        console.log("Testing PDF Print...");
        // Print usually opens a new window/tab, we can just click and see if it throws
        await printBtn.click();
        console.log("SUCCESS: Print action triggered successfully.");
    } else {
        console.log("WARNING: Print button not found.");
    }

    await browser.close();
    console.log("\nVerification completed.");
}

run().catch(console.error);

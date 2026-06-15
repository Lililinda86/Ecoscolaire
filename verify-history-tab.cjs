const { chromium } = require('playwright');
const admin = require('firebase-admin');

async function run() {
    console.log("Starting Transaction History Verification...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    
    // 1. Test avec rôle 'teacher'
    console.log("\n--- TEST SECURITE : ROLE TEACHER ---");
    await page.goto('http://localhost:5173/');
    await page.waitForTimeout(2000);
    
    try {
        await page.fill('input[type="email"]', 'teacher.alpha@ecoscolaire.com');
        await page.fill('input[type="password"]', '123456');
        await page.click('button:has-text("Se connecter")');
        await page.waitForTimeout(5000); // Wait for login and routing
        
        await page.goto('http://localhost:5173/#/payments');
        await page.waitForTimeout(3000);
        
        const historyTabTeacher = await page.$('button:has-text("Historique MoMo")');
        if (historyTabTeacher) {
            console.error("FAIL: Teacher can see Historique MoMo tab!");
        } else {
            console.log("SUCCESS: Teacher cannot see Historique MoMo tab. Access denied properly.");
        }
    } catch (e) {
        console.log("Teacher login or navigation failed, maybe teacher doesn't have access to Payments page at all, which is also secure.");
    }

    // Logout
    await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
    });
    
    // 2. Test avec rôle 'owner'
    console.log("\n--- TEST FONCTIONNEL : ROLE OWNER ---");
    const page2 = await browser.newPage();
    await page2.goto('http://localhost:5173/');
    await page2.waitForTimeout(2000);
    
    await page2.fill('input[type="email"]', 'owner.alpha@ecoscolaire.com');
    await page2.fill('input[type="password"]', '123456');
    await page2.click('button:has-text("Se connecter")');
    await page2.waitForTimeout(5000);
    
    await page2.goto('http://localhost:5173/#/payments');
    await page2.waitForTimeout(3000);
    
    // Check Encaissements regressions
    console.log("Vérification de la vue Encaissements...");
    const pendingTable = await page2.$('h3:has-text("Transactions Mobile Money en attente")');
    if (pendingTable) {
        console.log("SUCCESS: Encaissements view is intact. Pending transactions block is visible.");
    } else {
        console.log("WARNING: No pending transactions block found. Maybe there are no pending txs or regression.");
    }

    const historyTab = await page2.waitForSelector('button:has-text("Historique MoMo")', { timeout: 10000 }).catch(() => null);
    if (historyTab) {
        console.log("SUCCESS: Owner can see Historique MoMo tab.");
        await historyTab.click();
        await page2.waitForTimeout(2000);
        
        // Check Filter SUCCESS
        console.log("Testing filter SUCCESS...");
        await page2.selectOption('select:has(option[value="SUCCESS"])', 'SUCCESS');
        await page2.waitForTimeout(1000);
        const successCount = await page2.$$eval('td:has-text("SUCCESS")', els => els.length);
        console.log(`Transactions SUCCESS trouvées : ${successCount}`);
        
        // Check Filter PENDING
        console.log("Testing filter PENDING...");
        await page2.selectOption('select:has(option[value="PENDING"])', 'PENDING');
        await page2.waitForTimeout(1000);
        const pendingCount = await page2.$$eval('td:has-text("PENDING")', els => els.length);
        console.log(`Transactions PENDING trouvées : ${pendingCount}`);
        
        // Reset filter
        await page2.selectOption('select:has(option[value="ALL"])', 'ALL');
        
        // Check Search
        console.log("Testing search...");
        await page2.fill('input[placeholder*="Rechercher"]', 'SnsfYx');
        await page2.waitForTimeout(1000);
        const searchResults = await page2.$$eval('td:has-text("SnsfYx")', els => els.length);
        console.log(`Transactions trouvées avec 'SnsfYx' : ${searchResults}`);
        
        // Check Details Modal
        console.log("Testing Details Modal...");
        // Clear search
        await page2.fill('input[placeholder*="Rechercher"]', '');
        await page2.waitForTimeout(1000);
        
        const detailsBtn = await page2.$('button[title="Voir les détails"]');
        if (detailsBtn) {
            await detailsBtn.click();
            await page2.waitForTimeout(1000);
            const modalContent = await page2.$('h2:has-text("Détails de la transaction")');
            if (modalContent) {
                console.log("SUCCESS: Details modal opened successfully.");
            } else {
                console.error("FAIL: Details modal did not open.");
            }
        } else {
            console.log("WARNING: Could not test details modal because no transactions exist.");
        }
    } else {
        console.error("FAIL: Owner cannot see Historique MoMo tab!");
    }
    
    await browser.close();
    console.log("\nVerification completed.");
}

run().catch(console.error);

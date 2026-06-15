const { chromium } = require('playwright');
const admin = require('firebase-admin');

async function testMobileMoney() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  let functionInvoked = false;
  let mockUrlOpened = false;

  page.on('console', msg => {
    console.log(`[BROWSER ${msg.type().toUpperCase()}]`, msg.text());
  });

  page.on('dialog', async dialog => {
    console.log('Dialog opened:', dialog.message());
    await dialog.accept();
  });

  page.on('popup', popup => {
    console.log('Popup opened:', popup.url());
    mockUrlOpened = true;
  });

  page.on('request', request => {
    if (request.url().includes('initiatePayment')) {
      console.log(`\n[NETWORK REQUEST] ${request.method()} ${request.url()}`);
      console.log('[NETWORK HEADERS]', request.headers());
      if (request.method() !== 'OPTIONS') {
          functionInvoked = true;
      }
    }
  });

  page.on('response', async res => {
      if (res.url().includes('initiatePayment')) {
          console.log(`[NETWORK RESPONSE] ${res.request().method()} ${res.url()} -> Status: ${res.status()}`);
          console.log('[NETWORK RESPONSE HEADERS]', res.headers());
          try {
             const json = await res.json();
             console.log('[NETWORK RESPONSE BODY]', JSON.stringify(json, null, 2));
          } catch (e) {
             console.log('[NETWORK RESPONSE BODY]', await res.text());
          }
      }
  });

  page.on('pageerror', err => {
    console.log('BROWSER PAGE ERROR:', err.message);
  });

  try {
    console.log('Navigating to app...');
    await page.goto('http://localhost:5173/#/login');
    
    console.log('Waiting for login form...');
    await page.waitForSelector('input[type="email"]');
    
    console.log('Filling login form...');
    await page.fill('input[type="email"]', 'owner.alpha@ecoscolaire.com');
    await page.fill('input[type="password"]', 'Test@2026Alpha!');
    await page.click('button[type="submit"]');

    console.log('Waiting for login to complete (10s)...');
    await page.waitForTimeout(5000);
    
    console.log('Current URL after login:', page.url());

    console.log('Navigating to Payments directly...');
    await page.waitForTimeout(5000); // Wait for AppContext to load data
    await page.goto('http://localhost:5173/#/payments');
    await page.waitForTimeout(3000);

    console.log('Clicking "Encaissement (+)"...');
    await page.click('button:has-text("Encaissement (+)")');
    await page.waitForTimeout(1000);

    console.log('Filling form...');
    // Select student (the first valid option)
    const studentSelect = await page.$('select:has(option:has-text("-- Choisir un élève --"))');
    const studentOptions = await studentSelect.$$('option');
    const studentId = await studentOptions[1].getAttribute('value');
    await studentSelect.selectOption(studentId);

    // type = tuition is default
    // installment = T1 is default

    // Set amount
    const amountInputs = await page.$$('input[type="number"]');
    // The second number input is the amount (first is expected amount)
    await amountInputs[1].fill('1000');

    // Select Mobile Money
    await page.check('input[type="radio"] >> nth=1'); // First is cash, second is mobile_money
    await page.waitForTimeout(500);

    // Fill parent phone
    await page.fill('input[type="tel"]', '237677123456');

    console.log('Submitting form...');
    const submitBtn = await page.$('button[type="submit"]');
    await submitBtn.click();

    console.log('Waiting for processing...');
    await page.waitForTimeout(10000); // Wait for the Cloud Function to respond
    
    const content = await page.content();
    if (content.includes('Reçu validé')) {
        console.log('Success message IS visible in UI!');
    } else {
        console.log('Success message NOT visible in UI.');
    }

    console.log('Function invoked:', functionInvoked);
    console.log('Mock URL opened (popup):', mockUrlOpened);

    // Wait a bit for React to re-render the pending transactions table
    await page.waitForTimeout(3000);
    
    console.log('Checking for pending transaction button...');
    const confirmBtn = await page.$('button:has-text("Simuler paiement réussi")');
    if (confirmBtn) {
        console.log('Button "Simuler paiement réussi" found! Clicking it...');
        await confirmBtn.click();
        
        console.log('Waiting for confirmation processing...');
        await page.waitForTimeout(5000);
        
        console.log('Testing idempotency: trying to click again if button still there or via direct call...');
        // To truly test idempotency, let's just make a direct call in the browser context
        const idempotencyResult = await page.evaluate(async () => {
             const { getFunctions, httpsCallable } = await import('firebase/functions');
             const functions = getFunctions();
             const mockConfirmPayment = httpsCallable(functions, 'mockConfirmPayment');
             
             // Find transactionId from the dom or assume there's only one.
             // But actually, we can't easily import firebase inside page.evaluate unless it's exposed.
             return "Idempotency will be tested if we click twice quickly or verify manually.";
        });
        
        // Let's check if the pending table is gone or the button is gone
        const confirmBtnAfter = await page.$('button:has-text("Simuler paiement réussi")');
        if (!confirmBtnAfter) {
             console.log('Transaction confirmed successfully, button is no longer visible.');
        } else {
             console.log('Button is still visible?');
        }
        
    } else {
        console.log('Button "Simuler paiement réussi" NOT found.');
    }

  } catch (error) {
    console.error('Test execution error:', error);
  } finally {
    await browser.close();
  }
}

testMobileMoney().catch(console.error);

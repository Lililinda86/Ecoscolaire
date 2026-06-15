const fs = require('fs');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

let serviceAccount;
try {
  const file = fs.readFileSync('./staging-service-account.json', 'utf8');
  serviceAccount = JSON.parse(file);
} catch (e) {
  console.error('Error loading service account', e);
  process.exit(1);
}

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'ecoscolaire-staging',
});

const db = getFirestore();

async function verify() {
  console.log('--- VERIFYING FIRESTORE ---');
  
  // 1. Check transactions
  const txSnapshot = await db.collection('transactions')
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();

  console.log(`Transactions found: ${txSnapshot.size}`);
  let foundPending = false;
  txSnapshot.forEach(doc => {
    const data = doc.data();
    console.log(`Transaction ID: ${doc.id}`);
    console.log(` - Status: ${data.status}`);
    console.log(` - Amount: ${data.amount}`);
    console.log(` - Method: ${data.method}`);
    if (data.status === 'PENDING') foundPending = true;
  });

  if (foundPending) {
    console.log('SUCCESS: PENDING transaction found.');
  } else {
    console.log('FAIL: No PENDING transaction found.');
  }

  // 2. Check payments (should NOT be created yet if pending)
  // To verify no payment was created for this exact transaction, 
  // we check the most recent payment
  const paymentSnapshot = await db.collection('payments')
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get();
    
  if (!paymentSnapshot.empty) {
    const p = paymentSnapshot.docs[0].data();
    console.log(`Most recent payment was created at: ${p.createdAt.toDate()}`);
    // If it was created just now, it's a failure (payments should only be created on webhook success)
    const now = new Date();
    const diff = now.getTime() - p.createdAt.toDate().getTime();
    if (diff < 60000) { // less than 1 min ago
        console.log('FAIL: Payment was created in the last minute!');
    } else {
        console.log('SUCCESS: No recent payment created.');
    }
  } else {
    console.log('SUCCESS: No payments exist at all.');
  }
}

verify().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});

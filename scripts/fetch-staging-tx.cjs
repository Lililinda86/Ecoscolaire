const admin = require('firebase-admin');

async function run() {
  const serviceAccountStr = process.env.STAGING_FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountStr) {
    console.error('No service account');
    process.exit(1);
  }
  const serviceAccount = JSON.parse(serviceAccountStr);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  
  const db = admin.firestore();
  
  // Find a successful transaction with a campay reference
  const txs = await db.collection('transactions')
    .where('status', '==', 'SUCCESS')
    .where('provider', '==', 'campay')
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();
    
  console.log(`Found ${txs.size} successful campay transactions.`);
  txs.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}`);
    console.log(`Amount: ${data.amount}`);
    console.log(`Provider Ref: ${data.providerReference}`);
    console.log(`Mode: ${data.mode}`);
    console.log(`SchoolId: ${data.schoolId}`);
    console.log('---');
  });

  // Find a failed one
  const ftxs = await db.collection('transactions')
    .where('status', '==', 'FAILED')
    .where('provider', '==', 'campay')
    .orderBy('createdAt', 'desc')
    .limit(2)
    .get();
  
  console.log(`Found ${ftxs.size} failed campay transactions.`);
  ftxs.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}`);
    console.log(`Amount: ${data.amount}`);
    console.log(`Provider Ref: ${data.providerReference}`);
    console.log(`Mode: ${data.mode}`);
    console.log('---');
  });

  // Also read secrets
  const secrets = await db.collection('schools').doc('school-test-starter-199').collection('secrets').doc('payment').get();
  console.log('Secrets:', secrets.data() ? 'Exists' : 'Null');
}

run().catch(console.error);

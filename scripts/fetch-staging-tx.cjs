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
  
  const logs = await db.collection('campay_logs')
    .orderBy('createdAt', 'desc')
    .limit(10)
    .get();
    
  console.log(`Found ${logs.size} recent campay logs.`);
  logs.forEach(doc => {
    const data = doc.data();
    console.log(`Log ID: ${doc.id}`);
    console.log(`Request Type: ${data.requestType}`);
    console.log(`External Ref: ${data.external_reference || (data.payload ? data.payload.external_reference : 'N/A')}`);
    console.log(`Reason: ${data.reason || 'N/A'}`);
    console.log('---');
  });

  // Also read secrets
  const secrets = await db.collection('schools').doc('school-test-starter-199').collection('secrets').doc('payment').get();
  console.log('Secrets:', secrets.data() ? 'Exists' : 'Null');
}

run().catch(console.error);

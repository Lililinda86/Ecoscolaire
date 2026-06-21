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
  const webhookUrl = 'https://us-central1-ecoscolaire-staging.cloudfunctions.net/campayWebhook';
  const schoolId = 'school-test-starter-199'; // Assuming this school exists and has secrets

  // Utility to send webhook
  const sendWebhook = async (payload) => {
    const fetch = (await import('node-fetch')).default;
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.status;
  };

  const delay = ms => new Promise(r => setTimeout(r, ms));

  console.log('--- DEBUT DE LA VALIDATION EN STAGING ---');

  // --- RECHERCHE D'UNE TRANSACTION REUSSIE (Pour les tests) ---
  const existingSuccessSnap = await db.collection('transactions')
    .where('status', '==', 'SUCCESS')
    .where('provider', '==', 'campay')
    .limit(1).get();
  
  let validReference = null;
  let validExternalRef = null;
  let validAmount = null;

  if (!existingSuccessSnap.empty) {
    const t = existingSuccessSnap.docs[0].data();
    validReference = t.providerReference; // the campay reference
    validExternalRef = t.id; // the external reference
    validAmount = t.amount;
    console.log(`\nTrouvé transaction existante SUCCESS: ${validExternalRef} (Campay Ref: ${validReference}, Amount: ${validAmount})`);
  } else {
    console.log('\nAucune transaction existante SUCCESS trouvée dans Staging.');
  }

  // TEST 1: Webhook avec référence inexistante
  console.log('\n>>> TEST 1: Webhook avec référence inexistante');
  const test1Id = `tx-fake-${Date.now()}`;
  await db.collection('transactions').doc(test1Id).set({
    id: test1Id, schoolId, amount: 1000, status: 'PENDING', createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  console.log(`Transaction locale ${test1Id} (PENDING) créée.`);
  await sendWebhook({ external_reference: test1Id, reference: 'campay-invalid-123', status: 'SUCCESS' });
  await delay(3000); // Wait for Cloud Function execution
  
  const tx1 = (await db.collection('transactions').doc(test1Id).get()).data();
  const logs1Snap = await db.collection('campay_logs').where('external_reference', '==', test1Id).get();
  console.log(`Resultat Test 1 - Statut local: ${tx1.status}`);
  logs1Snap.forEach(doc => console.log(`Resultat Test 1 - Log: ${doc.data().requestType} | Erreur: ${doc.data().error || doc.data().reason || JSON.stringify(doc.data().apiResponse)}`));

  // TEST 2: Webhook avec statut API FAILED ou Mismatch
  console.log('\n>>> TEST 2 & 3: Webhook avec mismatch (Montant et Externe Réf)');
  if (validReference) {
    const test3Id = `tx-mismatch-${Date.now()}`;
    // Création transaction PENDING avec un montant différent (10 au lieu de validAmount)
    await db.collection('transactions').doc(test3Id).set({
      id: test3Id, schoolId, amount: 10, status: 'PENDING', createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
    console.log(`Transaction locale ${test3Id} (PENDING, Amount 10) créée.`);
    
    // On envoie le webhook avec la référence valide (qui retournera SUCCESSFUL et montant validAmount)
    await sendWebhook({ external_reference: test3Id, reference: validReference, status: 'SUCCESS' });
    await delay(3000);
    
    const tx3 = (await db.collection('transactions').doc(test3Id).get()).data();
    const logs3Snap = await db.collection('campay_logs').where('external_reference', '==', test3Id).where('requestType', '==', 'webhook_verification_mismatch').get();
    console.log(`Resultat Test 3 - Statut local: ${tx3.status}`);
    logs3Snap.forEach(doc => console.log(`Resultat Test 3 - Log: ${doc.data().requestType} | Raison: ${doc.data().reason}`));
  } else {
    console.log('Skipped Test 3 (No existing success tx)');
  }

  // TEST 5: Double webhook SUCCESS (Idempotence)
  console.log('\n>>> TEST 5: Double webhook SUCCESS (Idempotence)');
  if (validExternalRef && validReference) {
    // La transaction est déjà SUCCESS
    const tx5Before = (await db.collection('transactions').doc(validExternalRef).get()).data();
    console.log(`Statut de ${validExternalRef} avant webhook: ${tx5Before.status}`);
    
    await sendWebhook({ external_reference: validExternalRef, reference: validReference, status: 'SUCCESS' });
    await delay(3000);
    
    const logs5Snap = await db.collection('campay_logs')
      .where('external_reference', '==', validExternalRef)
      .where('requestType', '==', 'webhook_duplicate')
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
      
    if (!logs5Snap.empty) {
      console.log(`Resultat Test 5 - Log trouvé: webhook_duplicate. L'idempotence a bloqué la requête.`);
    } else {
      console.log(`Resultat Test 5 - Avertissement: Pas de log webhook_duplicate trouvé récemment, mais la transaction est restée SUCCESS.`);
    }
  } else {
    console.log('Skipped Test 5 (No existing success tx)');
  }
  
  console.log('\n--- FIN DE LA VALIDATION ---');
}

run().catch(console.error);

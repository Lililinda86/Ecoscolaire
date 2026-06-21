import fetch from 'node-fetch';

async function testStagingWebhook() {
  const webhookUrl = 'https://us-central1-ecoscolaire-staging.cloudfunctions.net/campayWebhook';
  
  console.log('Sending TEST 1 (Fake reference)...');
  const res1 = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      external_reference: 'tx-fake-123',
      reference: 'campay-fake-123',
      status: 'SUCCESS'
    })
  });
  console.log('Test 1 Status:', res1.status, await res1.text());
  
  console.log('Sending TEST 2 (Another fake)...');
  const res2 = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      external_reference: 'tx-fake-456',
      reference: 'campay-fake-456',
      status: 'SUCCESS'
    })
  });
  console.log('Test 2 Status:', res2.status, await res2.text());
}

testStagingWebhook().catch(console.error);

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDX_wxY6S3twAG6vqlhXc6XSlxkYn6yx-4",
  authDomain: "ecoscolaire-staging.firebaseapp.com",
  projectId: "ecoscolaire-staging",
  storageBucket: "ecoscolaire-staging.firebasestorage.app",
  messagingSenderId: "411364288790",
  appId: "1:411364288790:web:745f0577ef947e1c994837"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

async function verify() {
  try {
    await signInWithEmailAndPassword(auth, 'owner.alpha@ecoscolaire.com', 'Test@2026Alpha!');
    console.log('Logged in as owner.');

    const txSnapshot = await getDocs(query(collection(db, 'transactions'), where('schoolId', '==', 'school-alpha-001')));
    
    let docs = [];
    txSnapshot.forEach(d => docs.push({ id: d.id, ...d.data() }));
    docs.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
    docs = docs.slice(0, 5);

    console.log(`Transactions found: ${docs.length}`);
    let foundPending = false;
    docs.forEach(data => {
      console.log(`Transaction ID: ${data.id}`);
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

    const paymentSnapshot = await getDocs(query(collection(db, 'payments'), where('schoolId', '==', 'school-alpha-001')));
    let pDocs = [];
    paymentSnapshot.forEach(d => pDocs.push({ id: d.id, ...d.data() }));
    pDocs.sort((a,b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date));
    
    if (pDocs.length > 0) {
      const p = pDocs[0];
      const createdAt = p.createdAt ? (p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt)) : new Date(p.date);
      console.log(`Most recent payment was created at: ${createdAt}`);
      const diff = new Date().getTime() - createdAt.getTime();
      if (diff < 120000) {
          console.log('FAIL: Payment was created recently!');
      } else {
          console.log('SUCCESS: No recent payment created.');
      }
    } else {
      console.log('SUCCESS: No payments exist at all.');
    }

  } catch(e) {
    console.error(e);
  }
  process.exit(0);
}

verify();

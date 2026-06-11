import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCWm59UvkOsyHWx9gJXHf0m9qH7d3Droh0",
  authDomain: "ecoscolaire-c5861.firebaseapp.com",
  projectId: "ecoscolaire-c5861",
  storageBucket: "ecoscolaire-c5861.firebasestorage.app",
  messagingSenderId: "329523025972",
  appId: "1:329523025972:web:052855ab83a9da2ea49261"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const verify = async () => {
  try {
    const alphaDoc = await getDoc(doc(db, 'schools', 'school-alpha-001'));
    console.log('Alpha existe:', alphaDoc.exists());
    
    const betaDoc = await getDoc(doc(db, 'schools', 'school-beta-002'));
    console.log('Beta existe:', betaDoc.exists());
    
    const alphaStudents = await getDocs(query(collection(db, 'students'), where('schoolId', '==', 'school-alpha-001')));
    console.log('Nombre élèves Alpha:', alphaStudents.size);
    
    const betaStudents = await getDocs(query(collection(db, 'students'), where('schoolId', '==', 'school-beta-002')));
    console.log('Nombre élèves Beta:', betaStudents.size);
    
    // Check some test accounts in the users collection
    const saAccount = await getDocs(query(collection(db, 'users'), where('email', '==', 'superadmin.test@ecoscolaire.com')));
    console.log('Compte superadmin présent:', saAccount.size > 0);

    const ownerAlpha = await getDocs(query(collection(db, 'users'), where('email', '==', 'owner.alpha@ecoscolaire.com')));
    console.log('Compte owner.alpha présent:', ownerAlpha.size > 0);

    const ownerBeta = await getDocs(query(collection(db, 'users'), where('email', '==', 'owner.beta@ecoscolaire.com')));
    console.log('Compte owner.beta présent:', ownerBeta.size > 0);
    
    process.exit(0);
  } catch (err) {
    console.error("Erreur:", err);
    process.exit(1);
  }
};

verify();

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, limit, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCWm59UvkOsyHWx9gJXHf0m9qH7d3Droh0",
  projectId: "ecoscolaire-c5861"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const testSchool = async () => {
    try {
        await signInWithEmailAndPassword(auth, 'owner.alpha@ecoscolaire.com', 'Test@2026Alpha!');
        console.log("Logged in");
        
        try {
            await getDocs(query(collection(db, 'staff'), where('schoolId', '==', 'school-alpha-001'), limit(1)));
            console.log(`Permission READ OK for staff`);
        } catch (e) {
            console.log(`Permission READ DENIED for staff:`, e.message);
        }
        
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
};

testSchool();

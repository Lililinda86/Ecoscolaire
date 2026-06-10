import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCWm59UvkOsyHWx9gJXHf0m9qH7d3Droh0",
  authDomain: "ecoscolaire-c5861.firebaseapp.com",
  projectId: "ecoscolaire-c5861",
  storageBucket: "ecoscolaire-c5861.firebasestorage.app",
  messagingSenderId: "329523025972",
  appId: "1:329523025972:web:052855ab83a9da2ea49261"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const createSecondaryUser = async (email, pass) => {
  const secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp');
  const secondaryAuth = getAuth(secondaryApp);
  
  const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
  await signOut(secondaryAuth);
  
  // Clean up
  const { deleteApp } = await import('firebase/app');
  await deleteApp(secondaryApp);
  
  return userCredential.user;
};

const setupUsers = async () => {
  try {
    console.log("Logging in as Super Admin...");
    await signInWithEmailAndPassword(auth, 'kyrialove@gmail.com', '123456');
    console.log("Super Admin logged in.");

    const schoolId = 'test-school-001';
    
    // Create a test school first
    await setDoc(doc(db, 'schools', schoolId), {
      id: schoolId,
      name: "École de Test",
      schoolCode: "TEST001",
      academicYear: "2023-2024",
      createdAt: new Date().toISOString()
    });
    console.log("Test school created.");

    const roles = [
      { role: 'owner', email: 'owner@ecoscolaire.com', pass: 'owner123' },
      { role: 'director', email: 'director@ecoscolaire.com', pass: 'director123' },
      { role: 'secretary', email: 'secretary@ecoscolaire.com', pass: 'secret123' },
      { role: 'accountant', email: 'accountant@ecoscolaire.com', pass: 'account123' },
      { role: 'teacher', email: 'teacher@ecoscolaire.com', pass: 'teacher123' },
      { role: 'parent', email: 'parent@ecoscolaire.com', pass: 'parent123' },
      { role: 'driver', email: 'driver@ecoscolaire.com', pass: 'driver123' }
    ];

    for (const r of roles) {
      try {
        console.log(`Creating ${r.role}...`);
        // Try logging in to see if it exists
        try {
           await signInWithEmailAndPassword(auth, r.email, r.pass);
           console.log(`User ${r.role} already exists in Auth. Updating Firestore.`);
           // Restore superadmin auth
           await signInWithEmailAndPassword(auth, 'kyrialove@gmail.com', '123456');
        } catch(e) {
           // Create
           const u = await createSecondaryUser(r.email, r.pass);
           await setDoc(doc(db, 'users', u.uid), {
             id: u.uid,
             schoolId: schoolId,
             email: r.email,
             role: r.role,
             isActive: true,
             studentIds: r.role === 'parent' ? ['student-123'] : [],
             createdAt: new Date().toISOString()
           });
           console.log(`User ${r.role} created successfully.`);
        }
      } catch (err) {
        console.error(`Error creating ${r.role}:`, err.message);
      }
    }

    console.log("Done.");
    process.exit(0);
  } catch (err) {
    console.error("Fatal error:", err);
    process.exit(1);
  }
};

setupUsers();

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDocs, collection, query, where, deleteDoc } from 'firebase/firestore';

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

const isDryRun = process.argv.includes('--dry-run');
const isCleanup = process.argv.includes('--cleanup');

const logAction = (action, details) => {
  if (isDryRun) {
    console.log(`[DRY-RUN] ${action}: ${details}`);
  } else {
    console.log(`[EXEC] ${action}: ${details}`);
  }
};

const isoDate = () => new Date().toISOString();

const createOrUpdateUser = async (email, pass) => {
  if (isDryRun) {
    logAction('Create/Update Auth User', email);
    return `dry-run-uid-${email}`;
  }
  let uid;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    uid = auth.currentUser.uid;
    await signOut(auth); // Sign out so we don't break subsequent logins
  } catch(e) {
    // Attempt creation
    const secondaryApp = initializeApp(firebaseConfig, 'SecondaryApp' + Date.now() + Math.random());
    const secondaryAuth = getAuth(secondaryApp);
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, pass);
    uid = userCredential.user.uid;
    await signOut(secondaryAuth);
    const { deleteApp } = await import('firebase/app');
    await deleteApp(secondaryApp);
  }
  return uid;
};

const cleanupTestData = async () => {
  console.log("Starting cleanup for Alpha and Beta...");
  const schoolIds = ['school-alpha-001', 'school-beta-002'];
  const collectionsList = ['schools', 'users', 'classes', 'students', 'payments', 'grades', 'attendance'];
  
  for (const c of collectionsList) {
    for (const sid of schoolIds) {
      if (isDryRun) {
        logAction('Delete', `from collection '${c}' where schoolId/id == '${sid}'`);
        continue;
      }
      let q;
      if (c === 'schools') {
        q = query(collection(db, c), where('id', '==', sid));
      } else {
        q = query(collection(db, c), where('schoolId', '==', sid));
      }
      const snapshot = await getDocs(q);
      for (const d of snapshot.docs) {
        await deleteDoc(d.ref);
      }
    }
  }
  logAction('Cleanup', 'Test data cleanup finished.');
};

const setupTestData = async () => {
  try {
    if (isCleanup) {
      await cleanupTestData();
      process.exit(0);
    }

    if (isDryRun) {
      console.log("=== DRY RUN MODE ACTIVATED ===");
    }

    // 1. Super Admin
    const saEmail = 'superadmin.test@ecoscolaire.com';
    const saPass = 'Test@2026Super!';
    const saUid = await createOrUpdateUser(saEmail, saPass);
    if (!isDryRun) {
      await setDoc(doc(db, 'users', saUid), {
        id: saUid, email: saEmail, role: 'superAdmin', isActive: true, createdAt: isoDate()
      });
      // Authenticate as Super Admin for remaining operations
      await signInWithEmailAndPassword(auth, saEmail, saPass);
    }
    logAction('SuperAdmin', `Ready: ${saEmail}`);

    // 2. Schools
    const alphaId = 'school-alpha-001';
    const betaId = 'school-beta-002';
    
    if (!isDryRun) {
      await setDoc(doc(db, 'schools', alphaId), {
        id: alphaId, name: "École Test EcoScolaire Alpha", schoolCode: "ALPHA001", academicYear: "2026-2027", address: "Yaoundé",
        logoUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        createdAt: isoDate()
      });
      await setDoc(doc(db, 'schools', betaId), {
        id: betaId, name: "École Test EcoScolaire Beta", schoolCode: "BETA002", academicYear: "2026-2027", createdAt: isoDate()
      });
    }
    logAction('Schools', 'Alpha and Beta schools prepared (Idempotent).');

    // 3. Roles Alpha
    const alphaRoles = [
      { role: 'owner', email: 'owner.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
      { role: 'director', email: 'director.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
      { role: 'secretary', email: 'secretary.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
      { role: 'accountant', email: 'accountant.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
      { role: 'teacher', email: 'teacher1.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
      { role: 'teacher', email: 'teacher2.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
      { role: 'teacher', email: 'teacher3.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' },
      { role: 'driver', email: 'driver.alpha@ecoscolaire.com', pass: 'Test@2026Alpha!' }
    ];
    for(let i=1; i<=5; i++) alphaRoles.push({ role: 'parent', email: `parent${i}.alpha@ecoscolaire.com`, pass: 'Test@2026Alpha!' });

    // Roles Beta
    const betaRoles = [
      { role: 'owner', email: 'owner.beta@ecoscolaire.com', pass: 'Test@2026Beta!' },
      { role: 'director', email: 'director.beta@ecoscolaire.com', pass: 'Test@2026Beta!' },
      { role: 'teacher', email: 'teacher.beta@ecoscolaire.com', pass: 'Test@2026Beta!' },
      { role: 'parent', email: 'parent.beta@ecoscolaire.com', pass: 'Test@2026Beta!' }
    ];

    const studentIds = [];
    for(let i=1; i<=20; i++) studentIds.push(`alpha-student-${i}`);

    const processRoles = async (rolesList, schoolId) => {
      let pIdx = 0;
      for (const r of rolesList) {
        const uid = await createOrUpdateUser(r.email, r.pass);
        if (!isDryRun) {
          const userData = { id: uid, schoolId, email: r.email, role: r.role, isActive: true, createdAt: isoDate() };
          if (r.role === 'parent' && schoolId === alphaId) {
            userData.studentIds = [studentIds[pIdx], studentIds[pIdx+1]];
            pIdx += 2;
          }
          // Using uid to set doc makes it idempotent
          await setDoc(doc(db, 'users', uid), userData);
        }
        logAction('User', `Prepared ${r.role} - ${r.email}`);
      }
    };
    await processRoles(alphaRoles, alphaId);
    await processRoles(betaRoles, betaId);

    // 4. Classes (Alpha)
    const classes = [
      { id: 'alpha-class-cp', schoolId: alphaId, name: 'CP', level: 'Primaire', type: 'francophone' },
      { id: 'alpha-class-ce1', schoolId: alphaId, name: 'CE1', level: 'Primaire', type: 'francophone' },
      { id: 'alpha-class-ce2', schoolId: alphaId, name: 'CE2', level: 'Primaire', type: 'francophone' }
    ];
    for (const c of classes) {
      if (!isDryRun) await setDoc(doc(db, 'classes', c.id), c);
      logAction('Class', `Prepared ${c.name}`);
    }

    // 5. Students (Alpha)
    for(let i=1; i<=20; i++) {
      const classRef = i <= 7 ? classes[0].id : (i <= 14 ? classes[1].id : classes[2].id);
      if (!isDryRun) {
        await setDoc(doc(db, 'students', studentIds[i-1]), {
          id: studentIds[i-1], schoolId: alphaId, classId: classRef,
          name: `Élève${i} TestAlpha`, matricule: `MAT2026${i.toString().padStart(3,'0')}`,
          gender: i%2===0?'F':'M', createdAt: isoDate(),
          section: 'francophone',
          parentName: `Parent ${i}`,
          parentPhone: `+2376000000${i.toString().padStart(2,'0')}`,
          feeT1: 50000, feeT2: 0, feeT3: 0
        });
      }
    }
    logAction('Students', '20 idempotent students generated.');

    // 6. Payments
    for(let i=1; i<=15; i++) {
      if (!isDryRun) {
        await setDoc(doc(db, 'payments', `alpha-pay-${i}`), {
          id: `alpha-pay-${i}`, schoolId: alphaId, studentId: studentIds[i-1],
          amount: 50000, method: i<=10 ? 'cash' : 'momo', status: i<=10 ? 'completed' : 'pending',
          type: 'tuition', reference: i<=10 ? `RECU-${i}` : `MOMO-PENDING-${i}`, date: isoDate()
        });
      }
    }
    logAction('Payments', '10 paid, 5 pending payments generated.');

    // 7. Grades
    for(let i=1; i<=50; i++) {
      if (!isDryRun) {
        await setDoc(doc(db, 'grades', `alpha-grade-${i}`), {
          id: `alpha-grade-${i}`, schoolId: alphaId, studentId: studentIds[(i-1)%20],
          subjectId: 'maths', term: 'T1', type: 'exam', value: 15, maxScore: 20, date: isoDate()
        });
      }
    }
    logAction('Grades', '50 deterministic grades generated.');

    // 8. Attendance
    for(let i=1; i<=50; i++) {
      if (!isDryRun) {
        await setDoc(doc(db, 'attendance', `alpha-att-${i}`), {
          id: `alpha-att-${i}`, schoolId: alphaId, studentId: studentIds[(i-1)%20],
          date: isoDate().split('T')[0], status: i%5===0 ? 'absent' : 'present', createdAt: isoDate()
        });
      }
    }
    logAction('Attendance', '50 deterministic attendances generated.');

    console.log(isDryRun ? "=== DRY RUN TERMINE ===" : "Opération d'insertion/mise à jour terminée avec succès !");
    process.exit(0);

  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
};

setupTestData();

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.staging' }); // Priority to staging
dotenv.config(); // Fallback to .env

const isDryRun = process.argv.includes('--dry-run');
const isCleanup = process.argv.includes('--cleanup');

const logAction = (action, details) => {
  if (isDryRun) {
    console.log(`[DRY-RUN] ${action}: ${details}`);
  } else {
    console.log(`[EXEC] ${action}: ${details}`);
  }
};

let serviceAccount;

if (process.env.STAGING_FIREBASE_SERVICE_ACCOUNT) {
  try {
    serviceAccount = JSON.parse(process.env.STAGING_FIREBASE_SERVICE_ACCOUNT);
  } catch(e) {
    console.error("Erreur de parsing de STAGING_FIREBASE_SERVICE_ACCOUNT", e);
    process.exit(1);
  }
} else if (fs.existsSync('./staging-service-account.json')) {
  try {
    const file = fs.readFileSync('./staging-service-account.json', 'utf8');
    serviceAccount = JSON.parse(file);
  } catch(e) {
    console.error("Erreur de lecture du fichier staging-service-account.json", e);
    process.exit(1);
  }
} else {
  console.error("ABORT: Aucun Service Account trouvé. Fournissez STAGING_FIREBASE_SERVICE_ACCOUNT ou le fichier staging-service-account.json.");
  process.exit(1);
}

if (!serviceAccount.project_id) {
  console.error("ABORT: project_id absent dans le Service Account.");
  process.exit(1);
}

if (serviceAccount.project_id === 'ecoscolaire-c5861') {
  console.error("ABORT: Tentative d'exécution du Seed sur la Production (ecoscolaire-c5861) !");
  process.exit(1);
}

if (serviceAccount.project_id !== 'ecoscolaire-staging') {
  console.error(`ABORT: Ce script est restreint au staging. project_id actuel: ${serviceAccount.project_id}`);
  process.exit(1);
}

console.log("=== FIREBASE SEED TARGET ===");
console.log("Project ID:", serviceAccount.project_id);

initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const auth = getAuth();

const isoDate = () => new Date().toISOString();

const createOrUpdateUser = async (email, pass) => {
  if (isDryRun) {
    logAction('Create/Update Auth User', email);
    return `dry-run-uid-${email}`;
  }
  let uid;
  try {
    const userRecord = await auth.getUserByEmail(email);
    uid = userRecord.uid;
    // Update password to ensure the script's password is the one set
    await auth.updateUser(uid, { password: pass });
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      const newUser = await auth.createUser({ email, password: pass });
      uid = newUser.uid;
    } else {
      throw e;
    }
  }
  return uid;
};

const cleanupTestData = async () => {
  console.log("Starting cleanup for Alpha and Beta...");
  const schoolIds = ['school-alpha-001', 'school-beta-002'];
  const collectionsList = ['schools', 'users', 'classes', 'students', 'payments', 'grades', 'attendance', 'subjects'];
  
  for (const c of collectionsList) {
    for (const sid of schoolIds) {
      if (isDryRun) {
        logAction('Delete', `from collection '${c}' where schoolId/id == '${sid}'`);
        continue;
      }
      let q;
      if (c === 'schools') {
        q = db.collection(c).where('id', '==', sid);
      } else {
        q = db.collection(c).where('schoolId', '==', sid);
      }
      const snapshot = await q.get();
      const batch = db.batch();
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      if (!snapshot.empty) {
        await batch.commit();
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
      console.log('Writing superAdmin user doc...');
      await db.collection('users').doc(saUid).set({
        id: saUid, email: saEmail, role: 'superAdmin', active: true, isActive: true, createdAt: isoDate()
      }, { merge: true });
      console.log('SuperAdmin doc written.');
    }
    logAction('SuperAdmin', `Ready: ${saEmail}`);

    // 2. Schools
    const alphaId = 'school-alpha-001';
    const betaId = 'school-beta-002';
    
    if (!isDryRun) {
      console.log('Writing alpha school...');
      await db.collection('schools').doc(alphaId).set({
        id: alphaId, name: "École Test EcoScolaire Alpha", schoolCode: "ALPHA001", academicYear: "2026-2027", address: "Yaoundé",
        settings: { currency: "XAF", defaultLanguage: "fr" },
        createdAt: isoDate(), updatedAt: isoDate()
      }, { merge: true });
      console.log('Writing beta school...');
      await db.collection('schools').doc(betaId).set({
        id: betaId, name: "École Test EcoScolaire Beta", schoolCode: "BETA002", academicYear: "2026-2027", address: "Douala",
        settings: { currency: "XAF", defaultLanguage: "fr" },
        createdAt: isoDate(), updatedAt: isoDate()
      }, { merge: true });
      console.log('Schools written.');
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
          const userData = { id: uid, schoolId, email: r.email, role: r.role, active: true, isActive: true, createdAt: isoDate() };
          if (r.role === 'parent' && schoolId === alphaId) {
            userData.studentIds = [studentIds[pIdx], studentIds[pIdx+1]];
            pIdx += 2;
          }
          await db.collection('users').doc(uid).set(userData, { merge: true });
        }
        logAction('User', `Prepared ${r.role} - ${r.email}`);
      }
    };
    await processRoles(alphaRoles, alphaId);
    await processRoles(betaRoles, betaId);

    // 3.5 Subjects
    const subjects = [
      { id: 'subj-fr-fra', schoolId: alphaId, name: 'Français', type: 'francophone' },
      { id: 'subj-fr-mat', schoolId: alphaId, name: 'Mathématiques', type: 'francophone' },
      { id: 'subj-fr-ang', schoolId: alphaId, name: 'Anglais', type: 'francophone' },
      { id: 'subj-fr-sci', schoolId: alphaId, name: 'Sciences', type: 'francophone' },
      { id: 'subj-fr-his', schoolId: alphaId, name: 'Histoire-Géographie', type: 'francophone' },
      { id: 'subj-en-eng', schoolId: betaId, name: 'English', type: 'anglophone' },
      { id: 'subj-en-mat', schoolId: betaId, name: 'Mathematics', type: 'anglophone' },
      { id: 'subj-en-sci', schoolId: betaId, name: 'Science', type: 'anglophone' },
      { id: 'subj-en-soc', schoolId: betaId, name: 'Social Studies', type: 'anglophone' }
    ];
    for (const s of subjects) {
      if (!isDryRun) await db.collection('subjects').doc(s.id).set(s, { merge: true });
      logAction('Subject', `Prepared ${s.name} for ${s.schoolId}`);
    }

    const alphaSubjIds = subjects.filter(s => s.schoolId === alphaId).map(s => s.id);
    const betaSubjIds = subjects.filter(s => s.schoolId === betaId).map(s => s.id);

    // 4. Classes (Alpha & Beta)
    const classes = [
      { id: 'alpha-class-cp', schoolId: alphaId, name: 'CP', level: 'Primaire', type: 'francophone', subjects: alphaSubjIds },
      { id: 'alpha-class-ce1', schoolId: alphaId, name: 'CE1', level: 'Primaire', type: 'francophone', subjects: alphaSubjIds },
      { id: 'alpha-class-ce2', schoolId: alphaId, name: 'CE2', level: 'Primaire', type: 'francophone', subjects: alphaSubjIds },
      { id: 'beta-class-cp', schoolId: betaId, name: 'CP Beta', level: 'Primaire', type: 'francophone', subjects: betaSubjIds }
    ];
    for (const c of classes) {
      if (!isDryRun) await db.collection('classes').doc(c.id).set(c, { merge: true });
      logAction('Class', `Prepared ${c.name} for ${c.schoolId}`);
    }

    // 5. Students (Alpha & Beta)
    for(let i=1; i<=20; i++) {
      const classRef = i <= 7 ? classes[0].id : (i <= 14 ? classes[1].id : classes[2].id);
      if (!isDryRun) {
        await db.collection('students').doc(studentIds[i-1]).set({
          id: studentIds[i-1], schoolId: alphaId, classId: classRef,
          name: `Élève${i} TestAlpha`, matricule: `MAT2026${i.toString().padStart(3,'0')}`,
          gender: i%2===0?'F':'M', createdAt: isoDate(),
          section: 'francophone',
          parentName: `Parent ${i}`,
          parentPhone: `+2376000000${i.toString().padStart(2,'0')}`,
          feeT1: 50000, feeT2: 0, feeT3: 0
        }, { merge: true });
      }
    }
    if (!isDryRun) {
      await db.collection('students').doc('beta-student-1').set({
        id: 'beta-student-1', schoolId: betaId, classId: 'beta-class-cp',
        name: 'Élève1 TestBeta', matricule: 'BETAMAT001',
        gender: 'M', createdAt: isoDate(),
        section: 'francophone',
        parentName: 'Parent Beta',
        parentPhone: '+237600000099',
        feeT1: 50000, feeT2: 0, feeT3: 0
      }, { merge: true });
    }
    logAction('Students', '20 Alpha + 1 Beta idempotent students generated.');

    // 6. Payments
    for(let i=1; i<=15; i++) {
      if (!isDryRun) {
        await db.collection('payments').doc(`alpha-pay-${i}`).set({
          id: `alpha-pay-${i}`, schoolId: alphaId, studentId: studentIds[i-1],
          amount: 50000, method: i<=10 ? 'cash' : 'momo', status: i<=10 ? 'completed' : 'pending',
          type: 'tuition', installment: 'T1', reference: i<=10 ? `RECU-${i}` : `MOMO-PENDING-${i}`, date: isoDate()
        }, { merge: true });
      }
    }
    logAction('Payments', '10 paid, 5 pending payments generated.');

    // 7. Grades
    for(let i=1; i<=50; i++) {
      if (!isDryRun) {
        await db.collection('grades').doc(`alpha-grade-${i}`).set({
          id: `alpha-grade-${i}`, schoolId: alphaId, studentId: studentIds[(i-1)%20],
          subjectId: 'maths', term: 'T1', type: 'exam', value: 15, maxScore: 20, date: isoDate()
        }, { merge: true });
      }
    }
    logAction('Grades', '50 deterministic grades generated.');

    // 8. Attendance
    for(let i=1; i<=50; i++) {
      if (!isDryRun) {
        await db.collection('attendance').doc(`alpha-att-${i}`).set({
          id: `alpha-att-${i}`, schoolId: alphaId, studentId: studentIds[(i-1)%20],
          date: isoDate().split('T')[0], status: i%5===0 ? 'absent' : 'present', createdAt: isoDate()
        }, { merge: true });
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

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const EXPECTED_PROJECT_ID = "ecoscolaire-staging";
const PRODUCTION_PROJECT_ID = "ecoscolaire-c5861";
const SCHOOL_ID = "ux-enc-v3-school";
const YEAR_ID = "ux-enc-v3-year-2026";
const CLASS_ID = "ux-enc-v3-class-cp";
const ACADEMIC_YEAR = "2026-2027";
const TEST_EMAIL = "ux.encaissement.secretary@ecoscolaire.test";
const FIXTURE_VERSION = 1;

const serviceAccountSource = process.env.STAGING_FIREBASE_SERVICE_ACCOUNT;
const testPassword = process.env.STAGING_UX_TEST_PASSWORD;
if (!serviceAccountSource)
  throw new Error("STAGING_FIREBASE_SERVICE_ACCOUNT is required.");
if (!testPassword || testPassword.length < 16)
  throw new Error(
    "STAGING_UX_TEST_PASSWORD must contain at least 16 characters.",
  );

const serviceAccount = JSON.parse(serviceAccountSource);
if (serviceAccount.project_id === PRODUCTION_PROJECT_ID) {
  throw new Error("PRODUCTION TARGET REFUSED.");
}
if (serviceAccount.project_id !== EXPECTED_PROJECT_ID) {
  throw new Error(
    `Unexpected Firebase project: ${serviceAccount.project_id || "missing"}`,
  );
}
if (process.env.FIREBASE_PROJECT_ID !== EXPECTED_PROJECT_ID) {
  throw new Error(
    `Unexpected workflow project: ${process.env.FIREBASE_PROJECT_ID || "missing"}`,
  );
}

const app =
  getApps()[0] ||
  initializeApp({
    credential: cert(serviceAccount),
    projectId: EXPECTED_PROJECT_ID,
  });
if (app.options.projectId !== EXPECTED_PROJECT_ID)
  throw new Error("Firebase Admin project guard failed.");
const auth = getAuth(app);
const db = getFirestore(app);
const now = FieldValue.serverTimestamp();

let accountCreated = false;
let user;
try {
  user = await auth.getUserByEmail(TEST_EMAIL);
  const claims = user.customClaims || {};
  if (claims.role !== "secretary" || claims.schoolId !== SCHOOL_ID) {
    throw new Error(
      "Existing UX test account has unexpected claims; refusing to modify it.",
    );
  }
} catch (error) {
  if (error?.code !== "auth/user-not-found") throw error;
  user = await auth.createUser({
    email: TEST_EMAIL,
    password: testPassword,
    displayName: "Secrétaire Validation UX Encaissement",
    emailVerified: true,
    disabled: false,
  });
  await auth.setCustomUserClaims(user.uid, {
    role: "secretary",
    schoolId: SCHOOL_ID,
  });
  accountCreated = true;
}

const existingUserDoc = await db.collection("users").doc(user.uid).get();
if (existingUserDoc.exists) {
  const data = existingUserDoc.data() || {};
  if (data.role !== "secretary" || data.schoolId !== SCHOOL_ID) {
    throw new Error(
      "Existing UX test user document has unexpected scope; refusing to modify it.",
    );
  }
}

const students = [
  {
    id: "ux-enc-v3-student-standard",
    name: "Amina Sans Avantage",
    matricule: "UX-ENC-001",
    usesTransport: true,
  },
  {
    id: "ux-enc-v3-student-discount",
    name: "Brice Réduction Approuvée",
    matricule: "UX-ENC-002",
    usesTransport: true,
  },
  {
    id: "ux-enc-v3-student-moratorium",
    name: "Chloé Moratoire Actif",
    matricule: "UX-ENC-003",
    usesTransport: true,
  },
  {
    id: "ux-enc-v3-student-partial",
    name: "Daniel Paiement Partiel",
    matricule: "UX-ENC-004",
    usesTransport: true,
  },
];

const commonFixture = {
  schoolId: SCHOOL_ID,
  academicYear: ACADEMIC_YEAR,
  testFixture: true,
  fixtureName: "encaissement-v3-human-ux",
  fixtureVersion: FIXTURE_VERSION,
};

await Promise.all([
  db
    .collection("users")
    .doc(user.uid)
    .set(
      {
        id: user.uid,
        email: TEST_EMAIL,
        name: "Secrétaire Validation UX Encaissement",
        role: "secretary",
        schoolId: SCHOOL_ID,
        active: true,
        isActive: true,
        updatedAt: now,
        ...(existingUserDoc.exists ? {} : { createdAt: now }),
        testFixture: true,
        fixtureName: "encaissement-v3-human-ux",
      },
      { merge: true },
    ),
  db
    .collection("schools")
    .doc(SCHOOL_ID)
    .set(
      {
        id: SCHOOL_ID,
        name: "École Test — Validation UX Encaissement V3",
        schoolCode: "UXENCV3",
        academicYear: ACADEMIC_YEAR,
        activeAcademicYearId: YEAR_ID,
        active: true,
        subscriptionStatus: "active",
        studentsCount: students.length,
        studentLimit: 20,
        globalFees: {
          feeT1: 60000,
          feeT2: 50000,
          feeT3: 40000,
          feeUniforms: 18000,
          feeTransport: 4000,
        },
        classFees: {
          CP: {
            registration: 15000,
            tuition: 150000,
            t1: 60000,
            t2: 50000,
            t3: 40000,
          },
        },
        feeCatalog: [
          {
            id: "activity-kit",
            label: "Kit d'activités",
            amount: 7500,
            active: true,
            classIds: [CLASS_ID],
          },
        ],
        transportPolicy: {
          feePolicyId: "ITALO_PK_2026",
          billingPeriods: ["2026-09", "2026-10", "2026-11"],
        },
        paymentDeadlines: {
          registrationFee: "2026-09-01",
          transport: {
            "2026-09": "2026-09-10",
            "2026-10": "2026-10-10",
            "2026-11": "2026-11-10",
          },
        },
        updatedAt: now,
        ...commonFixture,
      },
      { merge: true },
    ),
  db
    .collection("academicYears")
    .doc(YEAR_ID)
    .set(
      {
        id: YEAR_ID,
        schoolId: SCHOOL_ID,
        name: ACADEMIC_YEAR,
        status: "active",
        startDate: "2026-09-01",
        endDate: "2027-06-30",
        tuitionPaymentDeadlines: {
          T1: "2026-09-01",
          T2: "2026-11-15",
          T3: "2027-03-15",
        },
        updatedAt: now,
        testFixture: true,
        fixtureName: "encaissement-v3-human-ux",
      },
      { merge: true },
    ),
  db.collection("classes").doc(CLASS_ID).set(
    {
      id: CLASS_ID,
      schoolId: SCHOOL_ID,
      name: "CP",
      level: "primary",
      cycle: "primary",
      section: "francophone",
      isActive: true,
      updatedAt: now,
      testFixture: true,
      fixtureName: "encaissement-v3-human-ux",
    },
    { merge: true },
  ),
]);

for (const student of students) {
  await Promise.all([
    db
      .collection("students")
      .doc(student.id)
      .set(
        {
          ...student,
          ...commonFixture,
          classId: CLASS_ID,
          academicYearId: YEAR_ID,
          schoolingStatus: "active",
          gender: student.id.endsWith("partial") ? "M" : "F",
          section: "francophone",
          updatedAt: now,
        },
        { merge: true },
      ),
    db.collection("studentPrivate").doc(student.id).set(
      {
        id: student.id,
        studentId: student.id,
        schoolId: SCHOOL_ID,
        transportZonePk: 14,
        transportNeighborhood: "Quartier test UX",
        transportPickupPoint: "Point test UX",
        updatedAt: now,
        testFixture: true,
        fixtureName: "encaissement-v3-human-ux",
      },
      { merge: true },
    ),
    db.collection("studentFinance").doc(student.id).set(
      {
        id: student.id,
        studentId: student.id,
        schoolId: SCHOOL_ID,
        registrationFeeExpected: 15000,
        registrationFeePaid: 0,
        feeT1: 60000,
        feeT2: 50000,
        feeT3: 40000,
        feeUniforms: 18000,
        updatedAt: now,
        testFixture: true,
        fixtureName: "encaissement-v3-human-ux",
      },
      { merge: true },
    ),
  ]);
}

await Promise.all([
  db
    .collection("financialBenefits")
    .doc("ux-enc-v3-benefit-discount")
    .set(
      {
        id: "ux-enc-v3-benefit-discount",
        ...commonFixture,
        studentId: "ux-enc-v3-student-discount",
        benefitType: "SCHOLARSHIP",
        paymentType: "TUITION",
        installment: "T1",
        mode: "FIXED_AMOUNT",
        value: 12000,
        stackable: true,
        reason: "Réduction approuvée pour validation UX",
        status: "approved",
        usageCount: 0,
        maximumUses: 1,
        appliedTargets: [],
        updatedAt: now,
      },
      { merge: true },
    ),
  db
    .collection("paymentMoratoriums")
    .doc("ux-enc-v3-moratorium")
    .set(
      {
        id: "ux-enc-v3-moratorium",
        ...commonFixture,
        studentId: "ux-enc-v3-student-moratorium",
        paymentType: "tuition",
        installment: "T1",
        status: "approved",
        originalDueDate: "2026-09-01",
        effectiveDueDate: "2026-10-20",
        reason: "Moratoire approuvé pour validation UX",
        updatedAt: now,
      },
      { merge: true },
    ),
  db
    .collection("payments")
    .doc("ux-enc-v3-partial-payment")
    .set(
      {
        id: "ux-enc-v3-partial-payment",
        ...commonFixture,
        studentId: "ux-enc-v3-student-partial",
        amount: 20000,
        method: "cash",
        status: "completed",
        type: "tuition",
        installment: "T1",
        reference: "UX-PARTIAL-001",
        date: "2026-09-03T10:00:00.000Z",
        createdAt: now,
      },
      { merge: true },
    ),
]);

console.log(
  JSON.stringify({
    projectId: EXPECTED_PROJECT_ID,
    accountCreated,
    email: TEST_EMAIL,
    role: "secretary",
    schoolId: SCHOOL_ID,
    schoolName: "École Test — Validation UX Encaissement V3",
    studentCount: students.length,
    fixtureVersion: FIXTURE_VERSION,
    productionTouched: false,
  }),
);

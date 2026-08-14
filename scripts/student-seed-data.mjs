export const STUDENT_PRIVATE_FIELDS = Object.freeze([
  'dob', 'placeOfBirth', 'parentName', 'parentPhone', 'parentEmails', 'address',
  'emergencyContact', 'allergies', 'medicalConditions', 'transportNeighborhood',
  'transportPickupPoint', 'fatherName', 'fatherPhone', 'fatherProfession',
  'motherName', 'motherPhone', 'motherProfession', 'guardianRelationship',
  'guardianRelationshipDetails', 'motherLastName', 'motherFirstName',
  'motherEmail', 'motherWhatsapp', 'fatherLastName', 'fatherFirstName',
  'fatherEmail', 'fatherWhatsapp', 'guardianLastName', 'guardianFirstName',
  'guardianPhone', 'guardianEmail', 'guardianWhatsapp', 'guardianRelation',
  'primaryContactType'
]);

export const STUDENT_FINANCIAL_FIELDS = Object.freeze([
  'feeAmount', 'feeT1', 'feeT2', 'feeT3', 'feeTransport', 'feeUniforms',
  'financialBypass', 'registrationFeeExpected', 'registrationFeePaid',
  'registrationFeeStatus', 'tuitionExpected', 'tuitionPaid', 'tuitionStatus',
  'transportMonthlyFee', 'transportPaid'
]);

export const STUDENT_RESTRICTED_FIELDS = Object.freeze([
  ...STUDENT_PRIVATE_FIELDS,
  ...STUDENT_FINANCIAL_FIELDS
]);

export const buildStudentSeedDocuments = ({
  studentId,
  schoolId,
  classId,
  name,
  matricule,
  gender,
  section,
  parentName,
  parentPhone,
  feeT1,
  feeT2,
  feeT3,
  timestamp
}) => {
  const identity = { id: studentId, studentId, schoolId };
  const audit = {
    createdAt: timestamp,
    createdBy: 'staging-seed',
    updatedAt: timestamp,
    updatedBy: 'staging-seed'
  };
  const financialBypass = { t1: false, t2: false, t3: false };

  return {
    student: {
      id: studentId,
      schoolId,
      classId,
      name,
      matricule,
      gender,
      section,
      ...audit
    },
    studentPrivate: {
      ...identity,
      parentName,
      parentPhone,
      ...audit
    },
    studentFinance: {
      ...identity,
      feeT1,
      feeT2,
      feeT3,
      financialBypass,
      ...audit
    },
    studentParentFinance: {
      ...identity,
      feeT1,
      feeT2,
      feeT3,
      financialBypass,
      ...audit
    }
  };
};

export const writeStudentSeedDocuments = async (db, seedData) => {
  const documents = buildStudentSeedDocuments(seedData);
  const batch = db.batch();
  // Replace the controlled public fixture so a rerun also removes legacy restricted fields.
  batch.set(db.collection('students').doc(seedData.studentId), documents.student);
  batch.set(db.collection('studentPrivate').doc(seedData.studentId), documents.studentPrivate, { merge: true });
  batch.set(db.collection('studentFinance').doc(seedData.studentId), documents.studentFinance, { merge: true });
  batch.set(
    db.collection('studentParentFinance').doc(seedData.studentId),
    documents.studentParentFinance,
    { merge: true }
  );
  await batch.commit();
};

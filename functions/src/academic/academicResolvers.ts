import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export interface ResolvedAcademicYear {
  id: string;
  name: string;
  data: admin.firestore.DocumentData;
}

export interface ResolvedClassProgram {
  id: string;
  data: admin.firestore.DocumentData;
}

export async function resolveAcademicYear(
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  cleanSchoolId: string,
  cleanAcademicYearId: string
): Promise<ResolvedAcademicYear> {
  // 1. Direct read by ID
  const yearRef = db.collection('academicYears').doc(cleanAcademicYearId);
  const yearSnap = await transaction.get(yearRef);

  if (yearSnap.exists) {
    const data = yearSnap.data()!;
    if (data.schoolId !== cleanSchoolId) {
      throw new functions.https.HttpsError(
        'not-found',
        'Année scolaire introuvable ou n\'appartenant pas à cette école.',
        { businessCode: 'ACADEMIC_YEAR_NOT_FOUND' }
      );
    }
    if (typeof data.name !== 'string' || !/^\d{4}-\d{4}$/.test(data.name.trim())) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Le champ name de l\'année scolaire est invalide.',
        { businessCode: 'PROGRAM_INTEGRITY_ERROR' }
      );
    }
    return { id: yearSnap.id, name: data.name.trim(), data };
  }

  // 2. Fallback legacy
  if (!/^\d{4}-\d{4}$/.test(cleanAcademicYearId)) {
    throw new functions.https.HttpsError(
      'not-found',
      'Année scolaire introuvable.',
      { businessCode: 'ACADEMIC_YEAR_NOT_FOUND' }
    );
  }

  const legacyQuery = db.collection('academicYears')
    .where('schoolId', '==', cleanSchoolId)
    .where('name', '==', cleanAcademicYearId);

  const legacySnaps = await transaction.get(legacyQuery);

  if (legacySnaps.empty) {
    throw new functions.https.HttpsError(
      'not-found',
      'Année scolaire introuvable.',
      { businessCode: 'ACADEMIC_YEAR_NOT_FOUND' }
    );
  }

  if (legacySnaps.size > 1) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Plusieurs années scolaires correspondent à ce libellé.',
      { businessCode: 'PROGRAM_INTEGRITY_ERROR' }
    );
  }

  const legacyDoc = legacySnaps.docs[0];
  const legacyData = legacyDoc.data();

  if (typeof legacyData.name !== 'string' || !/^\d{4}-\d{4}$/.test(legacyData.name.trim())) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Le champ name de l\'année scolaire est invalide.',
      { businessCode: 'PROGRAM_INTEGRITY_ERROR' }
    );
  }

  return { id: legacyDoc.id, name: legacyData.name.trim(), data: legacyData };
}

export async function resolveClassProgram(
  transaction: admin.firestore.Transaction,
  db: admin.firestore.Firestore,
  cleanSchoolId: string,
  cleanClassId: string,
  resolvedYear: ResolvedAcademicYear
): Promise<ResolvedClassProgram | null> {
  const canonicalQuery = db.collection('classPrograms')
    .where('schoolId', '==', cleanSchoolId)
    .where('classId', '==', cleanClassId)
    .where('academicYearId', '==', resolvedYear.id);

  const legacyQuery = db.collection('classPrograms')
    .where('schoolId', '==', cleanSchoolId)
    .where('classId', '==', cleanClassId)
    .where('academicYearId', '==', resolvedYear.name);

  const deterministicDocRef = db.collection('classPrograms')
    .doc(`${cleanSchoolId}__${resolvedYear.name}__${cleanClassId}`);

  const [canonicalSnap, legacySnap, deterministicSnap] = await Promise.all([
    transaction.get(canonicalQuery),
    transaction.get(legacyQuery),
    transaction.get(deterministicDocRef)
  ]);

  const uniqueDocs = new Map<string, admin.firestore.DocumentData>();

  canonicalSnap.docs.forEach(doc => uniqueDocs.set(doc.id, doc.data()));
  legacySnap.docs.forEach(doc => uniqueDocs.set(doc.id, doc.data()));
  if (deterministicSnap.exists) {
    uniqueDocs.set(deterministicSnap.id, deterministicSnap.data()!);
  }

  if (uniqueDocs.size > 1) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Plusieurs programmes de classe distincts ont été trouvés.',
      { businessCode: 'PROGRAM_INTEGRITY_ERROR' }
    );
  }

  if (uniqueDocs.size === 1) {
    const entry = Array.from(uniqueDocs.entries())[0];
    return { id: entry[0], data: entry[1] };
  }

  return null;
}

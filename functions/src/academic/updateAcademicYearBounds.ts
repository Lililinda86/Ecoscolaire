import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

export interface UpdateAcademicYearBoundsInput {
  schoolId: string;
  academicYearId: string;
  startDate: string;
  endDate: string;
}

export interface UpdateAcademicYearBoundsOutput {
  success: boolean;
  academicYearId: string;
  startDate: string;
  endDate: string;
}

function isValidISODateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) return false;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

export const updateAcademicYearBounds = functions.https.onCall(async (data: UpdateAcademicYearBoundsInput, context): Promise<UpdateAcademicYearBoundsOutput> => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'L\'utilisateur doit être authentifié.',
      { businessCode: 'UNAUTHENTICATED' }
    );
  }

  const uid = context.auth.uid;
  const { schoolId, academicYearId, startDate, endDate } = data;

  if (typeof schoolId !== 'string' || schoolId.trim() === '') {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId invalide.', { businessCode: 'INVALID_ARGUMENT' });
  }
  if (typeof academicYearId !== 'string' || academicYearId.trim() === '') {
    throw new functions.https.HttpsError('invalid-argument', 'academicYearId invalide.', { businessCode: 'INVALID_ARGUMENT' });
  }
  
  // Date validation YYYY-MM-DD strict
  if (typeof startDate !== 'string' || !isValidISODateOnly(startDate)) {
    throw new functions.https.HttpsError('invalid-argument', 'startDate doit être au format YYYY-MM-DD.', { businessCode: 'INVALID_ARGUMENT' });
  }
  if (typeof endDate !== 'string' || !isValidISODateOnly(endDate)) {
    throw new functions.https.HttpsError('invalid-argument', 'endDate doit être au format YYYY-MM-DD.', { businessCode: 'INVALID_ARGUMENT' });
  }
  if (startDate >= endDate) {
    throw new functions.https.HttpsError('invalid-argument', 'startDate doit être avant endDate.', { businessCode: 'INVALID_ARGUMENT' });
  }

  const db = admin.firestore();
  const nowIso = new Date().toISOString();

  try {
    return await db.runTransaction(async (transaction) => {
      // Check user permission
      const userRef = db.collection('users').doc(uid);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists) {
        throw new functions.https.HttpsError('permission-denied', 'Utilisateur introuvable.');
      }
      const user = userSnap.data()!;
      if (user.isActive !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Compte inactif.');
      }
      
      const allowedRoles = ['superAdmin', 'owner', 'director'];
      if (!allowedRoles.includes(user.role)) {
        throw new functions.https.HttpsError('permission-denied', 'Rôle non autorisé à modifier l\'année.');
      }
      if (user.role !== 'superAdmin' && user.schoolId !== schoolId) {
        throw new functions.https.HttpsError('permission-denied', 'L\'opérateur n\'appartient pas à l\'école.');
      }

      // Check Academic Year
      const yearRef = db.collection('academicYears').doc(academicYearId);
      const yearSnap = await transaction.get(yearRef);
      if (!yearSnap.exists) {
        throw new functions.https.HttpsError('not-found', 'Année académique introuvable.');
      }
      const yearData = yearSnap.data()!;
      
      if (yearData.schoolId !== schoolId) {
        throw new functions.https.HttpsError('permission-denied', 'Accès refusé pour cette école.');
      }
      
      const allowedStatuses = ['draft', 'active'];
      if (!allowedStatuses.includes(yearData.status)) {
        throw new functions.https.HttpsError('failed-precondition', 'Le statut de l\'année ne permet pas de modifier ses dates.', { businessCode: 'INVALID_STATUS' });
      }
      
      // Check for overlap with other AcademicYears
      const otherYearsQuery = db.collection('academicYears').where('schoolId', '==', schoolId);
      const otherYearsSnap = await transaction.get(otherYearsQuery);
      
      for (const doc of otherYearsSnap.docs) {
        if (doc.id === academicYearId) continue;
        const otherYear = doc.data();
        if (!otherYear.startDate || !otherYear.endDate) continue;
        
        // Un chevauchement existe si la nouvelle date de début est strictement avant la fin de l'autre
        // ET la nouvelle date de fin est strictement après le début de l'autre.
        // Les années peuvent se toucher le même jour (startDate == otherYear.endDate est autorisé).
        if (startDate < otherYear.endDate && endDate > otherYear.startDate) {
           throw new functions.https.HttpsError('failed-precondition', `Les nouvelles dates chevauchent l'année ${otherYear.name}.`, { businessCode: 'YEAR_OVERLAP' });
        }
      }

      // We must fetch all periods for this academicYearId to ensure new bounds are valid
      const periodsQuery = db.collection('periods')
        .where('academicYearId', '==', academicYearId);
        
      const periodsSnap = await transaction.get(periodsQuery);
      
      // Ensure all periods are within the new bounds
      for (const doc of periodsSnap.docs) {
        const p = doc.data();
        if (!p.startDate || !p.endDate) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            `La période ${p.name} n'a pas de dates définies.`,
            { businessCode: 'PERIOD_INVALID' }
          );
        }
        if (p.startDate < startDate || p.endDate > endDate) {
          throw new functions.https.HttpsError(
            'failed-precondition',
            `Les nouvelles dates excluent la période existante: ${p.name}.`,
            { businessCode: 'PERIOD_OUT_OF_BOUNDS' }
          );
        }
      }
      
      // Update the year
      transaction.update(yearRef, {
        startDate,
        endDate,
        updatedAt: nowIso,
        updatedBy: uid
      });

      return {
        success: true,
        academicYearId,
        startDate,
        endDate
      };
    });
  } catch (error: unknown) {
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }
    throw new functions.https.HttpsError('internal', error instanceof Error ? error.message : 'Erreur interne', { businessCode: 'INTERNAL_ERROR' });
  }
});

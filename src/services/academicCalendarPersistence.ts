import { Firestore, collection, doc, runTransaction, writeBatch } from 'firebase/firestore';
import type { AcademicYear, Period, School } from '../types';

export type CreateAcademicYearResult = {
  createdYear: AcademicYear;
  activatedYear: AcademicYear | null;
  closedYear: AcademicYear | null;
  updatedSchool: Pick<School, 'id' | 'activeAcademicYearId' | 'updatedAt' | 'updatedBy' | 'version'> | null;
};

export type ActivateAcademicYearResult = {
  activatedYear: AcademicYear;
  closedYear: AcademicYear | null;
  activeAcademicYearId: string;
  updatedSchool: Pick<School, 'id' | 'activeAcademicYearId' | 'updatedAt' | 'updatedBy' | 'version'>;
};

export type UpdateAcademicYearStatusResult = {
  updatedYear: AcademicYear;
};

export type CreatePeriodResult = {
  createdPeriod: Period;
  updatedAcademicYear: Pick<AcademicYear, 'id' | 'version'>;
};

export type OpenPeriodResult = {
  openedPeriod: Period;
  closedPeriod: Period | null;
  openPeriodId: string;
  updatedAcademicYear: Pick<AcademicYear, 'id' | 'openPeriodId' | 'updatedAt' | 'updatedBy' | 'version'>;
};

export type UpdatePeriodStatusResult = {
  updatedPeriod: Period;
};

export async function createAcademicYear(
  firestore: Firestore,
  currentSchoolId: string,
  payload: AcademicYear,
  activateImmediately: boolean = false
): Promise<CreateAcademicYearResult> {
  if (payload.schoolId !== currentSchoolId) {
    throw new Error("L'identifiant de l'Ǹcole ne correspond pas  l'Ǹcole active.");
  }

  const yearRef = doc(collection(firestore, 'academicYears'), payload.id);

  if (activateImmediately) {
    return runTransaction(firestore, async (transaction) => {
      const schoolRef = doc(firestore, 'schools', currentSchoolId);
      const schoolSnap = await transaction.get(schoolRef);
      if (!schoolSnap.exists()) throw new Error("%cole introuvable.");
      
      const schoolData = schoolSnap.data() as School;
      const currentActiveYearId = schoolData.activeAcademicYearId;
      let closedYear: AcademicYear | null = null;
      
      if (currentActiveYearId) {
        const oldYearRef = doc(firestore, 'academicYears', currentActiveYearId);
        const oldYearSnap = await transaction.get(oldYearRef);
        if (oldYearSnap.exists() && (oldYearSnap.data() as AcademicYear).status === 'active') {
          const oldData = oldYearSnap.data() as AcademicYear;
          closedYear = {
            ...oldData,
            status: 'closed',
            updatedAt: payload.updatedAt,
            updatedBy: payload.updatedBy,
            version: (oldData.version || 0) + 1
          };
          transaction.update(oldYearRef, { ...closedYear });
        }
      }

      const createdYear = { ...payload, status: 'active', version: 1 } as AcademicYear;
      transaction.set(yearRef, createdYear);

      const updatedSchool = {
        id: schoolData.id,
        activeAcademicYearId: payload.id,
        updatedAt: payload.updatedAt,
        updatedBy: payload.updatedBy,
        version: (schoolData.version || 0) + 1
      };
      
      transaction.update(schoolRef, { ...updatedSchool });
      
      return { createdYear, activatedYear: createdYear, closedYear, updatedSchool };
    });
  } else {
    const createdYear = { ...payload, version: 1 };
    const batch = writeBatch(firestore);
    batch.set(yearRef, createdYear);
    await batch.commit();
    return { createdYear, activatedYear: null, closedYear: null, updatedSchool: null };
  }
}

export async function activateAcademicYear(
  firestore: Firestore,
  currentSchoolId: string,
  yearId: string,
  userId: string
): Promise<ActivateAcademicYearResult> {
  const schoolRef = doc(firestore, 'schools', currentSchoolId);
  const targetYearRef = doc(firestore, 'academicYears', yearId);
  const now = new Date().toISOString();

  return runTransaction(firestore, async (transaction) => {
    const schoolSnap = await transaction.get(schoolRef);
    if (!schoolSnap.exists()) {
      throw new Error("%cole introuvable.");
    }
    const schoolData = schoolSnap.data() as School;

    const targetSnap = await transaction.get(targetYearRef);
    if (!targetSnap.exists()) {
      throw new Error("L'annǸe acadǸmique cible n'existe pas.");
    }
    const targetData = targetSnap.data() as AcademicYear;
    
    if (targetData.schoolId !== currentSchoolId) {
      throw new Error("OpǸration non autorisǸe sur une autre Ǹcole.");
    }
    if (targetData.status === 'archived') {
      throw new Error("Impossible d'activer une annǸe archivǸe.");
    }

    const currentActiveYearId = schoolData.activeAcademicYearId;
    let closedYear: AcademicYear | null = null;
    
    if (currentActiveYearId && currentActiveYearId !== yearId) {
      const oldYearRef = doc(firestore, 'academicYears', currentActiveYearId);
      const oldYearSnap = await transaction.get(oldYearRef);
      if (oldYearSnap.exists() && (oldYearSnap.data() as AcademicYear).status === 'active') {
        const oldData = oldYearSnap.data() as AcademicYear;
        closedYear = {
          ...oldData,
          status: 'closed',
          updatedAt: now,
          updatedBy: userId,
          version: (oldData.version || 0) + 1
        };
        transaction.update(oldYearRef, { ...closedYear });
      }
    }

    const activatedYear = {
      ...targetData,
      status: 'active',
      updatedAt: now,
      updatedBy: userId,
      version: (targetData.version || 0) + 1
    } as AcademicYear;
    
    transaction.update(targetYearRef, { ...activatedYear });

    const updatedSchool = {
      id: schoolData.id,
      activeAcademicYearId: yearId,
      updatedAt: now,
      updatedBy: userId,
      version: (schoolData.version || 0) + 1
    };

    transaction.update(schoolRef, { ...updatedSchool });

    return { activatedYear, closedYear, activeAcademicYearId: yearId, updatedSchool };
  });
}

export async function updateAcademicYearStatus(
  firestore: Firestore,
  currentSchoolId: string,
  yearId: string,
  newStatus: AcademicYear['status'],
  userId: string
): Promise<UpdateAcademicYearStatusResult> {
  const yearRef = doc(firestore, 'academicYears', yearId);
  const now = new Date().toISOString();

  return runTransaction(firestore, async (transaction) => {
    const snap = await transaction.get(yearRef);
    if (!snap.exists()) throw new Error("Document introuvable.");
    
    const data = snap.data() as AcademicYear;
    if (data.schoolId !== currentSchoolId) throw new Error("Accs refusǸ.");
    
    const updatedYear = {
      ...data,
      status: newStatus,
      updatedAt: now,
      updatedBy: userId,
      version: (data.version || 0) + 1
    };
    
    transaction.update(yearRef, { ...updatedYear });
    return { updatedYear };
  });
}

export async function createPeriod(
  firestore: Firestore,
  currentSchoolId: string,
  payload: Period
): Promise<CreatePeriodResult> {
  if (payload.schoolId !== currentSchoolId) {
    throw new Error("L'identifiant de l'Ǹcole ne correspond pas  l'Ǹcole active.");
  }

  const periodRef = doc(collection(firestore, 'periods'), payload.id);
  const yearRef = doc(firestore, 'academicYears', payload.academicYearId);
  
  return runTransaction(firestore, async (transaction) => {
    const yearSnap = await transaction.get(yearRef);
    if (!yearSnap.exists()) {
      throw new Error("AnnǸe acadǸmique introuvable.");
    }
    const yearData = yearSnap.data() as AcademicYear;
    if (yearData.schoolId !== currentSchoolId) {
      throw new Error("OpǸration non autorisǸe sur une autre Ǹcole.");
    }

    const createdPeriod = { ...payload, version: 1 };
    transaction.set(periodRef, createdPeriod);

    const updatedAcademicYear = {
      id: yearData.id,
      version: (yearData.version || 0) + 1
    };
    transaction.update(yearRef, { ...updatedAcademicYear });

    return { createdPeriod, updatedAcademicYear };
  });
}

export async function openPeriod(
  firestore: Firestore,
  currentSchoolId: string,
  academicYearId: string,
  periodId: string,
  userId: string
): Promise<OpenPeriodResult> {
  const yearRef = doc(firestore, 'academicYears', academicYearId);
  const targetPeriodRef = doc(firestore, 'periods', periodId);
  const now = new Date().toISOString();

  return runTransaction(firestore, async (transaction) => {
    const yearSnap = await transaction.get(yearRef);
    if (!yearSnap.exists()) {
      throw new Error("AnnǸe acadǸmique introuvable.");
    }
    const yearData = yearSnap.data() as AcademicYear;

    if (yearData.schoolId !== currentSchoolId) {
      throw new Error("OpǸration non autorisǸe sur une autre Ǹcole.");
    }

    const targetSnap = await transaction.get(targetPeriodRef);
    if (!targetSnap.exists()) {
      throw new Error("PǸriode cible introuvable.");
    }
    const targetData = targetSnap.data() as Period;
    
    if (targetData.schoolId !== currentSchoolId) {
      throw new Error("Accs refusǸ.");
    }
    if (targetData.academicYearId !== academicYearId) {
      throw new Error("IncohǸrence de l'annǸe acadǸmique.");
    }

    const currentOpenPeriodId = yearData.openPeriodId;
    let closedPeriod: Period | null = null;

    if (currentOpenPeriodId && currentOpenPeriodId !== periodId) {
      const oldPeriodRef = doc(firestore, 'periods', currentOpenPeriodId);
      const oldPeriodSnap = await transaction.get(oldPeriodRef);
      if (oldPeriodSnap.exists() && (oldPeriodSnap.data() as Period).status === 'open') {
        const oldData = oldPeriodSnap.data() as Period;
        closedPeriod = {
          ...oldData,
          status: 'closed',
          updatedAt: now,
          updatedBy: userId,
          version: (oldData.version || 0) + 1
        };
        transaction.update(oldPeriodRef, { ...closedPeriod });
      }
    }

    const openedPeriod = {
      ...targetData,
      status: 'open',
      updatedAt: now,
      updatedBy: userId,
      version: (targetData.version || 0) + 1
    } as Period;
    
    transaction.update(targetPeriodRef, { ...openedPeriod });

    const updatedAcademicYear = {
      id: yearData.id,
      openPeriodId: periodId,
      updatedAt: now,
      updatedBy: userId,
      version: (yearData.version || 0) + 1
    };

    transaction.update(yearRef, { ...updatedAcademicYear });

    return { openedPeriod, closedPeriod, openPeriodId: periodId, updatedAcademicYear };
  });
}

export async function updatePeriodStatus(
  firestore: Firestore,
  currentSchoolId: string,
  periodId: string,
  newStatus: Period['status'],
  userId: string
): Promise<UpdatePeriodStatusResult> {
  const periodRef = doc(firestore, 'periods', periodId);
  const now = new Date().toISOString();

  return runTransaction(firestore, async (transaction) => {
    const snap = await transaction.get(periodRef);
    if (!snap.exists()) throw new Error("Document introuvable.");
    
    const data = snap.data() as Period;
    if (data.schoolId !== currentSchoolId) throw new Error("Accs refusǸ.");
    
    const updatedPeriod = {
      ...data,
      status: newStatus,
      updatedAt: now,
      updatedBy: userId,
      version: (data.version || 0) + 1
    };
    
    transaction.update(periodRef, { ...updatedPeriod });
    return { updatedPeriod };
  });
}

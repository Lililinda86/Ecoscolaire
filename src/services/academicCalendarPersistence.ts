import { Firestore, collection, doc, runTransaction } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
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
  updatedAcademicYear: Pick<AcademicYear, 'id' | 'openPeriodId'>;
};

export type OpenPeriodResult = {
  openedPeriod: Period;
  openPeriodId: string;
  updatedAcademicYear: Pick<AcademicYear, 'id' | 'openPeriodId'>;
};

export type UpdatePeriodStatusResult = {
  updatedPeriod: Period;
  updatedAcademicYear: Pick<AcademicYear, 'id' | 'openPeriodId'>;
};

export type UpdatePeriodResult = { updatedPeriod: Period };

type ManagePeriodInput = {
  action: 'CREATE' | 'UPDATE' | 'OPEN' | 'CLOSE';
  schoolId: string;
  academicYearId: string;
  periodId?: string;
  profile?: Pick<Period, 'name' | 'type' | 'order' | 'startDate' | 'endDate'> & {
    testFixture?: true;
    testRunId?: string;
  };
};

type ManagePeriodOutput = {
  success: true;
  period: Period;
  academicYear: Pick<AcademicYear, 'id' | 'openPeriodId'>;
};

async function callManagePeriod(payload: ManagePeriodInput): Promise<ManagePeriodOutput> {
  const callable = httpsCallable<ManagePeriodInput, ManagePeriodOutput>(getFunctions(), 'manageAcademicPeriod');
  return (await callable(payload)).data;
}

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
      const yearSnap = await transaction.get(yearRef);
      if (yearSnap.exists()) {
        const existingData = yearSnap.data() as AcademicYear;
        if (
          existingData.schoolId === payload.schoolId &&
          existingData.startDate === payload.startDate &&
          existingData.endDate === payload.endDate &&
          existingData.name.trim().toLowerCase() === payload.name.trim().toLowerCase()
        ) {
          return { createdYear: existingData, activatedYear: null, closedYear: null, updatedSchool: null };
        }
        throw new Error("Cette année académique existe déjà pour cette école avec des données différentes.");
      }
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
    return runTransaction(firestore, async (transaction) => {
      const yearSnap = await transaction.get(yearRef);
      if (yearSnap.exists()) {
        const existingData = yearSnap.data() as AcademicYear;
        if (
          existingData.schoolId === payload.schoolId &&
          existingData.startDate === payload.startDate &&
          existingData.endDate === payload.endDate &&
          existingData.name.trim().toLowerCase() === payload.name.trim().toLowerCase()
        ) {
          return { createdYear: existingData, activatedYear: null, closedYear: null, updatedSchool: null };
        }
        throw new Error("Cette année académique existe déjà pour cette école avec des données différentes.");
      }
      const createdYear = { ...payload, version: 1 };
      transaction.set(yearRef, createdYear);
      return { createdYear, activatedYear: null, closedYear: null, updatedSchool: null };
    });
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
  _firestore: Firestore,
  currentSchoolId: string,
  payload: Period
): Promise<CreatePeriodResult> {
  const result = await callManagePeriod({
    action: 'CREATE', schoolId: currentSchoolId, academicYearId: payload.academicYearId,
    profile: {
      name: payload.name, type: payload.type, order: payload.order,
      startDate: payload.startDate, endDate: payload.endDate,
      ...('testFixture' in payload && payload.testFixture === true
        ? { testFixture: true as const, testRunId: String(payload.testRunId || '') }
        : {}),
    },
  });
  return { createdPeriod: result.period, updatedAcademicYear: result.academicYear };
}

export async function updatePeriod(
  _firestore: Firestore,
  currentSchoolId: string,
  payload: Period,
): Promise<UpdatePeriodResult> {
  const result = await callManagePeriod({
    action: 'UPDATE', schoolId: currentSchoolId, academicYearId: payload.academicYearId,
    periodId: payload.id,
    profile: { name: payload.name, type: payload.type, order: payload.order, startDate: payload.startDate, endDate: payload.endDate },
  });
  return { updatedPeriod: result.period };
}

export async function openPeriod(
  _firestore: Firestore,
  currentSchoolId: string,
  academicYearId: string,
  periodId: string,
  _userId: string
): Promise<OpenPeriodResult> {
  void _userId;
  const result = await callManagePeriod({ action: 'OPEN', schoolId: currentSchoolId, academicYearId, periodId });
  return { openedPeriod: result.period, openPeriodId: periodId, updatedAcademicYear: result.academicYear };
}

export async function updatePeriodStatus(
  _firestore: Firestore,
  currentSchoolId: string,
  periodId: string,
  newStatus: Period['status'],
  _userId: string,
  academicYearId?: string,
): Promise<UpdatePeriodStatusResult> {
  void _userId;
  if (newStatus !== 'closed' || !academicYearId) throw new Error('Transition de période non autorisée.');
  const result = await callManagePeriod({ action: 'CLOSE', schoolId: currentSchoolId, academicYearId, periodId });
  return { updatedPeriod: result.period, updatedAcademicYear: result.academicYear };
}

export type UpdateAcademicYearBoundsInput = {
  schoolId: string;
  academicYearId: string;
  startDate: string;
  endDate: string;
};

export type UpdateAcademicYearBoundsOutput = {
  success: boolean;
  academicYearId: string;
  startDate: string;
  endDate: string;
};

export async function updateAcademicYearBounds(
  payload: UpdateAcademicYearBoundsInput
): Promise<UpdateAcademicYearBoundsOutput> {
  const functions = getFunctions();
  const callable = httpsCallable<UpdateAcademicYearBoundsInput, UpdateAcademicYearBoundsOutput>(
    functions,
    'updateAcademicYearBounds'
  );
  
  const result = await callable(payload);
  return result.data;
}

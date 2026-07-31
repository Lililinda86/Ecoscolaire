import { describe, test, beforeAll, beforeEach, afterAll, expect } from 'vitest';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, Firestore } from 'firebase/firestore';
import { createAcademicYear, activateAcademicYear, openPeriod } from '../../src/services/academicCalendarPersistence';
import * as fs from 'fs';

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error('FIRESTORE_EMULATOR_HOST requis : exécution interdite hors émulateur.');
}

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST!.split(':')[0];
  const port = parseInt(process.env.FIRESTORE_EMULATOR_HOST!.split(':')[1] || '8080', 10);
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-ecoscolaire-academic-calendar',
    firestore: {
      host,
      port,
      rules: fs.readFileSync('firestore.rules', 'utf8')
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Academic Calendar Transactions (Emulator)', () => {

  test('Deux activations concurrentes (Scénario Historique sans version)', async () => {
    const adminId = 'admin_123';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'schools', 'school_historic'), {
        id: 'school_historic',
        name: 'Historic School',
        academicYear: '2022-2023'
      });
      await setDoc(doc(db, 'academicYears', 'ay_A'), {
        id: 'ay_A', schoolId: 'school_historic', name: 'AY A', status: 'draft',
        startDate: '2023-09-01', endDate: '2024-06-30', createdAt: '2023-01-01', createdBy: 'admin', updatedAt: '2023-01-01', updatedBy: 'admin'
      });
      await setDoc(doc(db, 'academicYears', 'ay_B'), {
        id: 'ay_B', schoolId: 'school_historic', name: 'AY B', status: 'draft',
        startDate: '2024-09-01', endDate: '2025-06-30', createdAt: '2023-01-01', createdBy: 'admin', updatedAt: '2023-01-01', updatedBy: 'admin'
      });
      await setDoc(doc(db, 'users', adminId), {
        id: adminId,
        role: 'director',
        schoolId: 'school_historic',
        active: true
      });
    });

    const authedContext = testEnv.authenticatedContext(adminId, {
      role: 'director',
      schools: ['school_historic']
    });
    const db = authedContext.firestore() as Firestore;
    
    const results = await Promise.allSettled([
      activateAcademicYear(db, 'school_historic', 'ay_A', adminId),
      activateAcademicYear(db, 'school_historic', 'ay_B', adminId)
    ]);
    
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);
    
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      const schoolDoc = await getDoc(doc(adminDb, 'schools', 'school_historic'));
      const ayADoc = await getDoc(doc(adminDb, 'academicYears', 'ay_A'));
      const ayBDoc = await getDoc(doc(adminDb, 'academicYears', 'ay_B'));
      
      const schoolData = schoolDoc.data()!;
      const ayAData = ayADoc.data()!;
      const ayBData = ayBDoc.data()!;
      
      expect(schoolData.version).toBe(1);
      
      const activeId = schoolData.activeAcademicYearId;
      expect(activeId).toBeDefined();
      expect(['ay_A', 'ay_B']).toContain(activeId);
      
      if (activeId === 'ay_A') {
        expect(ayAData.status).toBe('active');
        expect(ayBData.status).toBe('draft');
      } else {
        expect(ayBData.status).toBe('active');
        expect(ayAData.status).toBe('draft');
      }
    });
  });

  test('Deux ouvertures concurrentes de périodes (Scénario Historique sans version)', async () => {
    const adminId = 'admin_123';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'schools', 'school_p'), {
        id: 'school_p',
        name: 'School P',
        academicYear: '2022-2023'
      });
      await setDoc(doc(db, 'academicYears', 'ay_open_test'), {
        id: 'ay_open_test', schoolId: 'school_p', name: 'AY Test', status: 'active',
        startDate: '2023-09-01', endDate: '2024-06-30', createdAt: '2023-01-01', createdBy: 'admin', updatedAt: '2023-01-01', updatedBy: 'admin'
      });
      await setDoc(doc(db, 'periods', 'period_A'), {
        id: 'period_A', schoolId: 'school_p', academicYearId: 'ay_open_test', status: 'draft',
        name: 'P1', type: 'trimestre', order: 1, startDate: '2023-09-01', endDate: '2023-12-31', createdAt: '2023-01-01', createdBy: 'admin', updatedAt: '2023-01-01', updatedBy: 'admin'
      });
      await setDoc(doc(db, 'periods', 'period_B'), {
        id: 'period_B', schoolId: 'school_p', academicYearId: 'ay_open_test', status: 'draft',
        name: 'P2', type: 'trimestre', order: 2, startDate: '2024-01-01', endDate: '2024-03-31', createdAt: '2023-01-01', createdBy: 'admin', updatedAt: '2023-01-01', updatedBy: 'admin'
      });
      await setDoc(doc(db, 'users', adminId), {
        id: adminId,
        role: 'director',
        schoolId: 'school_p',
        active: true
      });
    });

    const authedContext = testEnv.authenticatedContext(adminId, {
      role: 'director',
      schools: ['school_p']
    });
    const db = authedContext.firestore() as Firestore;
    
    const results = await Promise.allSettled([
      openPeriod(db, 'school_p', 'ay_open_test', 'period_A', adminId),
      openPeriod(db, 'school_p', 'ay_open_test', 'period_B', adminId)
    ]);
    
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(1);
    
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      const ayDoc = await getDoc(doc(adminDb, 'academicYears', 'ay_open_test'));
      const pADoc = await getDoc(doc(adminDb, 'periods', 'period_A'));
      const pBDoc = await getDoc(doc(adminDb, 'periods', 'period_B'));
      
      const ayData = ayDoc.data()!;
      expect(ayData.version).toBe(1);
      
      const openId = ayData.openPeriodId;
      expect(['period_A', 'period_B']).toContain(openId);
      
      if (openId === 'period_A') {
        expect(pADoc.data()!.status).toBe('open');
        expect(pBDoc.data()!.status).toBe('draft');
      } else {
        expect(pBDoc.data()!.status).toBe('open');
        expect(pADoc.data()!.status).toBe('draft');
      }
    });
  });

  test('Pointeur obsolète : School.activeAcademicYearId pointe vers un document inexistant', async () => {
    const adminId = 'admin_123';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'schools', 'school_obs_A'), {
        id: 'school_obs_A',
        activeAcademicYearId: 'non_existent_ay'
      });
      await setDoc(doc(db, 'academicYears', 'ay_new'), {
        id: 'ay_new', schoolId: 'school_obs_A', name: 'AY New', status: 'draft',
        startDate: '2023-09-01', endDate: '2024-06-30', createdAt: '2023-01-01', createdBy: 'admin', updatedAt: '2023-01-01', updatedBy: 'admin'
      });
      await setDoc(doc(db, 'users', adminId), {
        id: adminId,
        role: 'director',
        schoolId: 'school_obs_A',
        active: true
      });
    });

    const authedContext = testEnv.authenticatedContext(adminId);
    const db = authedContext.firestore() as Firestore;
    
    await expect(activateAcademicYear(db, 'school_obs_A', 'ay_new', adminId)).resolves.toBeDefined();
    
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      const schoolDoc = await getDoc(doc(adminDb, 'schools', 'school_obs_A'));
      expect(schoolDoc.data()!.activeAcademicYearId).toBe('ay_new');
      const ayDoc = await getDoc(doc(adminDb, 'academicYears', 'ay_new'));
      expect(ayDoc.data()!.status).toBe('active');
    });
  });

  test('Pointeur obsolète : AcademicYear.openPeriodId pointe vers une Period inexistante', async () => {
    const adminId = 'admin_123';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'schools', 'school_B'), {
        id: 'school_B',
        name: 'School B',
        openPeriodId: 'non_existent_period'
      });
      await setDoc(doc(db, 'academicYears', 'ay_obs_B'), {
        id: 'ay_obs_B', schoolId: 'school_B', name: 'AY Obs B', status: 'active', openPeriodId: 'non_existent_period',
        startDate: '2023-09-01', endDate: '2024-06-30', createdAt: '2023-01-01', createdBy: 'admin', updatedAt: '2023-01-01', updatedBy: 'admin'
      });
      await setDoc(doc(db, 'periods', 'period_new'), {
        id: 'period_new', schoolId: 'school_B', academicYearId: 'ay_obs_B', status: 'draft',
        name: 'P New', type: 'trimestre', order: 1, startDate: '2023-09-01', endDate: '2023-12-31', createdAt: '2023-01-01', createdBy: 'admin', updatedAt: '2023-01-01', updatedBy: 'admin'
      });
      await setDoc(doc(db, 'users', adminId), {
        id: adminId,
        role: 'director',
        schoolId: 'school_B',
        active: true
      });
    });

    const authedContext = testEnv.authenticatedContext(adminId);
    const db = authedContext.firestore() as Firestore;
    
    await expect(openPeriod(db, 'school_B', 'ay_obs_B', 'period_new', adminId)).resolves.toBeDefined();
    
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      const ayDoc = await getDoc(doc(adminDb, 'academicYears', 'ay_obs_B'));
      expect(ayDoc.data()!.openPeriodId).toBe('period_new');
      const pDoc = await getDoc(doc(adminDb, 'periods', 'period_new'));
      expect(pDoc.data()!.status).toBe('open');
    });
  });

  test('Création concurrente d\'une année académique (idempotence vs collision)', async () => {
    const adminId = 'admin_123';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await setDoc(doc(db, 'schools', 'school_create'), {
        id: 'school_create',
        name: 'School Create'
      });
      await setDoc(doc(db, 'users', adminId), {
        id: adminId,
        role: 'director',
        schoolId: 'school_create',
        active: true
      });
    });

    const authedContext = testEnv.authenticatedContext(adminId);
    const db = authedContext.firestore() as Firestore;
    
    const payload1 = {
      id: 'ay_create_concurrent',
      schoolId: 'school_create',
      name: '2026-2027',
      startDate: '2026-09-01',
      endDate: '2027-06-30',
      status: 'draft' as const,
      createdAt: '2023-01-01',
      createdBy: 'admin',
      updatedAt: '2023-01-01',
      updatedBy: 'admin'
    };
    
    const payload2 = {
      ...payload1,
      name: '2026-2027' // Same data = idempotent
    };

    const payload3 = {
      ...payload1,
      name: 'Diff Name' // Different data = collision
    };

    // 1. Concurrency with same data
    const results = await Promise.allSettled([
      createAcademicYear(db, 'school_create', payload1),
      createAcademicYear(db, 'school_create', payload2)
    ]);
    
    // Both should succeed (one creates, one returns existing)
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(2);

    // 2. Subsequent call with different data
    await expect(createAcademicYear(db, 'school_create', payload3)).rejects.toThrow(/données différentes/);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      const docs = await getDoc(doc(adminDb, 'academicYears', 'ay_create_concurrent'));
      expect(docs.exists()).toBe(true);
      expect(docs.data()!.name).toBe('2026-2027');
    });
  });
});

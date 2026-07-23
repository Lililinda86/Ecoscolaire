import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'fs';
import { setDoc, updateDoc, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { test } from '@playwright/test';
const { describe, beforeAll: before, beforeEach, afterAll: after } = test;
const it = test;

let testEnv;

before(async () => {
  // Read rules from file
  const rules = fs.readFileSync('firestore.rules', 'utf8');

  // Initialize test environment
  testEnv = await initializeTestEnvironment({
    projectId: 'ecoscolaire-test-security',
    firestore: {
      rules: rules
    }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

after(async () => {
  await testEnv.cleanup();
});

describe('SaaS Fields Security Rules', () => {

  it('Owner modifie school.name -> autorisé', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schools', 'school-123'), { name: 'Initial Name' });
    });

    const context = testEnv.authenticatedContext('owner-uid', { 
      email: 'owner@test.com'
    });
    // Need to set up the user doc for getRole() and getUserSchoolId()
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'owner-uid'), { role: 'owner', schoolId: 'school-123', active: true });
    });

    await assertSucceeds(
      updateDoc(doc(context.firestore(), 'schools', 'school-123'), { name: 'New Name' })
    );
  });

  it('Owner modifie subscriptionPlan -> refusé', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schools', 'school-123'), { name: 'Initial', subscriptionPlan: 'starter' });
      await setDoc(doc(context.firestore(), 'users', 'owner-uid'), { role: 'owner', schoolId: 'school-123', active: true });
    });

    const context = testEnv.authenticatedContext('owner-uid');
    
    await assertFails(
      updateDoc(doc(context.firestore(), 'schools', 'school-123'), { subscriptionPlan: 'premium' })
    );
  });

  it('Owner modifie subscriptionStatus -> refusé', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schools', 'school-123'), { subscriptionStatus: 'trial' });
      await setDoc(doc(context.firestore(), 'users', 'owner-uid'), { role: 'owner', schoolId: 'school-123', active: true });
    });
    const context = testEnv.authenticatedContext('owner-uid');
    await assertFails(updateDoc(doc(context.firestore(), 'schools', 'school-123'), { subscriptionStatus: 'active' }));
  });

  it('Owner modifie isInternalSchool -> refusé', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schools', 'school-123'), { name: 'School' });
      await setDoc(doc(context.firestore(), 'users', 'owner-uid'), { role: 'owner', schoolId: 'school-123', active: true });
    });
    const context = testEnv.authenticatedContext('owner-uid');
    await assertFails(updateDoc(doc(context.firestore(), 'schools', 'school-123'), { isInternalSchool: true }));
  });

  it('SuperAdmin modifie subscriptionPlan -> autorisé', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schools', 'school-123'), { subscriptionPlan: 'starter' });
      await setDoc(doc(context.firestore(), 'users', 'sa-uid'), { role: 'superAdmin', active: true });
    });
    const context = testEnv.authenticatedContext('sa-uid');
    await assertSucceeds(updateDoc(doc(context.firestore(), 'schools', 'school-123'), { subscriptionPlan: 'premium' }));
  });

  it('SuperAdmin modifie isInternalSchool -> autorisé', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schools', 'school-123'), { isInternalSchool: false });
      await setDoc(doc(context.firestore(), 'users', 'sa-uid'), { role: 'superAdmin', active: true });
    });
    const context = testEnv.authenticatedContext('sa-uid');
    await assertSucceeds(updateDoc(doc(context.firestore(), 'schools', 'school-123'), { isInternalSchool: true }));
  });

  it('Director modifie subscriptionStatus -> refusé', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'schools', 'school-123'), { subscriptionStatus: 'trial' });
      await setDoc(doc(context.firestore(), 'users', 'dir-uid'), { role: 'director', schoolId: 'school-123', active: true });
    });
    const context = testEnv.authenticatedContext('dir-uid');
    await assertFails(updateDoc(doc(context.firestore(), 'schools', 'school-123'), { subscriptionStatus: 'active' }));
  });

  it('Utilisateur normal modifie son propre displayName -> autorisé', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'normal-uid'), { role: 'parent', active: true, displayName: 'Old' });
    });
    const context = testEnv.authenticatedContext('normal-uid');
    await assertSucceeds(updateDoc(doc(context.firestore(), 'users', 'normal-uid'), { displayName: 'New Name' }));
  });

  it('Utilisateur normal modifie son propre rôle -> refusé', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'normal-uid'), { role: 'parent', active: true });
    });
    const context = testEnv.authenticatedContext('normal-uid');
    await assertFails(updateDoc(doc(context.firestore(), 'users', 'normal-uid'), { role: 'superAdmin' }));
  });

  it('Owner modifie le rôle d\'un autre utilisateur vers superAdmin -> refusé', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'owner-uid'), { role: 'owner', schoolId: 'school-123', active: true });
      await setDoc(doc(context.firestore(), 'users', 'teacher-uid'), { role: 'teacher', schoolId: 'school-123', active: true });
    });
    const context = testEnv.authenticatedContext('owner-uid');
    await assertFails(updateDoc(doc(context.firestore(), 'users', 'teacher-uid'), { role: 'superAdmin' }));
  });

  it('SuperAdmin modifie le rôle d\'un utilisateur -> autorisé', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'sa-uid'), { role: 'superAdmin', active: true });
      await setDoc(doc(context.firestore(), 'users', 'teacher-uid'), { role: 'teacher', schoolId: 'school-123', active: true });
    });
    const context = testEnv.authenticatedContext('sa-uid');
    await assertSucceeds(updateDoc(doc(context.firestore(), 'users', 'teacher-uid'), { role: 'director' }));
  });

});

describe('Technical Specialties Security Rules', () => {
  const SCHOOL_A_ID = 'school-A';
  const SCHOOL_B_ID = 'school-B';

  it('Lecture autorisée pour un utilisateur actif de la même école', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-1'), { schoolId: SCHOOL_A_ID, name: "Électricité", code: "ELEC", isActive: true });
      await setDoc(doc(context.firestore(), 'users', 'user-A'), { role: 'teacher', schoolId: SCHOOL_A_ID, active: true });
    });
    const context = testEnv.authenticatedContext('user-A');
    await assertSucceeds(
      getDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-1'))
    );
  });

  it('Lecture refusée pour un utilisateur rattaché à une autre école', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-1'), { schoolId: SCHOOL_A_ID, name: "Électricité", code: "ELEC", isActive: true });
      await setDoc(doc(context.firestore(), 'users', 'user-B'), { role: 'teacher', schoolId: SCHOOL_B_ID, active: true });
    });
    const context = testEnv.authenticatedContext('user-B');
    await assertFails(
      getDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-1'))
    );
  });

  it('Création autorisée pour un rôle canManagePedagogy dans sa propre école', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'owner-A'), { role: 'owner', schoolId: SCHOOL_A_ID, active: true });
    });
    const context = testEnv.authenticatedContext('owner-A');
    await assertSucceeds(
      setDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-new'), {
        schoolId: SCHOOL_A_ID,
        name: "Électricité",
        code: "ELEC",
        isActive: true,
        displayOrder: 1
      })
    );
  });

  it('Création refusée lorsque schoolId est absent', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'owner-A'), { role: 'owner', schoolId: SCHOOL_A_ID, active: true });
    });
    const context = testEnv.authenticatedContext('owner-A');
    await assertFails(
      setDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-new'), {
        name: "Électricité",
        code: "ELEC",
        isActive: true,
        displayOrder: 1
      })
    );
  });

  it('Création refusée pour une autre école', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'owner-A'), { role: 'owner', schoolId: SCHOOL_A_ID, active: true });
    });
    const context = testEnv.authenticatedContext('owner-A');
    await assertFails(
      setDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-new'), {
        schoolId: SCHOOL_B_ID,
        name: "Électricité",
        code: "ELEC",
        isActive: true,
        displayOrder: 1
      })
    );
  });

  it('Mise à jour autorisée si schoolId inchangé', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-1'), { schoolId: SCHOOL_A_ID, name: "Électricité", code: "ELEC", isActive: true });
      await setDoc(doc(context.firestore(), 'users', 'owner-A'), { role: 'owner', schoolId: SCHOOL_A_ID, active: true });
    });
    const context = testEnv.authenticatedContext('owner-A');
    await assertSucceeds(
      updateDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-1'), { name: "Nouveau Nom", schoolId: SCHOOL_A_ID })
    );
  });

  it('Mise à jour refusée si schoolId modifié', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-1'), { schoolId: SCHOOL_A_ID, name: "Électricité", code: "ELEC", isActive: true });
      await setDoc(doc(context.firestore(), 'users', 'owner-A'), { role: 'owner', schoolId: SCHOOL_A_ID, active: true });
    });
    const context = testEnv.authenticatedContext('owner-A');
    await assertFails(
      updateDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-1'), { name: "Nouveau Nom", schoolId: SCHOOL_B_ID })
    );
  });

  it('Suppression autorisée pour canManagePedagogy dans la même école', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-1'), { schoolId: SCHOOL_A_ID, name: "Électricité", code: "ELEC", isActive: true });
      await setDoc(doc(context.firestore(), 'users', 'owner-A'), { role: 'owner', schoolId: SCHOOL_A_ID, active: true });
    });
    const context = testEnv.authenticatedContext('owner-A');
    await assertSucceeds(
      deleteDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-1'))
    );
  });

  it('Suppression refusée pour une autre école', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-1'), { schoolId: SCHOOL_A_ID, name: "Électricité", code: "ELEC", isActive: true });
      await setDoc(doc(context.firestore(), 'users', 'owner-B'), { role: 'owner', schoolId: SCHOOL_B_ID, active: true });
    });
    const context = testEnv.authenticatedContext('owner-B');
    await assertFails(
      deleteDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-1'))
    );
  });

});

describe('Student Active Status Security Rules', () => {
  const SCHOOL_ID = 'school-A';

  beforeEach(async () => {
    // Set up default users
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'superAdmin-1'), { role: 'superAdmin', schoolId: SCHOOL_ID, active: true });
      await setDoc(doc(ctx.firestore(), 'users', 'owner-1'), { role: 'owner', schoolId: SCHOOL_ID, active: true });
      await setDoc(doc(ctx.firestore(), 'users', 'director-1'), { role: 'director', schoolId: SCHOOL_ID, active: true });
      await setDoc(doc(ctx.firestore(), 'users', 'secretary-1'), { role: 'secretary', schoolId: SCHOOL_ID, active: true });
      // Set up a class and a student
      await setDoc(doc(ctx.firestore(), 'classes', 'class-1'), { schoolId: SCHOOL_ID, name: 'CP', isActive: true });
      await setDoc(doc(ctx.firestore(), 'students', 'student-1'), { schoolId: SCHOOL_ID, name: 'Alice', schoolingStatus: 'active', classId: 'class-1' });
    });
  });

  it('secretary cannot deactivate active student', async () => {
    const context = testEnv.authenticatedContext('secretary-1');
    await assertFails(
      updateDoc(doc(context.firestore(), 'students', 'student-1'), { schoolingStatus: 'inactive', departureReason: 'withdrawn' })
    );
  });

  it('secretary cannot reactivate inactive student', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'students', 'student-1'), { schoolId: SCHOOL_ID, schoolingStatus: 'inactive', classId: 'class-1' });
    });
    const context = testEnv.authenticatedContext('secretary-1');
    await assertFails(
      updateDoc(doc(context.firestore(), 'students', 'student-1'), { schoolingStatus: 'active' })
    );
  });

  it('secretary cannot update deactivation metadata', async () => {
    const context = testEnv.authenticatedContext('secretary-1');
    await assertFails(
      updateDoc(doc(context.firestore(), 'students', 'student-1'), { departureReason: 'withdrawn' })
    );
  });

  it('secretary can perform an allowed ordinary administrative update', async () => {
    const context = testEnv.authenticatedContext('secretary-1');
    await assertSucceeds(
      updateDoc(doc(context.firestore(), 'students', 'student-1'), { name: 'Alice Edited' })
    );
  });

  it('owner can deactivate student', async () => {
    const context = testEnv.authenticatedContext('owner-1');
    await assertSucceeds(
      updateDoc(doc(context.firestore(), 'students', 'student-1'), { schoolingStatus: 'inactive', departureReason: 'withdrawn', classId: 'class-1' })
    );
  });

  it('director can deactivate student', async () => {
    const context = testEnv.authenticatedContext('director-1');
    await assertSucceeds(
      updateDoc(doc(context.firestore(), 'students', 'student-1'), { schoolingStatus: 'inactive', departureReason: 'withdrawn', classId: 'class-1' })
    );
  });

  it('superAdmin can deactivate student', async () => {
    const context = testEnv.authenticatedContext('superAdmin-1');
    await assertSucceeds(
      updateDoc(doc(context.firestore(), 'students', 'student-1'), { schoolingStatus: 'inactive', departureReason: 'withdrawn', classId: 'class-1' })
    );
  });

  it('secretary cannot create DELETE_STUDENT validation request', async () => {
    const context = testEnv.authenticatedContext('secretary-1');
    await assertFails(
      setDoc(doc(context.firestore(), 'validation_requests', 'req-1'), {
        id: 'req-1',
        schoolId: SCHOOL_ID,
        requesterId: 'secretary-1',
        requesterRole: 'secretary',
        actionType: 'DELETE_STUDENT',
        targetCollection: 'students',
        targetDocumentId: 'student-1',
        proposedData: { schoolingStatus: 'inactive' },
        status: 'pending',
        createdAt: new Date().toISOString()
      })
    );
  });

  it('secretary cannot update or approve DELETE_STUDENT request', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'validation_requests', 'req-delete'), {
        schoolId: SCHOOL_ID,
        requesterId: 'some-user',
        requesterRole: 'teacher',
        actionType: 'DELETE_STUDENT',
        status: 'pending'
      });
    });
    const context = testEnv.authenticatedContext('secretary-1');
    await assertFails(
      updateDoc(doc(context.firestore(), 'validation_requests', 'req-delete'), {
        status: 'approved',
        approvedBy: 'secretary-1',
        approvedAt: new Date().toISOString()
      })
    );
  });

  it('secretary cannot change another request into DELETE_STUDENT', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'validation_requests', 'req-other'), {
        schoolId: SCHOOL_ID,
        requesterId: 'secretary-1',
        requesterRole: 'secretary',
        actionType: 'HIGH_EXPENSE',
        status: 'pending'
      });
    });
    const context = testEnv.authenticatedContext('secretary-1');
    await assertFails(
      updateDoc(doc(context.firestore(), 'validation_requests', 'req-other'), {
        actionType: 'DELETE_STUDENT'
      })
    );
  });
});

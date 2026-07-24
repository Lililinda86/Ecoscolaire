import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'fs';
import { setDoc, updateDoc, doc, getDoc, deleteDoc, query, where, collection, getDocs } from 'firebase/firestore';
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
        id: 'spec-new',
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

  it('Suppression interdite même pour canManagePedagogy dans sa propre école', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'technicalSpecialties', 'spec-1'), { schoolId: SCHOOL_A_ID, name: "Électricité", code: "ELEC", isActive: true });
      await setDoc(doc(context.firestore(), 'users', 'owner-A'), { role: 'owner', schoolId: SCHOOL_A_ID, active: true });
    });
    const context = testEnv.authenticatedContext('owner-A');
    await assertFails(
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

describe('Subjects Security Rules', () => {
  const SCHOOL_ID = 'school-A';

  beforeEach(async () => {
    // Set up default users
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'superAdmin-1'), { role: 'superAdmin', active: true });
      await setDoc(doc(ctx.firestore(), 'users', 'owner-1'), { role: 'owner', schoolId: SCHOOL_ID, active: true });
      await setDoc(doc(ctx.firestore(), 'users', 'director-1'), { role: 'director', schoolId: SCHOOL_ID, active: true });
      await setDoc(doc(ctx.firestore(), 'users', 'secretary-1'), { role: 'secretary', schoolId: SCHOOL_ID, active: true });
      await setDoc(doc(ctx.firestore(), 'users', 'teacher-1'), { role: 'teacher', schoolId: SCHOOL_ID, active: true });
    });
  });

  it('owner can create a subject in their school', async () => {
    const context = testEnv.authenticatedContext('owner-1');
    await assertSucceeds(
      setDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        name: 'Mathématiques',
        isActive: true,
        createdAt: '2026-07-23T19:00:00Z',
        createdBy: 'owner-1',
        updatedAt: '2026-07-23T19:00:00Z',
        updatedBy: 'owner-1'
      })
    );
  });

  it('director can create a subject in their school', async () => {
    const context = testEnv.authenticatedContext('director-1');
    await assertSucceeds(
      setDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        name: 'Mathématiques',
        isActive: true,
        createdAt: '2026-07-23T19:00:00Z',
        createdBy: 'director-1',
        updatedAt: '2026-07-23T19:00:00Z',
        updatedBy: 'director-1'
      })
    );
  });

  it('secretary cannot create a subject', async () => {
    const context = testEnv.authenticatedContext('secretary-1');
    await assertFails(
      setDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        name: 'Mathématiques',
        isActive: true,
        createdAt: '2026-07-23T19:00:00Z',
        createdBy: 'secretary-1',
        updatedAt: '2026-07-23T19:00:00Z',
        updatedBy: 'secretary-1'
      })
    );
  });

  it('teacher cannot create a subject', async () => {
    const context = testEnv.authenticatedContext('teacher-1');
    await assertFails(
      setDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        name: 'Mathématiques',
        isActive: true,
        createdAt: '2026-07-23T19:00:00Z',
        createdBy: 'teacher-1',
        updatedAt: '2026-07-23T19:00:00Z',
        updatedBy: 'teacher-1'
      })
    );
  });

  it('creation in another school is denied', async () => {
    const context = testEnv.authenticatedContext('owner-1');
    await assertFails(
      setDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: 'other-school',
        name: 'Mathématiques',
        isActive: true,
        createdAt: '2026-07-23T19:00:00Z',
        createdBy: 'owner-1',
        updatedAt: '2026-07-23T19:00:00Z',
        updatedBy: 'owner-1'
      })
    );
  });

  it('changing schoolId is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        name: 'Mathématiques',
        isActive: true
      });
    });
    const context = testEnv.authenticatedContext('owner-1');
    await assertFails(
      updateDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        schoolId: 'other-school'
      })
    );
  });

  it('modification authorized by direction', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        name: 'Mathématiques',
        isActive: true
      });
    });
    const context = testEnv.authenticatedContext('owner-1');
    await assertSucceeds(
      updateDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        name: 'Maths Sup',
        updatedAt: '2026-07-23T19:05:00Z',
        updatedBy: 'owner-1'
      })
    );
  });

  it('physical delete is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        name: 'Mathématiques',
        isActive: true
      });
    });
    const context = testEnv.authenticatedContext('owner-1');
    await assertFails(
      deleteDoc(doc(context.firestore(), 'subjects', 'subj-1'))
    );
  });

  it('creation without name is denied', async () => {
    const context = testEnv.authenticatedContext('owner-1');
    await assertFails(
      setDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        isActive: true,
        createdAt: '2026-07-23T19:00:00Z',
        createdBy: 'owner-1',
        updatedAt: '2026-07-23T19:00:00Z',
        updatedBy: 'owner-1'
      })
    );
  });

  it('isActive must be a boolean', async () => {
    const context = testEnv.authenticatedContext('owner-1');
    await assertFails(
      setDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        name: 'Mathématiques',
        isActive: 'yes',
        createdAt: '2026-07-23T19:00:00Z',
        createdBy: 'owner-1',
        updatedAt: '2026-07-23T19:00:00Z',
        updatedBy: 'owner-1'
      })
    );
  });

  it('superAdmin can create a subject in any school', async () => {
    const context = testEnv.authenticatedContext('superAdmin-1');
    await assertSucceeds(
      setDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        name: 'Mathématiques',
        isActive: true,
        createdAt: '2026-07-23T19:00:00Z',
        createdBy: 'superAdmin-1',
        updatedAt: '2026-07-23T19:00:00Z',
        updatedBy: 'superAdmin-1'
      })
    );
  });

  it('cross-school read is denied', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: 'other-school',
        name: 'Mathématiques',
        isActive: true
      });
    });
    const context = testEnv.authenticatedContext('owner-1');
    await assertFails(
      getDoc(doc(context.firestore(), 'subjects', 'subj-1'))
    );
  });

  it('id change is denied during update', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        name: 'Mathématiques',
        isActive: true
      });
    });
    const context = testEnv.authenticatedContext('owner-1');
    await assertFails(
      updateDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-changed',
        updatedAt: '2026-07-23T19:05:00Z',
        updatedBy: 'owner-1'
      })
    );
  });

  it('logical deactivate and reactivate are allowed', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        name: 'Mathématiques',
        isActive: true
      });
    });
    const context = testEnv.authenticatedContext('owner-1');
    // Deactivate
    await assertSucceeds(
      updateDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        isActive: false,
        updatedAt: '2026-07-23T19:05:00Z',
        updatedBy: 'owner-1'
      })
    );
    // Reactivate
    await assertSucceeds(
      updateDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        isActive: true,
        updatedAt: '2026-07-23T19:06:00Z',
        updatedBy: 'owner-1'
      })
    );
  });

  it('creation without schoolId is denied', async () => {
    const context = testEnv.authenticatedContext('owner-1');
    await assertFails(
      setDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        name: 'Mathématiques',
        isActive: true,
        createdAt: '2026-07-23T19:00:00Z',
        createdBy: 'owner-1',
        updatedAt: '2026-07-23T19:00:00Z',
        updatedBy: 'owner-1'
      })
    );
  });

  it('creation without audit fields is denied', async () => {
    const context = testEnv.authenticatedContext('owner-1');
    await assertFails(
      setDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        name: 'Mathématiques',
        isActive: true
      })
    );
  });

  it('legacy subject without isActive remains readable', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        name: 'Mathématiques'
      });
    });
    const context = testEnv.authenticatedContext('owner-1');
    await assertSucceeds(
      getDoc(doc(context.firestore(), 'subjects', 'subj-1'))
    );
  });

  it('legacy subject without schoolId is unreadable by owner', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'subjects', 'subj-1'), {
        id: 'subj-1',
        name: 'Mathématiques'
      });
    });
    const context = testEnv.authenticatedContext('owner-1');
    await assertFails(
      getDoc(doc(context.firestore(), 'subjects', 'subj-1'))
    );
  });
});

describe('Class Programs and Subjects Security Rules', () => {
  const SCHOOL_ID = 'school-1';
  const OTHER_SCHOOL = 'school-2';

  beforeEach(async () => {
    // Seed database with required parent docs (classes, subjects and users)
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const firestore = ctx.firestore();

      // Users
      await setDoc(doc(firestore, 'users', 'owner-1'), { role: 'owner', schoolId: SCHOOL_ID, active: true, isActive: true });
      await setDoc(doc(firestore, 'users', 'owner-2'), { role: 'owner', schoolId: OTHER_SCHOOL, active: true, isActive: true });
      await setDoc(doc(firestore, 'users', 'secretary-1'), { role: 'secretary', schoolId: SCHOOL_ID, active: true, isActive: true });
      await setDoc(doc(firestore, 'users', 'teacher-1'), { role: 'teacher', schoolId: SCHOOL_ID, active: true, isActive: true });
      await setDoc(doc(firestore, 'users', 'inactive-user'), { role: 'owner', schoolId: SCHOOL_ID, active: false, isActive: false });

      // Classes
      await setDoc(doc(firestore, 'classes', 'class-1'), {
        id: 'class-1',
        schoolId: SCHOOL_ID,
        name: 'CP',
        isActive: true
      });
      await setDoc(doc(firestore, 'classes', 'class-other-school'), {
        id: 'class-other-school',
        schoolId: OTHER_SCHOOL,
        name: 'CP',
        isActive: true
      });

      // Subjects
      await setDoc(doc(firestore, 'subjects', 'subj-1'), {
        id: 'subj-1',
        schoolId: SCHOOL_ID,
        name: 'Maths',
        isActive: true,
        createdAt: '2026-07-23T19:00:00Z',
        createdBy: 'owner-1',
        updatedAt: '2026-07-23T19:00:00Z',
        updatedBy: 'owner-1'
      });
      await setDoc(doc(firestore, 'subjects', 'subj-inactive'), {
        id: 'subj-inactive',
        schoolId: SCHOOL_ID,
        name: 'Maths Inactive',
        isActive: false,
        createdAt: '2026-07-23T19:00:00Z',
        createdBy: 'owner-1',
        updatedAt: '2026-07-23T19:00:00Z',
        updatedBy: 'owner-1'
      });
      await setDoc(doc(firestore, 'subjects', 'subj-with-code'), {
        id: 'subj-with-code',
        schoolId: SCHOOL_ID,
        name: 'English',
        code: 'ENG101',
        isActive: true,
        createdAt: '2026-07-23T19:00:00Z',
        createdBy: 'owner-1',
        updatedAt: '2026-07-23T19:00:00Z',
        updatedBy: 'owner-1'
      });
      await setDoc(doc(firestore, 'subjects', 'subj-other-school'), {
        id: 'subj-other-school',
        schoolId: OTHER_SCHOOL,
        name: 'English',
        isActive: true,
        createdAt: '2026-07-23T19:00:00Z',
        createdBy: 'owner-2',
        updatedAt: '2026-07-23T19:00:00Z',
        updatedBy: 'owner-2'
      });
    });
  });

  describe('ClassProgram rules', () => {
    it('manager can create ClassProgram in their school', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `${SCHOOL_ID}__2026-2027__class-1`;
      await assertSucceeds(
        setDoc(doc(context.firestore(), 'classPrograms', docId), {
          id: docId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'draft',
          draftRevisionId: `${docId}__v1`,
          draftRevisionNumber: 1,
          hasUnpublishedChanges: true,
          createdAt: '2026-07-23T19:00:00Z',
          createdBy: 'owner-1',
          updatedAt: '2026-07-23T19:00:00Z',
          updatedBy: 'owner-1'
        })
      );
    });

    it('creation with programId mismatch is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `wrong-program-id`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classPrograms', docId), {
          id: docId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'draft',
          draftRevisionId: `${SCHOOL_ID}__2026-2027__class-1__v1`,
          draftRevisionNumber: 1,
          hasUnpublishedChanges: true,
          createdAt: '2026-07-23T19:00:00Z',
          createdBy: 'owner-1',
          updatedAt: '2026-07-23T19:00:00Z',
          updatedBy: 'owner-1'
        })
      );
    });

    it('creation with draftRevisionId mismatch is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `${SCHOOL_ID}__2026-2027__class-1`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classPrograms', docId), {
          id: docId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'draft',
          draftRevisionId: `wrong_revision_id`,
          draftRevisionNumber: 1,
          hasUnpublishedChanges: true,
          createdAt: '2026-07-23T19:00:00Z',
          createdBy: 'owner-1',
          updatedAt: '2026-07-23T19:00:00Z',
          updatedBy: 'owner-1'
        })
      );
    });

    it('creation with invalid academicYearId format is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `${SCHOOL_ID}__2026-202__class-1`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classPrograms', docId), {
          id: docId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-202',
          status: 'draft',
          draftRevisionId: `${docId}__v1`,
          draftRevisionNumber: 1,
          hasUnpublishedChanges: true,
          createdAt: '2026-07-23T19:00:00Z',
          createdBy: 'owner-1',
          updatedAt: '2026-07-23T19:00:00Z',
          updatedBy: 'owner-1'
        })
      );
    });

    it('creation with non-existent class is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `${SCHOOL_ID}__2026-2027__class-absent`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classPrograms', docId), {
          id: docId,
          schoolId: SCHOOL_ID,
          classId: 'class-absent',
          academicYearId: '2026-2027',
          status: 'draft',
          draftRevisionId: `${docId}__v1`,
          draftRevisionNumber: 1,
          hasUnpublishedChanges: true,
          createdAt: '2026-07-23T19:00:00Z',
          createdBy: 'owner-1',
          updatedAt: '2026-07-23T19:00:00Z',
          updatedBy: 'owner-1'
        })
      );
    });

    it('creation with class from another school is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `${SCHOOL_ID}__2026-2027__class-other-school`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classPrograms', docId), {
          id: docId,
          schoolId: SCHOOL_ID,
          classId: 'class-other-school',
          academicYearId: '2026-2027',
          status: 'draft',
          draftRevisionId: `${docId}__v1`,
          draftRevisionNumber: 1,
          hasUnpublishedChanges: true,
          createdAt: '2026-07-23T19:00:00Z',
          createdBy: 'owner-1',
          updatedAt: '2026-07-23T19:00:00Z',
          updatedBy: 'owner-1'
        })
      );
    });

    it('creation with extra fields is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `${SCHOOL_ID}__2026-2027__class-1`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classPrograms', docId), {
          id: docId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'draft',
          draftRevisionId: `${docId}__v1`,
          draftRevisionNumber: 1,
          hasUnpublishedChanges: true,
          createdAt: '2026-07-23T19:00:00Z',
          createdBy: 'owner-1',
          updatedAt: '2026-07-23T19:00:00Z',
          updatedBy: 'owner-1',
          extraField: 'not-allowed'
        })
      );
    });

    it('creation with falsified createdBy is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `${SCHOOL_ID}__2026-2027__class-1`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classPrograms', docId), {
          id: docId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'draft',
          draftRevisionId: `${docId}__v1`,
          draftRevisionNumber: 1,
          hasUnpublishedChanges: true,
          createdAt: '2026-07-23T19:00:00Z',
          createdBy: 'owner-2', // falsified
          updatedAt: '2026-07-23T19:00:00Z',
          updatedBy: 'owner-1'
        })
      );
    });

    it('secretary or teacher cannot create ClassProgram', async () => {
      const context = testEnv.authenticatedContext('secretary-1');
      const docId = `${SCHOOL_ID}__2026-2027__class-1`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classPrograms', docId), {
          id: docId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'draft',
          draftRevisionId: `${docId}__v1`,
          draftRevisionNumber: 1,
          hasUnpublishedChanges: true,
          createdAt: '2026-07-23T19:00:00Z',
          createdBy: 'secretary-1',
          updatedAt: '2026-07-23T19:00:00Z',
          updatedBy: 'secretary-1'
        })
      );
    });

    it('inactive user cannot create ClassProgram', async () => {
      const context = testEnv.authenticatedContext('inactive-user');
      const docId = `${SCHOOL_ID}__2026-2027__class-1`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classPrograms', docId), {
          id: docId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'draft',
          draftRevisionId: `${docId}__v1`,
          draftRevisionNumber: 1,
          hasUnpublishedChanges: true,
          createdAt: '2026-07-23T19:00:00Z',
          createdBy: 'inactive-user',
          updatedAt: '2026-07-23T19:00:00Z',
          updatedBy: 'inactive-user'
        })
      );
    });

    it('client-side update of classPrograms is blocked', async () => {
      const docId = `${SCHOOL_ID}__2026-2027__class-1`;
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'classPrograms', docId), {
          id: docId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'draft',
          draftRevisionId: `${docId}__v1`,
          draftRevisionNumber: 1,
          hasUnpublishedChanges: true
        });
      });
      const context = testEnv.authenticatedContext('owner-1');
      await assertFails(
        updateDoc(doc(context.firestore(), 'classPrograms', docId), {
          hasUnpublishedChanges: false
        })
      );
    });

    it('delete of classPrograms is blocked', async () => {
      const docId = `${SCHOOL_ID}__2026-2027__class-1`;
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'classPrograms', docId), {
          id: docId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'draft'
        });
      });
      const context = testEnv.authenticatedContext('owner-1');
      await assertFails(deleteDoc(doc(context.firestore(), 'classPrograms', docId)));
    });

    it('secretary can read published ClassProgram but not draft', async () => {
      const docIdDraft = `${SCHOOL_ID}__2026-2027__class-draft`;
      const docIdPub = `${SCHOOL_ID}__2026-2027__class-pub`;

      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const firestore = ctx.firestore();
        await setDoc(doc(firestore, 'classPrograms', docIdDraft), {
          id: docIdDraft,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'draft',
          draftRevisionId: 'rev-1',
          draftRevisionNumber: 1,
          hasUnpublishedChanges: true
        });
        await setDoc(doc(firestore, 'classPrograms', docIdPub), {
          id: docIdPub,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'published',
          draftRevisionId: 'rev-1',
          draftRevisionNumber: 1,
          publishedRevisionId: 'rev-1',
          publishedRevisionNumber: 1,
          hasUnpublishedChanges: false
        });
      });

      const context = testEnv.authenticatedContext('secretary-1');
      await assertFails(getDoc(doc(context.firestore(), 'classPrograms', docIdDraft)));
      await assertSucceeds(getDoc(doc(context.firestore(), 'classPrograms', docIdPub)));
    });
  });

  describe('ClassSubject rules', () => {
    const parentProgramId = `${SCHOOL_ID}__2026-2027__class-1`;

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'classPrograms', parentProgramId), {
          id: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'published',
          draftRevisionId: 'rev-2',
          draftRevisionNumber: 2,
          publishedRevisionId: 'rev-1',
          publishedRevisionNumber: 1,
          hasUnpublishedChanges: true
        });
      });
    });

    it('manager can create ClassSubject in draft revision', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `rev-2__subj-1`;
      await assertSucceeds(
        setDoc(doc(context.firestore(), 'classSubjects', docId), {
          id: docId,
          programId: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          subjectId: 'subj-1',
          revisionId: 'rev-2',
          revisionNumber: 2,
          subjectNameSnapshot: 'Maths',
          isRequired: true,
          isActive: true,
          displayOrder: 1,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        })
      );
    });

    it('creation in published revision is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `rev-1__subj-1`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classSubjects', docId), {
          id: docId,
          programId: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          subjectId: 'subj-1',
          revisionId: 'rev-1',
          revisionNumber: 1,
          subjectNameSnapshot: 'Maths',
          isRequired: true,
          isActive: true,
          displayOrder: 1,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        })
      );
    });

    it('creation with inactive subject is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `rev-2__subj-inactive`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classSubjects', docId), {
          id: docId,
          programId: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          subjectId: 'subj-inactive',
          revisionId: 'rev-2',
          revisionNumber: 2,
          subjectNameSnapshot: 'Maths Inactive',
          isRequired: true,
          isActive: true,
          displayOrder: 1,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        })
      );
    });

    it('creation with invalid name snapshot is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `rev-2__subj-1`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classSubjects', docId), {
          id: docId,
          programId: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          subjectId: 'subj-1',
          revisionId: 'rev-2',
          revisionNumber: 2,
          subjectNameSnapshot: 'Wrong Name',
          isRequired: true,
          isActive: true,
          displayOrder: 1,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        })
      );
    });

    it('creation with valid snapshots matching code is allowed', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `rev-2__subj-with-code`;
      await assertSucceeds(
        setDoc(doc(context.firestore(), 'classSubjects', docId), {
          id: docId,
          programId: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          subjectId: 'subj-with-code',
          revisionId: 'rev-2',
          revisionNumber: 2,
          subjectNameSnapshot: 'English',
          subjectCodeSnapshot: 'ENG101',
          isRequired: true,
          isActive: true,
          displayOrder: 1,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        })
      );
    });

    it('creation with falsified code snapshot is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `rev-2__subj-with-code`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classSubjects', docId), {
          id: docId,
          programId: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          subjectId: 'subj-with-code',
          revisionId: 'rev-2',
          revisionNumber: 2,
          subjectNameSnapshot: 'English',
          subjectCodeSnapshot: 'WRONGCODE',
          isRequired: true,
          isActive: true,
          displayOrder: 1,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        })
      );
    });

    it('creation with code snapshot when Subject has no code is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `rev-2__subj-1`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classSubjects', docId), {
          id: docId,
          programId: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          subjectId: 'subj-1',
          revisionId: 'rev-2',
          revisionNumber: 2,
          subjectNameSnapshot: 'Maths',
          subjectCodeSnapshot: 'NOTNULL',
          isRequired: true,
          isActive: true,
          displayOrder: 1,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        })
      );
    });

    it('creation with negative displayOrder is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `rev-2__subj-1`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classSubjects', docId), {
          id: docId,
          programId: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          subjectId: 'subj-1',
          revisionId: 'rev-2',
          revisionNumber: 2,
          subjectNameSnapshot: 'Maths',
          isRequired: true,
          isActive: true,
          displayOrder: -1,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        })
      );
    });

    it('secretary and teacher can read published ClassSubject but not draft', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const firestore = ctx.firestore();
        await setDoc(doc(firestore, 'classSubjects', 'rev-1__subj-1'), {
          id: 'rev-1__subj-1',
          programId: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          subjectId: 'subj-1',
          revisionId: 'rev-1',
          revisionNumber: 1,
          subjectNameSnapshot: 'Maths',
          isRequired: true,
          isActive: true,
          displayOrder: 1
        });
        await setDoc(doc(firestore, 'classSubjects', 'rev-2__subj-1'), {
          id: 'rev-2__subj-1',
          programId: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          subjectId: 'subj-1',
          revisionId: 'rev-2',
          revisionNumber: 2,
          subjectNameSnapshot: 'Maths',
          isRequired: true,
          isActive: true,
          displayOrder: 1
        });
      });

      const context = testEnv.authenticatedContext('secretary-1');
      await assertSucceeds(getDoc(doc(context.firestore(), 'classSubjects', 'rev-1__subj-1')));
      await assertFails(getDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-1')));
    });

    it('physical delete of ClassSubject is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      await assertFails(deleteDoc(doc(context.firestore(), 'classSubjects', 'rev-1__subj-1')));
    });

    it('update to active draft is allowed for managers', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'classSubjects', 'rev-2__subj-1'), {
          id: 'rev-2__subj-1',
          programId: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          subjectId: 'subj-1',
          revisionId: 'rev-2',
          revisionNumber: 2,
          subjectNameSnapshot: 'Maths',
          isRequired: true,
          isActive: true,
          displayOrder: 1,
          createdAt: '2026-07-23T19:00:00Z',
          createdBy: 'owner-1',
          updatedAt: '2026-07-23T19:00:00Z',
          updatedBy: 'owner-1'
        });
      });
      const context = testEnv.authenticatedContext('owner-1');
      await assertSucceeds(
        updateDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-1'), {
          displayOrder: 10,
          updatedBy: 'owner-1',
          updatedAt: '2026-07-24T08:00:00Z'
        })
      );
    });

    it('update to published revision is denied', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'classSubjects', 'rev-1__subj-1'), {
          id: 'rev-1__subj-1',
          programId: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          subjectId: 'subj-1',
          revisionId: 'rev-1',
          revisionNumber: 1,
          subjectNameSnapshot: 'Maths',
          isRequired: true,
          isActive: true,
          displayOrder: 1
        });
      });
      const context = testEnv.authenticatedContext('owner-1');
      await assertFails(
        updateDoc(doc(context.firestore(), 'classSubjects', 'rev-1__subj-1'), {
          displayOrder: 10
        })
      );
    });
  });

  describe('Firestore queries security tests', () => {
    it('manager can query classPrograms of their own school', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const q = query(
        collection(context.firestore(), 'classPrograms'),
        where('schoolId', '==', SCHOOL_ID)
      );
      await assertSucceeds(getDocs(q));
    });

    it('manager query of another school classPrograms is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const q = query(
        collection(context.firestore(), 'classPrograms'),
        where('schoolId', '==', OTHER_SCHOOL)
      );
      await assertFails(getDocs(q));
    });

    it('secretary query of classPrograms including draft is denied', async () => {
      const context = testEnv.authenticatedContext('secretary-1');
      const q = query(
        collection(context.firestore(), 'classPrograms'),
        where('schoolId', '==', SCHOOL_ID)
      );
      await assertFails(getDocs(q));
    });
  });
});

import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import fs from 'fs';
import { setDoc, updateDoc, doc, getDoc, deleteDoc, query, where, collection, getDocs, writeBatch, deleteField } from 'firebase/firestore';
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

  it('secretary can create a subject', async () => {
    const context = testEnv.authenticatedContext('secretary-1');
    await assertSucceeds(
      setDoc(doc(context.firestore(), 'subjects', 'subj-sec-create-1'), {
        id: 'subj-sec-create-1',
        schoolId: SCHOOL_ID,
        name: 'Mathématiques Sec',
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
      await setDoc(doc(firestore, 'users', 'director-1'), { role: 'director', schoolId: SCHOOL_ID, active: true, isActive: true });
      await setDoc(doc(firestore, 'users', 'secretary-1'), { role: 'secretary', schoolId: SCHOOL_ID, active: true, isActive: true });
      await setDoc(doc(firestore, 'users', 'teacher-1'), { role: 'teacher', schoolId: SCHOOL_ID, active: true, isActive: true });
      await setDoc(doc(firestore, 'users', 'parent-1'), { role: 'parent', schoolId: SCHOOL_ID, active: true, isActive: true });
      await setDoc(doc(firestore, 'users', 'student-1'), { role: 'student', schoolId: SCHOOL_ID, active: true, isActive: true });
      await setDoc(doc(firestore, 'users', 'inactive-user'), { role: 'owner', schoolId: SCHOOL_ID, active: false, isActive: false });

      // Classes
      await setDoc(doc(firestore, 'classes', 'class-1'), {
        id: 'class-1',
        schoolId: SCHOOL_ID,
        name: 'CP',
        isActive: true
      });
      await setDoc(doc(firestore, 'classes', 'class-create'), {
        id: 'class-create',
        schoolId: SCHOOL_ID,
        name: 'CE1',
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
      await setDoc(doc(firestore, 'classPrograms', `${SCHOOL_ID}__2026-2027__class-1`), {
        id: `${SCHOOL_ID}__2026-2027__class-1`,
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
      await setDoc(doc(firestore, 'classSubjects', 'rev-1__subj-1'), {
        id: 'rev-1__subj-1',
        programId: `${SCHOOL_ID}__2026-2027__class-1`,
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
  });

  describe('ClassProgram rules', () => {
    it('manager can create ClassProgram in their school', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `${SCHOOL_ID}__2026-2027__class-create`;
      await assertSucceeds(
        setDoc(doc(context.firestore(), 'classPrograms', docId), {
          id: docId,
          schoolId: SCHOOL_ID,
          classId: 'class-create',
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

    it('director can create ClassProgram in their school', async () => {
      const context = testEnv.authenticatedContext('director-1');
      const docId = `${SCHOOL_ID}__2026-2027__class-create-dir`;

      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'classes', 'class-create-dir'), {
          id: 'class-create-dir',
          schoolId: SCHOOL_ID,
          name: 'CE1 Dir',
          isActive: true
        });
      });

      await assertSucceeds(
        setDoc(doc(context.firestore(), 'classPrograms', docId), {
          id: docId,
          schoolId: SCHOOL_ID,
          classId: 'class-create-dir',
          academicYearId: '2026-2027',
          status: 'draft',
          draftRevisionId: `${docId}__v1`,
          draftRevisionNumber: 1,
          hasUnpublishedChanges: true,
          createdAt: '2026-07-23T19:00:00Z',
          createdBy: 'director-1',
          updatedAt: '2026-07-23T19:00:00Z',
          updatedBy: 'director-1'
        })
      );
    });

    it('batch creation of ClassProgram and ClassSubject fails due to exists check on parent doc', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const progId = `${SCHOOL_ID}__2026-2027__class-batch`;
      const subjDocId = `${progId}__v1__subj-1`;

      const batch = writeBatch(context.firestore());
      batch.set(doc(context.firestore(), 'classPrograms', progId), {
        id: progId,
        schoolId: SCHOOL_ID,
        classId: 'class-create',
        academicYearId: '2026-2027',
        status: 'draft',
        draftRevisionId: `${progId}__v1`,
        draftRevisionNumber: 1,
        hasUnpublishedChanges: true,
        createdAt: '2026-07-23T19:00:00Z',
        createdBy: 'owner-1',
        updatedAt: '2026-07-23T19:00:00Z',
        updatedBy: 'owner-1'
      });
      batch.set(doc(context.firestore(), 'classSubjects', subjDocId), {
        id: subjDocId,
        programId: progId,
        schoolId: SCHOOL_ID,
        classId: 'class-create',
        academicYearId: '2026-2027',
        subjectId: 'subj-1',
        revisionId: `${progId}__v1`,
        revisionNumber: 1,
        subjectNameSnapshot: 'Maths',
        isRequired: true,
        isActive: true,
        displayOrder: 1,
        createdBy: 'owner-1',
        updatedBy: 'owner-1',
        createdAt: '2026-07-23T19:00:00Z',
        updatedAt: '2026-07-23T19:00:00Z'
      });

      await assertFails(batch.commit());
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

    it('secretary can read published ClassProgram but not draft or incomplete publications', async () => {
      const docIdDraft = `${SCHOOL_ID}__2026-2027__class-draft`;
      const docIdPub = `${SCHOOL_ID}__2026-2027__class-pub`;
      const docIdIncomplete = `${SCHOOL_ID}__2026-2027__class-incomplete`;

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
        await setDoc(doc(firestore, 'classPrograms', docIdIncomplete), {
          id: docIdIncomplete,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'published',
          draftRevisionId: 'rev-1',
          draftRevisionNumber: 1,
          hasUnpublishedChanges: true // missing publishedRevisionId and publishedRevisionNumber!
        });
      });

      const context = testEnv.authenticatedContext('secretary-1');
      await assertSucceeds(getDoc(doc(context.firestore(), 'classPrograms', docIdDraft)));
      await assertSucceeds(getDoc(doc(context.firestore(), 'classPrograms', docIdIncomplete)));
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
      await assertSucceeds(getDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-1')));

      const teacherContext = testEnv.authenticatedContext('teacher-1');
      await assertFails(getDoc(doc(teacherContext.firestore(), 'classSubjects', 'rev-2__subj-1')));
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
    it('update of an old/abandoned revision is denied', async () => {
      // Seed program where draft is rev-3, published is rev-2, rev-1 is an old draft
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'classPrograms', parentProgramId), {
          id: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'published',
          draftRevisionId: 'rev-3',
          draftRevisionNumber: 3,
          publishedRevisionId: 'rev-2',
          publishedRevisionNumber: 2,
          hasUnpublishedChanges: true
        });
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

    it('creation when hasUnpublishedChanges is false is denied', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'classPrograms', parentProgramId), {
          id: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          status: 'published',
          draftRevisionId: 'rev-2',
          draftRevisionNumber: 2,
          publishedRevisionId: 'rev-2',
          publishedRevisionNumber: 2,
          hasUnpublishedChanges: false
        });
      });
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
          displayOrder: 1,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        })
      );
    });

    it('creation with negative coefficient is denied', async () => {
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
          displayOrder: 1,
          coefficient: -2,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        })
      );
    });

    it('creation with negative weeklyHours is denied', async () => {
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
          displayOrder: 1,
          weeklyHours: -1,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        })
      );
    });

    it('creation with subject from another school is denied', async () => {
      const context = testEnv.authenticatedContext('owner-1');
      const docId = `rev-2__subj-other-school`;
      await assertFails(
        setDoc(doc(context.firestore(), 'classSubjects', docId), {
          id: docId,
          programId: parentProgramId,
          schoolId: SCHOOL_ID,
          classId: 'class-1',
          academicYearId: '2026-2027',
          subjectId: 'subj-other-school',
          revisionId: 'rev-2',
          revisionNumber: 2,
          subjectNameSnapshot: 'English',
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

    it('logical deactivation is allowed for managers', async () => {
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
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        });
      });
      const context = testEnv.authenticatedContext('owner-1');
      await assertSucceeds(
        updateDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-1'), {
          isActive: false,
          updatedBy: 'owner-1',
          updatedAt: '2026-07-23T19:15:00Z'
        })
      );
    });

    it('modification of subjectId is denied', async () => {
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
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        });
      });
      const context = testEnv.authenticatedContext('owner-1');
      await assertFails(
        updateDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-1'), {
          subjectId: 'subj-with-code',
          updatedBy: 'owner-1',
          updatedAt: '2026-07-23T19:15:00Z'
        })
      );
    });

    it('modification of revisionId is denied', async () => {
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
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        });
      });
      const context = testEnv.authenticatedContext('owner-1');
      await assertFails(
        updateDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-1'), {
          revisionId: 'rev-1',
          updatedBy: 'owner-1',
          updatedAt: '2026-07-23T19:15:00Z'
        })
      );
    });

    it('owner can delete coefficient from a draft ClassSubject', async () => {
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
          coefficient: 4,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        });
      });
      const context = testEnv.authenticatedContext('owner-1');
      await assertSucceeds(
        updateDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-1'), {
          coefficient: deleteField(),
          updatedBy: 'owner-1',
          updatedAt: '2026-07-23T19:15:00Z'
        })
      );
    });

    it('owner can delete weeklyHours from a draft ClassSubject', async () => {
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
          weeklyHours: 4,
          createdBy: 'owner-1',
          updatedBy: 'owner-1',
          createdAt: '2026-07-23T19:00:00Z',
          updatedAt: '2026-07-23T19:00:00Z'
        });
      });
      const context = testEnv.authenticatedContext('owner-1');
      await assertSucceeds(
        updateDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-1'), {
          weeklyHours: deleteField(),
          updatedBy: 'owner-1',
          updatedAt: '2026-07-23T19:15:00Z'
        })
      );
    });

    describe('Secretary and Role Permissions specific tests', () => {
      beforeEach(async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          const firestore = ctx.firestore();
          // Seed the draft program and classSubject
          await setDoc(doc(firestore, 'classPrograms', parentProgramId), {
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
            displayOrder: 1,
            createdAt: '2026-07-23T19:00:00Z',
            createdBy: 'owner-1',
            updatedAt: '2026-07-23T19:00:00Z',
            updatedBy: 'owner-1'
          });
        });
      });

      // SUBJECTS (1-5)
      it('1. secretary crée une matière de son école', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        await assertSucceeds(
          setDoc(doc(context.firestore(), 'subjects', 'subj-sec-create'), {
            id: 'subj-sec-create',
            schoolId: SCHOOL_ID,
            name: 'Geography',
            isActive: true,
            createdAt: '2026-07-24T20:00:00Z',
            createdBy: 'secretary-1',
            updatedAt: '2026-07-24T20:00:00Z',
            updatedBy: 'secretary-1'
          })
        );
      });

      it('2. secretary modifie une matière de son école', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        await assertSucceeds(
          updateDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
            name: 'Maths Updated By Sec',
            updatedAt: '2026-07-24T20:00:00Z',
            updatedBy: 'secretary-1'
          })
        );
      });

      it('3. secretary désactive une matière', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        await assertSucceeds(
          updateDoc(doc(context.firestore(), 'subjects', 'subj-1'), {
            isActive: false,
            updatedAt: '2026-07-24T20:00:00Z',
            updatedBy: 'secretary-1'
          })
        );
      });

      it('4. secretary ne peut pas modifier une matière d’une autre école', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        await assertFails(
          updateDoc(doc(context.firestore(), 'subjects', 'subj-other-school'), {
            name: 'Hack',
            updatedAt: '2026-07-24T20:00:00Z',
            updatedBy: 'secretary-1'
          })
        );
      });

      it('5. secretary ne peut pas supprimer physiquement une matière', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        await assertFails(
          deleteDoc(doc(context.firestore(), 'subjects', 'subj-1'))
        );
      });

      // CLASSPROGRAM (6-9)
      it('6. secretary crée le premier ClassProgram', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        const docId = `${SCHOOL_ID}__2026-2027__class-create`;
        await assertSucceeds(
          setDoc(doc(context.firestore(), 'classPrograms', docId), {
            id: docId,
            schoolId: SCHOOL_ID,
            classId: 'class-create',
            academicYearId: '2026-2027',
            status: 'draft',
            draftRevisionId: `${docId}__v1`,
            draftRevisionNumber: 1,
            hasUnpublishedChanges: true,
            createdAt: '2026-07-24T20:00:00Z',
            createdBy: 'secretary-1',
            updatedAt: '2026-07-24T20:00:00Z',
            updatedBy: 'secretary-1'
          })
        );
      });

      it('7. secretary ne peut pas modifier ClassProgram', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        const docId = `${SCHOOL_ID}__2026-2027__class-1`;
        await assertFails(
          updateDoc(doc(context.firestore(), 'classPrograms', docId), {
            hasUnpublishedChanges: false
          })
        );
      });

      it('8. secretary ne peut pas supprimer ClassProgram', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        const docId = `${SCHOOL_ID}__2026-2027__class-1`;
        await assertFails(
          deleteDoc(doc(context.firestore(), 'classPrograms', docId))
        );
      });

      it('9. secretary ne peut pas créer un programme pour une autre école', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        const docId = `${OTHER_SCHOOL}__2026-2027__class-other-school`;
        await assertFails(
          setDoc(doc(context.firestore(), 'classPrograms', docId), {
            id: docId,
            schoolId: OTHER_SCHOOL,
            classId: 'class-other-school',
            academicYearId: '2026-2027',
            status: 'draft',
            draftRevisionId: `${docId}__v1`,
            draftRevisionNumber: 1,
            hasUnpublishedChanges: true,
            createdAt: '2026-07-24T20:00:00Z',
            createdBy: 'secretary-1',
            updatedAt: '2026-07-24T20:00:00Z',
            updatedBy: 'secretary-1'
          })
        );
      });

      // CLASSSUBJECT (10-22)
      it('10. secretary crée un ClassSubject dans le brouillon actif', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
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
            displayOrder: 2,
            createdBy: 'secretary-1',
            updatedBy: 'secretary-1',
            createdAt: '2026-07-24T20:00:00Z',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });

      it('11. secretary modifie coefficient', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        await assertSucceeds(
          updateDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-1'), {
            coefficient: 5.5,
            updatedBy: 'secretary-1',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });

      it('12. secretary modifie weeklyHours', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        await assertSucceeds(
          updateDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-1'), {
            weeklyHours: 6,
            updatedBy: 'secretary-1',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });

      it('13. secretary supprime coefficient avec deleteField', async () => {
        // Seed first
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), 'classSubjects', 'rev-2__subj-del-coeff'), {
            id: 'rev-2__subj-del-coeff',
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
            coefficient: 4,
            createdBy: 'owner-1',
            updatedBy: 'owner-1',
            createdAt: '2026-07-23T19:00:00Z',
            updatedAt: '2026-07-23T19:00:00Z'
          });
        });
        const context = testEnv.authenticatedContext('secretary-1');
        await assertSucceeds(
          updateDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-del-coeff'), {
            coefficient: deleteField(),
            updatedBy: 'secretary-1',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });

      it('14. secretary supprime weeklyHours avec deleteField', async () => {
        // Seed first
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), 'classSubjects', 'rev-2__subj-del-hours'), {
            id: 'rev-2__subj-del-hours',
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
            weeklyHours: 4,
            createdBy: 'owner-1',
            updatedBy: 'owner-1',
            createdAt: '2026-07-23T19:00:00Z',
            updatedAt: '2026-07-23T19:00:00Z'
          });
        });
        const context = testEnv.authenticatedContext('secretary-1');
        await assertSucceeds(
          updateDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-del-hours'), {
            weeklyHours: deleteField(),
            updatedBy: 'secretary-1',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });

      it('15. secretary désactive une matière', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        await assertSucceeds(
          updateDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-1'), {
            isActive: false,
            updatedBy: 'secretary-1',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });

      it('16. secretary réactive une matière', async () => {
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), 'classSubjects', 'rev-2__subj-inactive'), {
            id: 'rev-2__subj-inactive',
            programId: parentProgramId,
            schoolId: SCHOOL_ID,
            classId: 'class-1',
            academicYearId: '2026-2027',
            subjectId: 'subj-1',
            revisionId: 'rev-2',
            revisionNumber: 2,
            subjectNameSnapshot: 'Maths',
            isRequired: true,
            isActive: false,
            displayOrder: 1,
            createdBy: 'owner-1',
            updatedBy: 'owner-1',
            createdAt: '2026-07-23T19:00:00Z',
            updatedAt: '2026-07-23T19:00:00Z'
          });
        });
        const context = testEnv.authenticatedContext('secretary-1');
        await assertSucceeds(
          updateDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-inactive'), {
            isActive: true,
            updatedBy: 'secretary-1',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });

      it('17. secretary ne peut pas modifier une révision publiée', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        await assertFails(
          updateDoc(doc(context.firestore(), 'classSubjects', 'rev-1__subj-1'), {
            coefficient: 4,
            updatedBy: 'secretary-1',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });

      it('18. secretary ne peut pas modifier une ancienne révision', async () => {
        // Seed an old revision program
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), 'classPrograms', `${SCHOOL_ID}__2026-2027__class-old`), {
            id: `${SCHOOL_ID}__2026-2027__class-old`,
            schoolId: SCHOOL_ID,
            classId: 'class-old',
            academicYearId: '2026-2027',
            status: 'draft',
            draftRevisionId: 'rev-current',
            draftRevisionNumber: 2,
            hasUnpublishedChanges: true
          });
          await setDoc(doc(ctx.firestore(), 'classSubjects', 'rev-old__subj-1'), {
            id: 'rev-old__subj-1',
            programId: `${SCHOOL_ID}__2026-2027__class-old`,
            schoolId: SCHOOL_ID,
            classId: 'class-old',
            academicYearId: '2026-2027',
            subjectId: 'subj-1',
            revisionId: 'rev-old',
            revisionNumber: 1,
            subjectNameSnapshot: 'Maths',
            isRequired: true,
            isActive: true,
            displayOrder: 1,
            createdBy: 'owner-1',
            updatedBy: 'owner-1',
            createdAt: '2026-07-23T19:00:00Z',
            updatedAt: '2026-07-23T19:00:00Z'
          });
        });
        const context = testEnv.authenticatedContext('secretary-1');
        await assertFails(
          updateDoc(doc(context.firestore(), 'classSubjects', 'rev-old__subj-1'), {
            coefficient: 4,
            updatedBy: 'secretary-1',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });

      it('19. secretary ne peut pas modifier les snapshots', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        await assertFails(
          updateDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-1'), {
            subjectNameSnapshot: 'New Name Snapshot',
            updatedBy: 'secretary-1',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });

      it('20. secretary ne peut pas changer subjectId', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        await assertFails(
          updateDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-1'), {
            subjectId: 'new-subject-id',
            updatedBy: 'secretary-1',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });

      it('21. secretary ne peut pas supprimer physiquement ClassSubject', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        await assertFails(
          deleteDoc(doc(context.firestore(), 'classSubjects', 'rev-2__subj-1'))
        );
      });

      it('22. secretary ne peut pas écrire dans une autre école', async () => {
        const context = testEnv.authenticatedContext('secretary-1');
        const docId = `rev-2__subj-other-cs`;
        await assertFails(
          setDoc(doc(context.firestore(), 'classSubjects', docId), {
            id: docId,
            programId: `${OTHER_SCHOOL}__2026-2027__class-other-school`,
            schoolId: OTHER_SCHOOL,
            classId: 'class-other-school',
            academicYearId: '2026-2027',
            subjectId: 'subj-other-school',
            revisionId: 'rev-2',
            revisionNumber: 2,
            subjectNameSnapshot: 'English',
            isRequired: true,
            isActive: true,
            displayOrder: 2,
            createdBy: 'secretary-1',
            updatedBy: 'secretary-1',
            createdAt: '2026-07-24T20:00:00Z',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });

      // LIMITATIONS DES AUTRES ROLES (23-25)
      it('23. teacher reste en lecture seule', async () => {
        const context = testEnv.authenticatedContext('teacher-1');
        const docId = `rev-2__subj-teacher-cs`;
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
            displayOrder: 2,
            createdBy: 'teacher-1',
            updatedBy: 'teacher-1',
            createdAt: '2026-07-24T20:00:00Z',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });

      it('24. parent reste refusé', async () => {
        const context = testEnv.authenticatedContext('parent-1');
        const docId = `rev-2__subj-parent-cs`;
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
            displayOrder: 2,
            createdBy: 'parent-1',
            updatedBy: 'parent-1',
            createdAt: '2026-07-24T20:00:00Z',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });

      it('25. student reste refusé', async () => {
        const context = testEnv.authenticatedContext('student-1');
        const docId = `rev-2__subj-student-cs`;
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
            displayOrder: 2,
            createdBy: 'student-1',
            updatedBy: 'student-1',
            createdAt: '2026-07-24T20:00:00Z',
            updatedAt: '2026-07-24T20:00:00Z'
          })
        );
      });
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

    it('teacher query of classPrograms including draft is denied', async () => {
      const context = testEnv.authenticatedContext('teacher-1');
      const q = query(
        collection(context.firestore(), 'classPrograms'),
        where('schoolId', '==', SCHOOL_ID)
      );
      await assertFails(getDocs(q));
    });

    it('teacher query of classPrograms limited to published status is denied', async () => {
      const context = testEnv.authenticatedContext('teacher-1');
      const q = query(
        collection(context.firestore(), 'classPrograms'),
        where('schoolId', '==', SCHOOL_ID),
        where('status', '==', 'published')
      );
      await assertFails(getDocs(q));
    });

    it('secretary query of classSubjects with programId and published revisionId is allowed', async () => {
      const context = testEnv.authenticatedContext('secretary-1');
      const q = query(
        collection(context.firestore(), 'classSubjects'),
        where('schoolId', '==', SCHOOL_ID),
        where('programId', '==', `${SCHOOL_ID}__2026-2027__class-1`),
        where('revisionId', '==', 'rev-1')
      );
      await assertSucceeds(getDocs(q));
    });

    it('teacher query of classSubjects without revisionId is denied', async () => {
      const context = testEnv.authenticatedContext('teacher-1');
      const q = query(
        collection(context.firestore(), 'classSubjects'),
        where('schoolId', '==', SCHOOL_ID),
        where('programId', '==', `${SCHOOL_ID}__2026-2027__class-1`)
      );
      await assertFails(getDocs(q));
    });
  });

  describe('Staff-User Links Security Rules', () => {
    const SCHOOL_A = 'school-a';
    const SCHOOL_B = 'school-b';

    beforeEach(async () => {
      // Setup mock operators, targets and staff
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        const firestore = ctx.firestore();
        
        // Superadmin
        await setDoc(doc(firestore, 'users', 'sa-uid'), { role: 'superAdmin', active: true });
        
        // School A Members
        await setDoc(doc(firestore, 'users', 'owner-a'), { role: 'owner', schoolId: SCHOOL_A, active: true });
        await setDoc(doc(firestore, 'users', 'director-a'), { role: 'director', schoolId: SCHOOL_A, active: true });
        await setDoc(doc(firestore, 'users', 'secretary-a'), { role: 'secretary', schoolId: SCHOOL_A, active: true });
        await setDoc(doc(firestore, 'users', 'teacher-a'), { role: 'teacher', schoolId: SCHOOL_A, active: true });
        
        // School B Members
        await setDoc(doc(firestore, 'users', 'director-b'), { role: 'director', schoolId: SCHOOL_B, active: true });

        // Staff members
        await setDoc(doc(firestore, 'staff', 'staff-a'), { role: 'teacher', schoolId: SCHOOL_A });

        // Existing link documents
        await setDoc(doc(firestore, 'staffUserLinks', 'link-1'), {
          id: 'link-1',
          schoolId: SCHOOL_A,
          userId: 'teacher-a',
          staffId: 'staff-a',
          isActive: true
        });

        await setDoc(doc(firestore, 'staffUserLinkByUser', 'teacher-a'), {
          userId: 'teacher-a',
          staffId: 'staff-a',
          schoolId: SCHOOL_A,
          linkId: 'link-1',
          isActive: true
        });

        await setDoc(doc(firestore, 'staffUserLinkByStaff', `${SCHOOL_A}__staff-a`), {
          userId: 'teacher-a',
          staffId: 'staff-a',
          schoolId: SCHOOL_A,
          linkId: 'link-1',
          isActive: true
        });
      });
    });

    it('Direct client writes to links or pointer collections must be denied', async () => {
      const context = testEnv.authenticatedContext('owner-a');
      const db = context.firestore();

      await assertFails(setDoc(doc(db, 'staffUserLinks', 'link-new'), { schoolId: SCHOOL_A, userId: 'teacher-a', staffId: 'staff-a', isActive: true }));
      await assertFails(updateDoc(doc(db, 'staffUserLinks', 'link-1'), { isActive: false }));
      await assertFails(deleteDoc(doc(db, 'staffUserLinks', 'link-1')));

      await assertFails(setDoc(doc(db, 'staffUserLinkByUser', 'teacher-new'), { userId: 'teacher-new', staffId: 'staff-a', schoolId: SCHOOL_A, isActive: true }));
      await assertFails(setDoc(doc(db, 'staffUserLinkByStaff', `${SCHOOL_A}__staff-new`), { userId: 'teacher-a', staffId: 'staff-new', schoolId: SCHOOL_A, isActive: true }));
    });

    it('Reads on staffUserLinks details rules check', async () => {
      // Superadmin can read
      const saCtx = testEnv.authenticatedContext('sa-uid');
      await assertSucceeds(getDoc(doc(saCtx.firestore(), 'staffUserLinks', 'link-1')));

      // Director/Owner same school can read
      const dirCtx = testEnv.authenticatedContext('director-a');
      await assertSucceeds(getDoc(doc(dirCtx.firestore(), 'staffUserLinks', 'link-1')));

      const ownerCtx = testEnv.authenticatedContext('owner-a');
      await assertSucceeds(getDoc(doc(ownerCtx.firestore(), 'staffUserLinks', 'link-1')));

      // Linked teacher cannot read (history is confidential)
      const targetCtx = testEnv.authenticatedContext('teacher-a');
      await assertFails(getDoc(doc(targetCtx.firestore(), 'staffUserLinks', 'link-1')));

      // Secretary or other school cannot read
      const secCtx = testEnv.authenticatedContext('secretary-a');
      await assertFails(getDoc(doc(secCtx.firestore(), 'staffUserLinks', 'link-1')));

      const otherCtx = testEnv.authenticatedContext('director-b');
      await assertFails(getDoc(doc(otherCtx.firestore(), 'staffUserLinks', 'link-1')));
    });

    it('Reads on staffUserLinkByUser pointers rules check', async () => {
      // Target user can read own pointer
      const targetCtx = testEnv.authenticatedContext('teacher-a');
      await assertSucceeds(getDoc(doc(targetCtx.firestore(), 'staffUserLinkByUser', 'teacher-a')));

      // Other teacher cannot read
      const otherTeacherCtx = testEnv.authenticatedContext('teacher-other', { schoolId: SCHOOL_A });
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'users', 'teacher-other'), { role: 'teacher', schoolId: SCHOOL_A, active: true });
      });
      await assertFails(getDoc(doc(otherTeacherCtx.firestore(), 'staffUserLinkByUser', 'teacher-a')));

      // SuperAdmin can read pointer of another user
      const saCtx = testEnv.authenticatedContext('sa-uid');
      await assertSucceeds(getDoc(doc(saCtx.firestore(), 'staffUserLinkByUser', 'teacher-a')));

      // Director same school can read
      const dirCtx = testEnv.authenticatedContext('director-a');
      await assertSucceeds(getDoc(doc(dirCtx.firestore(), 'staffUserLinkByUser', 'teacher-a')));

      // Owner same school can read
      const ownerCtx = testEnv.authenticatedContext('owner-a');
      await assertSucceeds(getDoc(doc(ownerCtx.firestore(), 'staffUserLinkByUser', 'teacher-a')));

      // Secretary cannot read
      const secCtx = testEnv.authenticatedContext('secretary-a');
      await assertFails(getDoc(doc(secCtx.firestore(), 'staffUserLinkByUser', 'teacher-a')));

      // Other school cannot read
      const otherCtx = testEnv.authenticatedContext('director-b');
      await assertFails(getDoc(doc(otherCtx.firestore(), 'staffUserLinkByUser', 'teacher-a')));
    });

    it('Reads on staffUserLinkByStaff pointers rules check', async () => {
      // SuperAdmin can read
      const saCtx = testEnv.authenticatedContext('sa-uid');
      await assertSucceeds(getDoc(doc(saCtx.firestore(), 'staffUserLinkByStaff', `${SCHOOL_A}__staff-a`)));

      // Director same school can read
      const dirCtx = testEnv.authenticatedContext('director-a');
      await assertSucceeds(getDoc(doc(dirCtx.firestore(), 'staffUserLinkByStaff', `${SCHOOL_A}__staff-a`)));

      // Owner same school can read
      const ownerCtx = testEnv.authenticatedContext('owner-a');
      await assertSucceeds(getDoc(doc(ownerCtx.firestore(), 'staffUserLinkByStaff', `${SCHOOL_A}__staff-a`)));

      // Teacher cannot read
      const targetCtx = testEnv.authenticatedContext('teacher-a');
      await assertFails(getDoc(doc(targetCtx.firestore(), 'staffUserLinkByStaff', `${SCHOOL_A}__staff-a`)));

      // Secretary cannot read
      const secCtx = testEnv.authenticatedContext('secretary-a');
      await assertFails(getDoc(doc(secCtx.firestore(), 'staffUserLinkByStaff', `${SCHOOL_A}__staff-a`)));

      // Other school cannot read
      const otherCtx = testEnv.authenticatedContext('director-b');
      await assertFails(getDoc(doc(otherCtx.firestore(), 'staffUserLinkByStaff', `${SCHOOL_A}__staff-a`)));
    });
  });

  describe('Teacher Assignments Security Rules', () => {
    const SCHOOL_A = 'school-a';
    const SCHOOL_B = 'school-b';

    beforeEach(async () => {
      // Set up roles
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'users', 'sa-uid'), { role: 'superAdmin', active: true });
        await setDoc(doc(db, 'users', 'owner-a'), { role: 'owner', schoolId: SCHOOL_A, active: true });
        await setDoc(doc(db, 'users', 'director-a'), { role: 'director', schoolId: SCHOOL_A, active: true });
        await setDoc(doc(db, 'users', 'secretary-a'), { role: 'secretary', schoolId: SCHOOL_A, active: true });
        await setDoc(doc(db, 'users', 'teacher-a'), { role: 'teacher', schoolId: SCHOOL_A, active: true });
        await setDoc(doc(db, 'users', 'director-b'), { role: 'director', schoolId: SCHOOL_B, active: true });
        await setDoc(doc(db, 'users', 'parent-a'), { role: 'parent', schoolId: SCHOOL_A, active: true });

        // Links
        await setDoc(doc(db, 'staffUserLinkByUser', 'teacher-a'), { userId: 'teacher-a', staffId: 'staff-teacher-a', schoolId: SCHOOL_A, isActive: true });

        // Seed some assignments and slots
        await setDoc(doc(db, 'teacherAssignments', 'assign-1'), {
          id: 'assign-1',
          schoolId: SCHOOL_A,
          academicYearId: '2026-2027',
          classId: 'class-a',
          subjectId: 'sub-a',
          teacherStaffId: 'staff-teacher-a',
          isActive: true
        });
        await setDoc(doc(db, 'teacherAssignments', 'assign-inactive'), {
          id: 'assign-inactive',
          schoolId: SCHOOL_A,
          academicYearId: '2026-2027',
          classId: 'class-a',
          subjectId: 'sub-a',
          teacherStaffId: 'staff-teacher-a',
          isActive: false
        });
        await setDoc(doc(db, 'teacherAssignmentSlots', 'slot-1'), {
          id: 'slot-1',
          schoolId: SCHOOL_A,
          academicYearId: '2026-2027',
          classId: 'class-a',
          subjectId: 'sub-a',
          teacherStaffId: 'staff-teacher-a',
          isActive: true
        });
      });
    });

    it('Client writes directly are denied on both collections', async () => {
      const dirCtx = testEnv.authenticatedContext('director-a');
      const db = dirCtx.firestore();

      await assertFails(setDoc(doc(db, 'teacherAssignments', 'new-assign'), { schoolId: SCHOOL_A }));
      await assertFails(updateDoc(doc(db, 'teacherAssignments', 'assign-1'), { isActive: false }));
      await assertFails(deleteDoc(doc(db, 'teacherAssignments', 'assign-1')));

      await assertFails(setDoc(doc(db, 'teacherAssignmentSlots', 'new-slot'), { schoolId: SCHOOL_A }));
      await assertFails(updateDoc(doc(db, 'teacherAssignmentSlots', 'slot-1'), { isActive: false }));
      await assertFails(deleteDoc(doc(db, 'teacherAssignmentSlots', 'slot-1')));
    });

    it('Academic managers of the same school can read assignments and slots', async () => {
      // SuperAdmin
      const saCtx = testEnv.authenticatedContext('sa-uid');
      await assertSucceeds(getDoc(doc(saCtx.firestore(), 'teacherAssignments', 'assign-1')));
      await assertSucceeds(getDoc(doc(saCtx.firestore(), 'teacherAssignmentSlots', 'slot-1')));

      // Owner
      const ownerCtx = testEnv.authenticatedContext('owner-a');
      await assertSucceeds(getDoc(doc(ownerCtx.firestore(), 'teacherAssignments', 'assign-1')));
      await assertSucceeds(getDoc(doc(ownerCtx.firestore(), 'teacherAssignmentSlots', 'slot-1')));

      // Director
      const dirCtx = testEnv.authenticatedContext('director-a');
      await assertSucceeds(getDoc(doc(dirCtx.firestore(), 'teacherAssignments', 'assign-1')));
      await assertSucceeds(getDoc(doc(dirCtx.firestore(), 'teacherAssignmentSlots', 'slot-1')));

      // Secretary
      const secCtx = testEnv.authenticatedContext('secretary-a');
      await assertSucceeds(getDoc(doc(secCtx.firestore(), 'teacherAssignments', 'assign-1')));
      await assertSucceeds(getDoc(doc(secCtx.firestore(), 'teacherAssignmentSlots', 'slot-1')));
    });

    it('Managers from other schools cannot read', async () => {
      const otherCtx = testEnv.authenticatedContext('director-b');
      await assertFails(getDoc(doc(otherCtx.firestore(), 'teacherAssignments', 'assign-1')));
      await assertFails(getDoc(doc(otherCtx.firestore(), 'teacherAssignmentSlots', 'slot-1')));
    });

    it('Teacher with active link can read their own active assignments and slots', async () => {
      const teacherCtx = testEnv.authenticatedContext('teacher-a');
      await assertSucceeds(getDoc(doc(teacherCtx.firestore(), 'teacherAssignments', 'assign-1')));
      await assertSucceeds(getDoc(doc(teacherCtx.firestore(), 'teacherAssignmentSlots', 'slot-1')));
    });

    it('Teacher cannot read inactive assignments or other teachers assignments', async () => {
      const teacherCtx = testEnv.authenticatedContext('teacher-a');

      // Inactive assignment
      await assertFails(getDoc(doc(teacherCtx.firestore(), 'teacherAssignments', 'assign-inactive')));

      // Other staff assignment
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'teacherAssignments', 'assign-other'), {
          id: 'assign-other',
          schoolId: SCHOOL_A,
          academicYearId: '2026-2027',
          classId: 'class-a',
          subjectId: 'sub-b',
          teacherStaffId: 'staff-teacher-other',
          isActive: true
        });
      });
      await assertFails(getDoc(doc(teacherCtx.firestore(), 'teacherAssignments', 'assign-other')));
    });

    it('Parent or Student cannot read assignments', async () => {
      const parentCtx = testEnv.authenticatedContext('parent-a');
      await assertFails(getDoc(doc(parentCtx.firestore(), 'teacherAssignments', 'assign-1')));
    });

    it('Manager queries must be filtered by schoolId', async () => {
      const dirCtx = testEnv.authenticatedContext('director-a');
      const db = dirCtx.firestore();

      const qOk = query(collection(db, 'teacherAssignments'), where('schoolId', '==', SCHOOL_A));
      await assertSucceeds(getDocs(qOk));

      const qBad = query(collection(db, 'teacherAssignments'));
      await assertFails(getDocs(qBad));
    });
  });
});

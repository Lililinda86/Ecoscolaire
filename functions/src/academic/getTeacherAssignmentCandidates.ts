import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

interface TeacherStaffDoc {
  id: string;
  schoolId: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  staffType?: string;
  teachingEnabled?: boolean;
  isActive?: boolean;
  active?: boolean;
  status?: string;
  employmentStatus?: string;
}

interface StaffUserLinkByStaffDoc {
  schoolId: string;
  staffId: string;
  userId?: string;
  linkId?: string;
  isActive?: boolean;
}

interface StaffUserLinkByUserDoc {
  schoolId: string;
  staffId: string;
  userId: string;
  linkId: string;
  isActive?: boolean;
}

interface StaffUserLinkDoc {
  schoolId: string;
  staffId: string;
  userId: string;
  isActive?: boolean;
}

function getEffectiveStaffType(staff: Partial<TeacherStaffDoc>): string {
  if (staff.staffType) return staff.staffType;
  if (staff.role) return staff.role;
  return 'other';
}

function getEffectiveEmploymentStatus(staff: Partial<TeacherStaffDoc>): string {
  if (staff.employmentStatus) return staff.employmentStatus;

  if (staff.isActive === false || staff.active === false) {
    return 'inactive';
  }
  if (staff.status) {
    const s = staff.status.toLowerCase();
    if (s === 'actif' || s === 'active') return 'active';
    if (s === 'absent' || s === 'remplacé' || s === 'inactive') return 'inactive'; // Mapping legacy
  }
  if (staff.isActive === true || staff.active === true) {
    return 'active';
  }

  // Default fallback if nothing is set
  return 'inactive';
}

function getStaffDisplayName(staff: Partial<TeacherStaffDoc>): string {
  if (staff.firstName || staff.lastName) {
    const parts = [];
    if (staff.lastName) parts.push(staff.lastName.trim());
    if (staff.firstName) parts.push(staff.firstName.trim());
    return parts.join(' ');
  }
  if (staff.name) {
    return staff.name.trim();
  }
  return 'Personnel inconnu';
}

export const getTeacherAssignmentCandidates = functions.https.onCall(async (data, context) => {
  if (!context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'L\'utilisateur doit être authentifié.',
      { businessCode: 'UNAUTHENTICATED' }
    );
  }

  const uid = context.auth.uid;
  const { schoolId } = data || {};

  if (typeof schoolId !== 'string' || schoolId.trim() === '' || schoolId.includes('/') || schoolId.length > 100) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'schoolId doit être une chaîne non vide valide.',
      { businessCode: 'INVALID_ARGUMENT' }
    );
  }

  const cleanSchoolId = schoolId.trim();
  const db = admin.firestore();

  // 1. Read operator profile
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Utilisateur opérateur introuvable.',
      { businessCode: 'PERMISSION_DENIED' }
    );
  }
  const operator = userSnap.data()!;
  if (operator.isActive !== true && operator.active !== true) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Compte opérateur inactif.',
      { businessCode: 'PERMISSION_DENIED' }
    );
  }
  const allowedRoles = ['superAdmin', 'owner', 'director', 'secretary'];
  if (!allowedRoles.includes(operator.role)) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Rôle non autorisé.',
      { businessCode: 'PERMISSION_DENIED' }
    );
  }
  if (operator.role !== 'superAdmin' && operator.schoolId !== cleanSchoolId) {
    throw new functions.https.HttpsError(
      'permission-denied',
      'L\'opérateur n\'appartient pas à l\'école.',
      { businessCode: 'SCHOOL_MISMATCH' }
    );
  }

  // 2. Fetch all staff of the school (since we need to check staffType OR teachingEnabled)
  const staffSnap = await db.collection('staff')
    .where('schoolId', '==', cleanSchoolId)
    .get();

  const allStaff = staffSnap.docs.map(doc => ({
    id: doc.id,
    schoolId: doc.data().schoolId || '',
    name: doc.data().name || '',
    firstName: doc.data().firstName || '',
    lastName: doc.data().lastName || '',
    role: doc.data().role || '',
    staffType: doc.data().staffType || '',
    teachingEnabled: doc.data().teachingEnabled,
    isActive: doc.data().isActive,
    active: doc.data().active,
    status: doc.data().status,
    employmentStatus: doc.data().employmentStatus
  })) as TeacherStaffDoc[];

  const teachers = filterEligibleTeachers(allStaff, cleanSchoolId);

  // 3. Fetch all staff-user link pointers for the school
  const linkByStaffSnap = await db.collection('staffUserLinkByStaff')
    .where('schoolId', '==', cleanSchoolId)
    .get();

  const linksByStaffMap = new Map<string, StaffUserLinkByStaffDoc>();
  linkByStaffSnap.forEach(doc => {
    const d = doc.data();
    linksByStaffMap.set(d.staffId, {
      schoolId: d.schoolId || '',
      staffId: d.staffId || '',
      userId: d.userId,
      linkId: d.linkId,
      isActive: d.isActive
    });
  });

  // To batch resolve active pointers and check for inconsistencies, we load corresponding ByUser and Links docs.
  const activeUserIds = new Set<string>();
  const activeLinkIds = new Set<string>();

  linksByStaffMap.forEach((linkByStaff) => {
    if (linkByStaff.userId) activeUserIds.add(linkByStaff.userId);
    if (linkByStaff.linkId) activeLinkIds.add(linkByStaff.linkId);
  });

  const byUserSnapshots = new Map<string, StaffUserLinkByUserDoc>();
  if (activeUserIds.size > 0) {
    const userIdsArray = Array.from(activeUserIds);
    const snaps = await Promise.all(
      userIdsArray.map(id => db.collection('staffUserLinkByUser').doc(id).get())
    );
    snaps.forEach(snap => {
      if (snap.exists) {
        const d = snap.data()!;
        byUserSnapshots.set(snap.id, {
          schoolId: d.schoolId || '',
          staffId: d.staffId || '',
          userId: d.userId || '',
          linkId: d.linkId || '',
          isActive: d.isActive
        });
      }
    });
  }

  const linkDocSnapshots = new Map<string, StaffUserLinkDoc>();
  if (activeLinkIds.size > 0) {
    const linkIdsArray = Array.from(activeLinkIds);
    const snaps = await Promise.all(
      linkIdsArray.map(id => db.collection('staffUserLinks').doc(id).get())
    );
    snaps.forEach(snap => {
      if (snap.exists) {
        const d = snap.data()!;
        linkDocSnapshots.set(snap.id, {
          schoolId: d.schoolId || '',
          staffId: d.staffId || '',
          userId: d.userId || '',
          isActive: d.isActive
        });
      }
    });
  }

  const candidates = buildTeacherAssignmentCandidates(
    teachers,
    cleanSchoolId,
    linksByStaffMap,
    byUserSnapshots,
    linkDocSnapshots
  );

  return { candidates };
});

export function filterEligibleTeachers(allStaff: TeacherStaffDoc[], cleanSchoolId: string): TeacherStaffDoc[] {
  return allStaff.filter(staff => {
    if (staff.schoolId !== cleanSchoolId) return false;
    const status = getEffectiveEmploymentStatus(staff);
    if (status !== 'active') return false;

    const type = getEffectiveStaffType(staff);
    if (type === 'teacher') return true;
    if (staff.teachingEnabled === true) return true;

    return false;
  });
}

export function buildTeacherAssignmentCandidates(
  teachers: TeacherStaffDoc[],
  cleanSchoolId: string,
  linksByStaffMap: Map<string, StaffUserLinkByStaffDoc>,
  byUserSnapshots: Map<string, StaffUserLinkByUserDoc>,
  linkDocSnapshots: Map<string, StaffUserLinkDoc>
) {
  const candidates = [];

  for (const teacher of teachers) {
    const staffId = teacher.id;
    const linkByStaff = linksByStaffMap.get(staffId);

    let accountStatus: 'linked' | 'unlinked' | 'inactive' | 'inconsistent' = 'unlinked';

    if (linkByStaff) {
      const { userId, linkId, isActive } = linkByStaff;
      const linkByUser = userId ? byUserSnapshots.get(userId) : null;
      const linkDoc = linkId ? linkDocSnapshots.get(linkId) : null;

      // Base validation of IDs inside pointer
      const idCoherency =
        linkByStaff.schoolId === cleanSchoolId &&
        linkByStaff.staffId === staffId &&
        userId &&
        linkId;

      if (!idCoherency) {
        accountStatus = 'inconsistent';
      } else if (isActive === true) {
        // Linked checks
        const matches =
          linkByUser &&
          linkDoc &&
          linkByUser.staffId === staffId &&
          linkByUser.userId === userId &&
          linkByUser.linkId === linkId &&
          linkByUser.isActive === true &&
          linkDoc.staffId === staffId &&
          linkDoc.userId === userId &&
          linkDoc.isActive === true &&
          linkDoc.schoolId === cleanSchoolId;

        accountStatus = matches ? 'linked' : 'inconsistent';
      } else {
        // Inactive checks: must be consistent (no active link pointing to user or link id)
        const isByUserActive = linkByUser && linkByUser.isActive === true;
        const isLinkDocActive = linkDoc && linkDoc.isActive === true;

        if (isByUserActive || isLinkDocActive) {
          accountStatus = 'inconsistent';
        } else {
          accountStatus = 'inactive';
        }
      }
    }

    const isEligible = accountStatus !== 'inconsistent';
    const operationalStatus = getEffectiveEmploymentStatus(teacher);

    candidates.push({
      teacherStaffId: staffId,
      name: getStaffDisplayName(teacher),
      operationalStatus,
      isEligible,
      accountStatus
    });
  }

  // Trier par nom puis prénom de manière déterministe
  candidates.sort((a, b) => a.name.localeCompare(b.name));

  return candidates;
}

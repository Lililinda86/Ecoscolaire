"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTeacherAssignmentCandidates = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
exports.getTeacherAssignmentCandidates = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'L\'utilisateur doit être authentifié.', { businessCode: 'UNAUTHENTICATED' });
    }
    const uid = context.auth.uid;
    const { schoolId } = data || {};
    if (typeof schoolId !== 'string' || schoolId.trim() === '' || schoolId.includes('/') || schoolId.length > 100) {
        throw new functions.https.HttpsError('invalid-argument', 'schoolId doit être une chaîne non vide valide.', { businessCode: 'INVALID_ARGUMENT' });
    }
    const cleanSchoolId = schoolId.trim();
    const db = admin.firestore();
    // 1. Read operator profile
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
        throw new functions.https.HttpsError('permission-denied', 'Utilisateur opérateur introuvable.', { businessCode: 'PERMISSION_DENIED' });
    }
    const operator = userSnap.data();
    if (operator.isActive !== true && operator.active !== true) {
        throw new functions.https.HttpsError('permission-denied', 'Compte opérateur inactif.', { businessCode: 'PERMISSION_DENIED' });
    }
    const allowedRoles = ['superAdmin', 'owner', 'director', 'secretary'];
    if (!allowedRoles.includes(operator.role)) {
        throw new functions.https.HttpsError('permission-denied', 'Rôle non autorisé.', { businessCode: 'PERMISSION_DENIED' });
    }
    if (operator.role !== 'superAdmin' && operator.schoolId !== cleanSchoolId) {
        throw new functions.https.HttpsError('permission-denied', 'L\'opérateur n\'appartient pas à l\'école.', { businessCode: 'SCHOOL_MISMATCH' });
    }
    // 2. Fetch all teachers of the school
    const staffSnap = await db.collection('staff')
        .where('schoolId', '==', cleanSchoolId)
        .where('role', '==', 'teacher')
        .get();
    const teachers = staffSnap.docs.map(doc => ({
        id: doc.id,
        schoolId: doc.data().schoolId || '',
        name: doc.data().name || '',
        role: doc.data().role || '',
        isActive: doc.data().isActive,
        active: doc.data().active,
        status: doc.data().status
    }));
    // 3. Fetch all staff-user link pointers for the school
    const linkByStaffSnap = await db.collection('staffUserLinkByStaff')
        .where('schoolId', '==', cleanSchoolId)
        .get();
    const linksByStaffMap = new Map();
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
    const activeUserIds = new Set();
    const activeLinkIds = new Set();
    linksByStaffMap.forEach((linkByStaff) => {
        if (linkByStaff.userId)
            activeUserIds.add(linkByStaff.userId);
        if (linkByStaff.linkId)
            activeLinkIds.add(linkByStaff.linkId);
    });
    const byUserSnapshots = new Map();
    if (activeUserIds.size > 0) {
        const userIdsArray = Array.from(activeUserIds);
        const snaps = await Promise.all(userIdsArray.map(id => db.collection('staffUserLinkByUser').doc(id).get()));
        snaps.forEach(snap => {
            if (snap.exists) {
                const d = snap.data();
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
    const linkDocSnapshots = new Map();
    if (activeLinkIds.size > 0) {
        const linkIdsArray = Array.from(activeLinkIds);
        const snaps = await Promise.all(linkIdsArray.map(id => db.collection('staffUserLinks').doc(id).get()));
        snaps.forEach(snap => {
            if (snap.exists) {
                const d = snap.data();
                linkDocSnapshots.set(snap.id, {
                    schoolId: d.schoolId || '',
                    staffId: d.staffId || '',
                    userId: d.userId || '',
                    isActive: d.isActive
                });
            }
        });
    }
    const candidates = [];
    for (const teacher of teachers) {
        const staffId = teacher.id;
        const linkByStaff = linksByStaffMap.get(staffId);
        let accountStatus = 'unlinked';
        if (linkByStaff) {
            const { userId, linkId, isActive } = linkByStaff;
            const linkByUser = userId ? byUserSnapshots.get(userId) : null;
            const linkDoc = linkId ? linkDocSnapshots.get(linkId) : null;
            // Base validation of IDs inside pointer
            const idCoherency = linkByStaff.schoolId === cleanSchoolId &&
                linkByStaff.staffId === staffId &&
                userId &&
                linkId;
            if (!idCoherency) {
                accountStatus = 'inconsistent';
            }
            else if (isActive === true) {
                // Linked checks
                const matches = linkByUser &&
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
            }
            else {
                // Inactive checks: must be consistent (no active link pointing to user or link id)
                const isByUserActive = linkByUser && linkByUser.isActive === true;
                const isLinkDocActive = linkDoc && linkDoc.isActive === true;
                if (isByUserActive || isLinkDocActive) {
                    accountStatus = 'inconsistent';
                }
                else {
                    accountStatus = 'inactive';
                }
            }
        }
        const isStaffActive = teacher.isActive !== false && teacher.active !== false;
        const isEligible = isStaffActive && accountStatus !== 'inconsistent';
        // Map operational status (must support 'actif' | 'absent' | 'remplacé')
        let operationalStatus = undefined;
        if (teacher.status === 'actif' || teacher.status === 'absent' || teacher.status === 'remplacé') {
            operationalStatus = teacher.status;
        }
        candidates.push({
            teacherStaffId: staffId,
            name: teacher.name,
            operationalStatus,
            isEligible,
            accountStatus
        });
    }
    return { candidates };
});
//# sourceMappingURL=getTeacherAssignmentCandidates.js.map
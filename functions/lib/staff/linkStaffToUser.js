"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.linkStaffToUser = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
exports.linkStaffToUser = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'L\'utilisateur doit être authentifié.', { businessCode: 'UNAUTHENTICATED' });
    }
    const uid = context.auth.uid;
    const { schoolId, staffId, userId } = data || {};
    // 1. Argument validation
    if (typeof schoolId !== 'string' || schoolId.trim() === '' || schoolId.includes('/') || schoolId.length > 100) {
        throw new functions.https.HttpsError('invalid-argument', 'schoolId doit être une chaîne non vide valide.', { businessCode: 'INVALID_ARGUMENT' });
    }
    if (typeof staffId !== 'string' || staffId.trim() === '' || staffId.includes('/') || staffId.length > 100) {
        throw new functions.https.HttpsError('invalid-argument', 'staffId doit être une chaîne non vide valide.', { businessCode: 'INVALID_ARGUMENT' });
    }
    if (typeof userId !== 'string' || userId.trim() === '' || userId.includes('/') || userId.length > 100) {
        throw new functions.https.HttpsError('invalid-argument', 'userId doit être une chaîne non vide valide.', { businessCode: 'INVALID_ARGUMENT' });
    }
    const cleanSchoolId = schoolId.trim();
    const cleanStaffId = staffId.trim();
    const cleanUserId = userId.trim();
    const db = admin.firestore();
    const nowIso = new Date().toISOString();
    const linkRef = db.collection('staffUserLinks').doc();
    const linkId = linkRef.id;
    const staffPointerId = `${cleanSchoolId}__${cleanStaffId}`;
    try {
        return await db.runTransaction(async (transaction) => {
            // 1. Read operator user profile
            const operatorRef = db.collection('users').doc(uid);
            const operatorSnap = await transaction.get(operatorRef);
            if (!operatorSnap.exists) {
                throw new functions.https.HttpsError('permission-denied', 'Utilisateur opérateur introuvable.', { businessCode: 'PERMISSION_DENIED' });
            }
            const operator = operatorSnap.data();
            if (operator.isActive !== true) {
                throw new functions.https.HttpsError('permission-denied', 'Compte opérateur inactif.', { businessCode: 'PERMISSION_DENIED' });
            }
            const allowedRoles = ['superAdmin', 'owner', 'director'];
            if (!allowedRoles.includes(operator.role)) {
                throw new functions.https.HttpsError('permission-denied', 'Rôle non autorisé à gérer les liaisons d\'identité.', { businessCode: 'PERMISSION_DENIED' });
            }
            if (operator.role !== 'superAdmin' && operator.schoolId !== cleanSchoolId) {
                throw new functions.https.HttpsError('permission-denied', 'L\'opérateur n\'appartient pas à l\'école demandée.', { businessCode: 'PERMISSION_DENIED' });
            }
            // 2. Read target user profile
            const targetUserRef = db.collection('users').doc(cleanUserId);
            const targetUserSnap = await transaction.get(targetUserRef);
            if (!targetUserSnap.exists) {
                throw new functions.https.HttpsError('not-found', 'Utilisateur cible introuvable.', { businessCode: 'USER_NOT_FOUND' });
            }
            const targetUser = targetUserSnap.data();
            if (targetUser.isActive !== true) {
                throw new functions.https.HttpsError('failed-precondition', 'Le compte utilisateur cible est inactif.', { businessCode: 'USER_INACTIVE' });
            }
            if (targetUser.role !== 'teacher') {
                throw new functions.https.HttpsError('failed-precondition', 'L\'utilisateur cible doit avoir le rôle d\'enseignant.', { businessCode: 'USER_NOT_TEACHER' });
            }
            if (targetUser.schoolId !== cleanSchoolId) {
                throw new functions.https.HttpsError('permission-denied', 'L\'utilisateur cible n\'appartient pas à la même école.', { businessCode: 'SCHOOL_MISMATCH' });
            }
            // 3. Read staff profile
            const staffRef = db.collection('staff').doc(cleanStaffId);
            const staffSnap = await transaction.get(staffRef);
            if (!staffSnap.exists) {
                throw new functions.https.HttpsError('not-found', 'Profil de membre du personnel introuvable.', { businessCode: 'STAFF_NOT_FOUND' });
            }
            const staff = staffSnap.data();
            if (staff.isActive === false) {
                throw new functions.https.HttpsError('failed-precondition', 'Le profil de membre du personnel est inactif.', { businessCode: 'STAFF_INACTIVE' });
            }
            if (staff.role !== 'teacher') {
                throw new functions.https.HttpsError('failed-precondition', 'Le membre du personnel doit avoir le rôle d\'enseignant.', { businessCode: 'STAFF_NOT_TEACHER' });
            }
            if (staff.schoolId !== cleanSchoolId) {
                throw new functions.https.HttpsError('permission-denied', 'Le membre du personnel n\'appartient pas à la même école.', { businessCode: 'SCHOOL_MISMATCH' });
            }
            // 4. Read current pointers for uniqueness checks
            const userPointerRef = db.collection('staffUserLinkByUser').doc(cleanUserId);
            const staffPointerRef = db.collection('staffUserLinkByStaff').doc(staffPointerId);
            const userPointerSnap = await transaction.get(userPointerRef);
            const staffPointerSnap = await transaction.get(staffPointerRef);
            const userPointerExists = userPointerSnap.exists;
            const staffPointerExists = staffPointerSnap.exists;
            const userPointerActive = userPointerExists && userPointerSnap.data()?.isActive === true;
            const staffPointerActive = staffPointerExists && staffPointerSnap.data()?.isActive === true;
            // Uniqueness validation on ACTIVE links
            if (userPointerActive && userPointerSnap.data()?.staffId !== cleanStaffId) {
                throw new functions.https.HttpsError('already-exists', 'Cet utilisateur est déjà relié à un autre membre du personnel.', { businessCode: 'USER_ALREADY_LINKED' });
            }
            if (staffPointerActive && staffPointerSnap.data()?.userId !== cleanUserId) {
                throw new functions.https.HttpsError('already-exists', 'Ce membre du personnel est déjà relié à un autre compte utilisateur.', { businessCode: 'STAFF_ALREADY_LINKED' });
            }
            // Case: Both exist and are active
            if (userPointerActive && staffPointerActive) {
                const uLink = userPointerSnap.data();
                const sLink = staffPointerSnap.data();
                if (uLink.linkId === sLink.linkId && uLink.staffId === cleanStaffId && sLink.userId === cleanUserId) {
                    // Idempotency: exact same active link already exists
                    return {
                        linkId: uLink.linkId,
                        schoolId: cleanSchoolId,
                        userId: cleanUserId,
                        staffId: cleanStaffId,
                        linked: false,
                        alreadyLinked: true
                    };
                }
                else {
                    throw new functions.https.HttpsError('failed-precondition', 'Incohérence d\'intégrité détectée. L\'utilisateur et le staff sont déjà liés séparément.', { businessCode: 'LINK_INTEGRITY_ERROR' });
                }
            }
            // If one is active and the other is not -> Integrity error
            if (userPointerActive || staffPointerActive) {
                throw new functions.https.HttpsError('failed-precondition', 'Un pointeur orphelin actif a été détecté en base.', { businessCode: 'LINK_INTEGRITY_ERROR' });
            }
            // If both exist but are inactive
            if (userPointerExists && staffPointerExists) {
                const uLink = userPointerSnap.data();
                const sLink = staffPointerSnap.data();
                if (uLink.linkId !== sLink.linkId || uLink.staffId !== cleanStaffId || sLink.userId !== cleanUserId) {
                    throw new functions.https.HttpsError('failed-precondition', 'Incohérence d\'intégrité détectée sur les pointeurs inactifs.', { businessCode: 'LINK_INTEGRITY_ERROR' });
                }
                // Validate historical link document integrity
                const pastLinkRef = db.collection('staffUserLinks').doc(uLink.linkId);
                const pastLinkSnap = await transaction.get(pastLinkRef);
                if (!pastLinkSnap.exists || pastLinkSnap.data()?.isActive !== false) {
                    throw new functions.https.HttpsError('failed-precondition', 'Incohérence d\'intégrité avec le document historique inactif.', { businessCode: 'LINK_INTEGRITY_ERROR' });
                }
                // We can link again (Re-link after unlink):
                // Write 1: Create a NEW historic document
                const linkDoc = {
                    id: linkId,
                    schoolId: cleanSchoolId,
                    userId: cleanUserId,
                    staffId: cleanStaffId,
                    isActive: true,
                    createdAt: nowIso,
                    createdBy: uid,
                    updatedAt: nowIso,
                    updatedBy: uid
                };
                transaction.create(linkRef, linkDoc);
                // Write 2 & 3: Update existing pointers with transaction.set or update (since they exist)
                const updatedPointerDoc = {
                    userId: cleanUserId,
                    staffId: cleanStaffId,
                    schoolId: cleanSchoolId,
                    linkId: linkId,
                    isActive: true,
                    updatedAt: nowIso,
                    updatedBy: uid
                };
                transaction.set(userPointerRef, updatedPointerDoc);
                transaction.set(staffPointerRef, updatedPointerDoc);
                return {
                    linkId,
                    schoolId: cleanSchoolId,
                    userId: cleanUserId,
                    staffId: cleanStaffId,
                    linked: true,
                    alreadyLinked: false
                };
            }
            // If one exists inactives but the other does not -> Integrity error
            if (userPointerExists || staffPointerExists) {
                throw new functions.https.HttpsError('failed-precondition', 'Un seul des pointeurs inactifs existe en base.', { businessCode: 'LINK_INTEGRITY_ERROR' });
            }
            // Case: Neither pointer exists (First link creation)
            // Write 1: Historic doc
            const linkDoc = {
                id: linkId,
                schoolId: cleanSchoolId,
                userId: cleanUserId,
                staffId: cleanStaffId,
                isActive: true,
                createdAt: nowIso,
                createdBy: uid,
                updatedAt: nowIso,
                updatedBy: uid
            };
            transaction.create(linkRef, linkDoc);
            // Write 2: User pointer doc (create because it does not exist)
            const userPointerDoc = {
                userId: cleanUserId,
                staffId: cleanStaffId,
                schoolId: cleanSchoolId,
                linkId: linkId,
                isActive: true,
                updatedAt: nowIso,
                updatedBy: uid
            };
            transaction.create(userPointerRef, userPointerDoc);
            // Write 3: Staff pointer doc (create because it does not exist)
            const staffPointerDoc = {
                userId: cleanUserId,
                staffId: cleanStaffId,
                schoolId: cleanSchoolId,
                linkId: linkId,
                isActive: true,
                updatedAt: nowIso,
                updatedBy: uid
            };
            transaction.create(staffPointerRef, staffPointerDoc);
            return {
                linkId,
                schoolId: cleanSchoolId,
                userId: cleanUserId,
                staffId: cleanStaffId,
                linked: true,
                alreadyLinked: false
            };
        });
    }
    catch (err) {
        if (err instanceof functions.https.HttpsError) {
            throw err;
        }
        throw new functions.https.HttpsError('internal', err instanceof Error ? err.message : String(err));
    }
});
//# sourceMappingURL=linkStaffToUser.js.map
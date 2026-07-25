"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.unlinkStaffFromUser = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
exports.unlinkStaffFromUser = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.uid) {
        throw new functions.https.HttpsError('unauthenticated', 'L\'utilisateur doit être authentifié.', { businessCode: 'UNAUTHENTICATED' });
    }
    const uid = context.auth.uid;
    const { schoolId, staffId, userId, reason } = data || {};
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
    // Normalisation and length check on deactivation reason
    let cleanReason = '';
    if (typeof reason === 'string') {
        cleanReason = reason.trim();
        if (cleanReason.length > 500) {
            throw new functions.https.HttpsError('invalid-argument', 'Le motif de dissociation est trop long (maximum 500 caractères).', { businessCode: 'INVALID_ARGUMENT' });
        }
    }
    const db = admin.firestore();
    const nowIso = new Date().toISOString();
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
            if (staff.schoolId !== cleanSchoolId) {
                throw new functions.https.HttpsError('permission-denied', 'Le membre du personnel n\'appartient pas à la même école.', { businessCode: 'SCHOOL_MISMATCH' });
            }
            // 4. Read current pointers
            const userPointerRef = db.collection('staffUserLinkByUser').doc(cleanUserId);
            const staffPointerRef = db.collection('staffUserLinkByStaff').doc(staffPointerId);
            const userPointerSnap = await transaction.get(userPointerRef);
            const staffPointerSnap = await transaction.get(staffPointerRef);
            const userPointerExists = userPointerSnap.exists;
            const staffPointerExists = staffPointerSnap.exists;
            // Case: Neither pointer exists -> Link never existed
            if (!userPointerExists && !staffPointerExists) {
                throw new functions.https.HttpsError('not-found', 'Aucune liaison existante ou passée n\'a été trouvée pour cet utilisateur et ce membre du personnel.', { businessCode: 'STAFF_USER_LINK_NOT_FOUND' });
            }
            // Integrity check: If only one exists -> Integrity error
            if (!userPointerExists || !staffPointerExists) {
                throw new functions.https.HttpsError('failed-precondition', 'Un seul des deux documents de pointeur existe en base.', { businessCode: 'LINK_INTEGRITY_ERROR' });
            }
            const userPointer = userPointerSnap.data();
            const staffPointer = staffPointerSnap.data();
            // Validate pointer values match each other and arguments
            if (userPointer.linkId !== staffPointer.linkId ||
                userPointer.staffId !== cleanStaffId ||
                staffPointer.userId !== cleanUserId ||
                userPointer.schoolId !== cleanSchoolId ||
                staffPointer.schoolId !== cleanSchoolId) {
                throw new functions.https.HttpsError('failed-precondition', 'Incohérence d\'intégrité détectée sur les pointeurs.', { businessCode: 'LINK_INTEGRITY_ERROR' });
            }
            // Read corresponding historic doc
            const linkRef = db.collection('staffUserLinks').doc(userPointer.linkId);
            const linkSnap = await transaction.get(linkRef);
            if (!linkSnap.exists) {
                throw new functions.https.HttpsError('failed-precondition', 'Le document historique de liaison correspondant est manquant.', { businessCode: 'LINK_INTEGRITY_ERROR' });
            }
            const linkDocData = linkSnap.data();
            // Verify historic doc matches pointers
            if (linkDocData.userId !== cleanUserId ||
                linkDocData.staffId !== cleanStaffId ||
                linkDocData.schoolId !== cleanSchoolId) {
                throw new functions.https.HttpsError('failed-precondition', 'Incohérence d\'intégrité entre l\'historique et les pointeurs.', { businessCode: 'LINK_INTEGRITY_ERROR' });
            }
            // If both are already inactive (unlink retry idempotency)
            if (userPointer.isActive === false && staffPointer.isActive === false) {
                if (linkDocData.isActive !== false) {
                    throw new functions.https.HttpsError('failed-precondition', 'Incohérence d\'état entre les pointeurs inactifs et l\'historique actif.', { businessCode: 'LINK_INTEGRITY_ERROR' });
                }
                return {
                    linkId: userPointer.linkId,
                    schoolId: cleanSchoolId,
                    userId: cleanUserId,
                    staffId: cleanStaffId,
                    unlinked: false,
                    alreadyUnlinked: true
                };
            }
            // If one is active and the other is inactive -> Integrity error
            if (userPointer.isActive === false || staffPointer.isActive === false) {
                throw new functions.https.HttpsError('failed-precondition', 'Divergence d\'état actif/inactif entre les deux pointeurs.', { businessCode: 'LINK_INTEGRITY_ERROR' });
            }
            // If both are active, verify the historic doc is also active
            if (linkDocData.isActive !== true) {
                throw new functions.https.HttpsError('failed-precondition', 'Incohérence d\'état: l\'historique est inactif alors que les pointeurs sont actifs.', { businessCode: 'LINK_INTEGRITY_ERROR' });
            }
            // Logical dissociation: Update all three documents (do not delete)
            const historicUpdate = {
                isActive: false,
                updatedAt: nowIso,
                updatedBy: uid,
                deactivatedAt: nowIso,
                deactivatedBy: uid
            };
            if (cleanReason !== '') {
                historicUpdate.deactivationReason = cleanReason;
            }
            transaction.update(linkRef, historicUpdate);
            const pointerUpdate = {
                isActive: false,
                updatedAt: nowIso,
                updatedBy: uid
            };
            transaction.update(userPointerRef, pointerUpdate);
            transaction.update(staffPointerRef, pointerUpdate);
            return {
                linkId: userPointer.linkId,
                schoolId: cleanSchoolId,
                userId: cleanUserId,
                staffId: cleanStaffId,
                unlinked: true,
                alreadyUnlinked: false
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
//# sourceMappingURL=unlinkStaffFromUser.js.map
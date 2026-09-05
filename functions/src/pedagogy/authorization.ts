import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';

export interface PedagogyActor { uid: string; role: string; schoolId?: string }

export const requireId = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || !value.trim() || value.includes('/') || value.length > 100) {
    throw new functions.https.HttpsError('invalid-argument', `${name} invalide.`, { businessCode: 'INVALID_ARGUMENT' });
  }
  return value.trim();
};

export const requirePedagogyActor = async (
  context: functions.https.CallableContext,
  schoolIdValue: unknown,
  allowedRoles: readonly string[] = ['superAdmin', 'owner', 'director', 'secretary']
): Promise<{ actor: PedagogyActor; schoolId: string }> => {
  if (!context.auth?.uid) throw new functions.https.HttpsError('unauthenticated', 'Authentification requise.');
  const schoolId = requireId(schoolIdValue, 'schoolId');
  const snap = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (!snap.exists || snap.data()?.isActive !== true) throw new functions.https.HttpsError('permission-denied', 'Compte inactif ou introuvable.');
  const user = snap.data()!;
  if (!allowedRoles.includes(user.role)) throw new functions.https.HttpsError('permission-denied', 'Rôle non autorisé.');
  if (user.role !== 'superAdmin' && user.schoolId !== schoolId) throw new functions.https.HttpsError('permission-denied', 'Accès inter-écoles interdit.');
  return { actor: { uid: context.auth.uid, role: user.role, schoolId: user.schoolId }, schoolId };
};

export const audit = (
  transaction: admin.firestore.Transaction,
  actor: PedagogyActor,
  schoolId: string,
  action: string,
  targetType: string,
  targetId: string,
  details: Record<string, unknown>
): void => {
  transaction.create(admin.firestore().collection('audit_logs').doc(), {
    schoolId, action, actorUid: actor.uid, actorRole: actor.role, targetType, targetId, details,
    timestamp: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    canonicalBackendAudit: true
  });
};

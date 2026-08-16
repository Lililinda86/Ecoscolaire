import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';

type Data = Record<string, unknown>;

type AuditAuth = {
  uid: string;
  token?: Data;
};

type AuditDependencies = {
  loadUser: (uid: string) => Promise<{ exists: boolean; data: Data | undefined }>;
  createAudit: (record: Data) => Promise<string>;
  serverTimestamp: () => unknown;
  nowIso: () => string;
};

type AuditActionConfig = {
  targetType: string;
  session?: boolean;
  detailKeys?: ReadonlySet<string>;
  roles?: ReadonlySet<string>;
};

const MANAGEMENT_ROLES = new Set(['superAdmin', 'owner', 'director']);
const STUDENT_WRITE_ROLES = new Set(['superAdmin', 'owner', 'director', 'secretary']);
const PAYMENT_ROLES = new Set(['superAdmin', 'owner', 'director', 'accountant', 'secretary']);
const GRADE_EXPORT_ROLES = new Set(['superAdmin', 'owner', 'director', 'secretary', 'teacher']);

const AUDIT_ACTIONS: Readonly<Record<string, AuditActionConfig>> = Object.freeze({
  LOGIN: { targetType: 'SYSTEM', session: true },
  LOGOUT: { targetType: 'SYSTEM', session: true },
  EXPORT_PDF: { targetType: 'DOCUMENT', roles: GRADE_EXPORT_ROLES },
  APPROVE_VALIDATION_REQUEST: { targetType: 'VALIDATION_REQUEST', roles: MANAGEMENT_ROLES },
  REJECT_VALIDATION_REQUEST: { targetType: 'VALIDATION_REQUEST', roles: MANAGEMENT_ROLES },
  CREATE_USER: { targetType: 'USER', roles: MANAGEMENT_ROLES, detailKeys: new Set(['setupEmailSent']) },
  CREATE_SCHOOL: { targetType: 'SCHOOL', roles: new Set(['superAdmin']) },
  UPLOAD_LOGO: { targetType: 'SCHOOL', roles: new Set(['superAdmin']) },
  CREATE_PAYMENT: { targetType: 'PAYMENT', roles: PAYMENT_ROLES },
  DELETE_PAYMENT: { targetType: 'PAYMENT', roles: PAYMENT_ROLES },
  STUDENT_INVITE_GENERATED: { targetType: 'STUDENT', roles: STUDENT_WRITE_ROLES, detailKeys: new Set(['inviteId']) },
  CREATE_STUDENT: { targetType: 'STUDENT', roles: STUDENT_WRITE_ROLES },
  UPDATE_STUDENT: { targetType: 'STUDENT', roles: STUDENT_WRITE_ROLES },
  DEACTIVATE_STUDENT: { targetType: 'STUDENT', roles: STUDENT_WRITE_ROLES },
  REACTIVATE_STUDENT: { targetType: 'STUDENT', roles: STUDENT_WRITE_ROLES },
});

const ACTOR_ROLES = new Set([
  'superAdmin', 'owner', 'director', 'secretary', 'accountant', 'teacher',
  'driver', 'parent', 'student', 'boardViewer',
]);

const httpsError = (
  code: functions.https.FunctionsErrorCode,
  message: string,
): functions.https.HttpsError => new functions.https.HttpsError(code, message);

const requirePlainObject = (value: unknown, field: string): Data => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpsError('invalid-argument', `${field} must be an object.`);
  }
  return value as Data;
};

const requireText = (value: unknown, field: string, max: number): string => {
  if (typeof value !== 'string' || value !== value.trim() || value.length < 1 || value.length > max
      || /[\u0000-\u001f\u007f]/.test(value)) {
    throw httpsError('invalid-argument', `${field} is invalid.`);
  }
  return value;
};

const validateDetails = (action: string, raw: unknown, allowedKeys?: ReadonlySet<string>): Data => {
  if (raw === undefined) return {};
  const details = requirePlainObject(raw, 'details');
  const keys = Object.keys(details);
  if (!allowedKeys || keys.some(key => !allowedKeys.has(key))) {
    throw httpsError('invalid-argument', `details are not allowed for ${action}.`);
  }

  if ('setupEmailSent' in details && typeof details.setupEmailSent !== 'boolean') {
    throw httpsError('invalid-argument', 'details.setupEmailSent is invalid.');
  }
  if ('inviteId' in details) {
    requireText(details.inviteId, 'details.inviteId', 128);
  }
  return { ...details };
};

const parsePayload = (raw: unknown, actorUid: string, actorEmail: string, actorRole: string): Data => {
  const payload = requirePlainObject(raw, 'payload');
  const allowedKeys = new Set(['action', 'targetType', 'targetId', 'targetName', 'details']);
  const unexpected = Object.keys(payload).filter(key => !allowedKeys.has(key));
  if (unexpected.length > 0) {
    throw httpsError('invalid-argument', `Unsupported audit fields: ${unexpected.join(', ')}.`);
  }

  const action = requireText(payload.action, 'action', 64);
  const config = AUDIT_ACTIONS[action];
  if (!config) {
    throw httpsError('invalid-argument', 'Unsupported audit action.');
  }
  if (config.roles && !config.roles.has(actorRole)) {
    throw httpsError('permission-denied', 'Role is not allowed to record this audit action.');
  }

  if (config.session) {
    if (Object.keys(payload).some(key => key !== 'action')) {
      throw httpsError('invalid-argument', 'Session audit events accept only action.');
    }
    return {
      action,
      targetType: 'SYSTEM',
      targetId: actorUid,
      targetName: actorEmail || actorUid,
      details: {},
    };
  }

  const targetType = requireText(payload.targetType, 'targetType', 64);
  if (targetType !== config.targetType) {
    throw httpsError('invalid-argument', 'targetType does not match the audit action.');
  }
  return {
    action,
    targetType,
    targetId: requireText(payload.targetId, 'targetId', 256),
    targetName: requireText(payload.targetName, 'targetName', 500),
    details: validateDetails(action, payload.details, config.detailKeys),
  };
};

const isActiveUser = (user: Data): boolean =>
  user.active === true || user.isActive === true || user.status === 'active';

export const handleAuthenticatedAudit = async (
  raw: unknown,
  auth: AuditAuth | undefined,
  dependencies: AuditDependencies,
): Promise<{ auditId: string }> => {
  if (!auth?.uid) {
    throw httpsError('unauthenticated', 'Authentication required.');
  }

  const snapshot = await dependencies.loadUser(auth.uid);
  const user = snapshot.data;
  if (!snapshot.exists || !user) {
    throw httpsError('permission-denied', 'User profile required.');
  }
  if (!isActiveUser(user)) {
    throw httpsError('permission-denied', 'Active user required.');
  }

  const actorRole = typeof user.role === 'string' ? user.role : '';
  if (!ACTOR_ROLES.has(actorRole)) {
    throw httpsError('permission-denied', 'Valid user role required.');
  }

  const schoolId = typeof user.schoolId === 'string' && user.schoolId.trim()
    ? user.schoolId.trim()
    : null;
  if (actorRole !== 'superAdmin' && !schoolId) {
    throw httpsError('permission-denied', 'School assignment required.');
  }

  const actorEmail = typeof user.email === 'string' && user.email.trim()
    ? user.email.trim().toLowerCase()
    : typeof auth.token?.email === 'string'
      ? auth.token.email.trim().toLowerCase()
      : '';
  const event = parsePayload(raw, auth.uid, actorEmail, actorRole);
  const record: Data = {
    actorUid: auth.uid,
    actorRole,
    schoolId,
    action: event.action,
    createdAt: dependencies.serverTimestamp(),
    userId: auth.uid,
    userEmail: actorEmail,
    userRole: actorRole,
    timestamp: dependencies.nowIso(),
    targetType: event.targetType,
    targetId: event.targetId,
    targetName: event.targetName,
    details: event.details,
    canonicalBackendAudit: true,
  };

  if (user.testFixture === true && typeof user.testRunId === 'string' && user.testRunId.trim()) {
    record.testFixture = true;
    record.testRunId = user.testRunId.trim();
  }

  const auditId = await dependencies.createAudit(record);
  return { auditId };
};

const productionDependencies: AuditDependencies = {
  loadUser: async uid => {
    const snapshot = await admin.firestore().collection('users').doc(uid).get();
    return { exists: snapshot.exists, data: snapshot.data() };
  },
  createAudit: async record => {
    const reference = await admin.firestore().collection('audit_logs').add(record);
    return reference.id;
  },
  serverTimestamp: () => FieldValue.serverTimestamp(),
  nowIso: () => new Date().toISOString(),
};

export const recordAuthenticatedAudit = functions.https.onCall(async (data, context) =>
  handleAuthenticatedAudit(data, context.auth, productionDependencies));

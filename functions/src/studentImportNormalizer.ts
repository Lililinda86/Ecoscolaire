import * as crypto from 'crypto';

export interface NormalizedStudentRow {
  id: string;
  schoolId: string;
  matricule: string;
  name: string;
  gender?: string;
  dob?: string;
  section?: string;
  classId?: string;
  parentName?: string;
  parentEmails?: string[];
  parentPhone?: string;
  feeT1?: number;
  feeT2?: number;
  feeT3?: number;
  feeTransport?: number;
  feeUniforms?: number;
  address?: string;
  emergencyContact?: string;
  allergies?: string;
  medicalConditions?: string;
  importJobId: string;
  importedAt: any; // Firebase Timestamp or string depending on context
  updatedAt: any;
}

export interface RowNormalizationResult {
  validRows: NormalizedStudentRow[];
  invalidRows: any[];
  skippedRows: any[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    skipped: number;
  };
}

/**
 * Normalizes a string: trims, removes multiple spaces, converts to uppercase (optional), and standardizes Unicode.
 */
function normalizeString(str: any, toUpper = false): string {
  if (typeof str !== 'string') return '';
  let normalized = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ');
  if (toUpper) normalized = normalized.toUpperCase();
  return normalized;
}

/**
 * Normalizes phone numbers (simple cleanup)
 */
function normalizePhone(str: any): string {
  if (typeof str !== 'string' && typeof str !== 'number') return '';
  let phone = String(str).replace(/\s+/g, '');
  const hasPlus = phone.startsWith('+');
  phone = phone.replace(/[^\d]/g, '');
  if (!phone) return '';
  if (hasPlus) return '+' + phone;
  return phone;
}

/**
 * Normalizes email address
 */
function normalizeEmail(str: any): string {
  if (typeof str !== 'string') return '';
  const email = str.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

/**
 * Normalizes financial amounts
 */
function normalizeAmount(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  const num = Number(val);
  if (!Number.isFinite(num)) return 0;
  return num;
}

/**
 * Generates deterministic ID
 */
export function generateStudentId(schoolId: string, matricule: string): string {
  const hash = crypto.createHash('sha256');
  hash.update(`school_${schoolId}_mat_${matricule}`);
  return hash.digest('hex');
}

/**
 * Normalizes a raw payload row into a safe, whitelisted student object.
 */
export function normalizeRows(payload: any[], schoolId: string, jobId: string, timestamp: any = new Date().toISOString()): RowNormalizationResult {
  const result: RowNormalizationResult = {
    validRows: [],
    invalidRows: [],
    skippedRows: [],
    summary: { total: payload.length, valid: 0, invalid: 0, skipped: 0 }
  };

  payload.forEach((rawRow, index) => {
    // Check if empty row
    if (!rawRow || typeof rawRow !== 'object' || Object.keys(rawRow).length === 0) {
      result.skippedRows.push({ rowIndex: index, reason: 'Empty row' });
      result.summary.skipped++;
      return;
    }

    const matricule = normalizeString(rawRow.matricule, true);
    if (!matricule) {
      result.invalidRows.push({
        rowIndex: index,
        errorCode: 'MISSING_MATRICULE',
        message: 'Le matricule est obligatoire.'
      });
      result.summary.invalid++;
      return;
    }

    const name = normalizeString(rawRow.name, true);
    if (!name) {
      result.invalidRows.push({
        rowIndex: index,
        matricule,
        errorCode: 'MISSING_NAME',
        message: 'Le nom est obligatoire.'
      });
      result.summary.invalid++;
      return;
    }
    
    // classId is technically required by the prompt instructions but might be missing in raw data.
    const classId = normalizeString(rawRow.classId);
    if (!classId) {
       result.invalidRows.push({
        rowIndex: index,
        matricule,
        errorCode: 'MISSING_CLASS',
        message: 'La classe (classId) est obligatoire.'
      });
      result.summary.invalid++;
      return;
    }

    // Process parents emails properly
    let parentEmails: string[] = [];
    if (Array.isArray(rawRow.parentEmails)) {
      parentEmails = rawRow.parentEmails.map(normalizeEmail).filter(Boolean);
    } else if (typeof rawRow.parentEmails === 'string') {
      parentEmails = [normalizeEmail(rawRow.parentEmails)].filter(Boolean);
    }

    // Whitelist and normalize fields
    const safeRow: NormalizedStudentRow = {
      id: generateStudentId(schoolId, matricule),
      schoolId: schoolId,
      importJobId: jobId,
      importedAt: timestamp,
      updatedAt: timestamp,
      matricule: matricule,
      name: name,
      classId: classId
    };

    if (rawRow.gender) safeRow.gender = normalizeString(rawRow.gender, true);
    if (rawRow.dob) safeRow.dob = normalizeString(rawRow.dob);
    if (rawRow.section) safeRow.section = normalizeString(rawRow.section, true);
    if (rawRow.parentName) safeRow.parentName = normalizeString(rawRow.parentName, true);
    if (parentEmails.length > 0) safeRow.parentEmails = parentEmails;
    if (rawRow.parentPhone) safeRow.parentPhone = normalizePhone(rawRow.parentPhone);
    
    // Financials
    safeRow.feeT1 = normalizeAmount(rawRow.feeT1);
    safeRow.feeT2 = normalizeAmount(rawRow.feeT2);
    safeRow.feeT3 = normalizeAmount(rawRow.feeT3);
    safeRow.feeTransport = normalizeAmount(rawRow.feeTransport);
    safeRow.feeUniforms = normalizeAmount(rawRow.feeUniforms);
    
    if (rawRow.address) safeRow.address = normalizeString(rawRow.address);
    if (rawRow.emergencyContact) safeRow.emergencyContact = normalizeString(rawRow.emergencyContact);
    if (rawRow.allergies) safeRow.allergies = normalizeString(rawRow.allergies);
    if (rawRow.medicalConditions) safeRow.medicalConditions = normalizeString(rawRow.medicalConditions);

    result.validRows.push(safeRow);
    result.summary.valid++;
  });

  return result;
}

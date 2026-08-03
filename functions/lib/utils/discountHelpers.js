"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeTuitionDiscountCounterId = exports.makeTuitionDiscountSlotId = exports.getTuitionDiscountField = exports.getTuitionPaidField = exports.calculateTuitionDiscountAmounts = exports.isTuitionInstallment = void 0;
const node_crypto_1 = require("node:crypto");
const isTuitionInstallment = (value) => {
    return value === 'T1' || value === 'T2' || value === 'T3';
};
exports.isTuitionInstallment = isTuitionInstallment;
const calculateTuitionDiscountAmounts = (grossExpectedAmount, discountAmount) => {
    if (!Number.isFinite(grossExpectedAmount) ||
        !Number.isSafeInteger(grossExpectedAmount) ||
        grossExpectedAmount <= 0) {
        throw new Error('Le montant attendu brut doit être un entier positif sûr.');
    }
    if (!Number.isFinite(discountAmount) ||
        !Number.isSafeInteger(discountAmount) ||
        discountAmount <= 0) {
        throw new Error('Le montant de la réduction doit être un entier positif sûr.');
    }
    if (discountAmount >= grossExpectedAmount) {
        throw new Error('Le montant de la réduction doit être strictement inférieur au montant brut.');
    }
    if (grossExpectedAmount > Number.MAX_SAFE_INTEGER || discountAmount > Number.MAX_SAFE_INTEGER) {
        throw new Error('Les montants dépassent la limite de sécurité Number.MAX_SAFE_INTEGER.');
    }
    const netExpectedAmount = grossExpectedAmount - discountAmount;
    if (!Number.isSafeInteger(netExpectedAmount) || netExpectedAmount <= 0) {
        throw new Error('Le montant net calculé est invalide.');
    }
    return {
        grossExpectedAmount,
        discountAmount,
        netExpectedAmount
    };
};
exports.calculateTuitionDiscountAmounts = calculateTuitionDiscountAmounts;
const getTuitionPaidField = (installment) => {
    if (installment === 'T1')
        return 'tuitionPaidT1';
    if (installment === 'T2')
        return 'tuitionPaidT2';
    return 'tuitionPaidT3';
};
exports.getTuitionPaidField = getTuitionPaidField;
const getTuitionDiscountField = (installment) => {
    if (installment === 'T1')
        return 'tuitionDiscountT1';
    if (installment === 'T2')
        return 'tuitionDiscountT2';
    return 'tuitionDiscountT3';
};
exports.getTuitionDiscountField = getTuitionDiscountField;
const makeTuitionDiscountSlotId = ({ schoolId, studentId, academicYear, installment }) => {
    if (!schoolId || typeof schoolId !== 'string' || schoolId.trim() === '') {
        throw new Error('schoolId invalide.');
    }
    if (!studentId || typeof studentId !== 'string' || studentId.trim() === '') {
        throw new Error('studentId invalide.');
    }
    if (!academicYear || typeof academicYear !== 'string' || academicYear.trim() === '') {
        throw new Error('academicYear invalide.');
    }
    if (!(0, exports.isTuitionInstallment)(installment)) {
        throw new Error('installment invalide.');
    }
    const canonical = JSON.stringify({
        schoolId: schoolId.trim(),
        studentId: studentId.trim(),
        academicYear: academicYear.trim(),
        installment
    });
    const sha256 = (0, node_crypto_1.createHash)('sha256').update(canonical).digest('hex');
    return `slot_${sha256}`;
};
exports.makeTuitionDiscountSlotId = makeTuitionDiscountSlotId;
const makeTuitionDiscountCounterId = ({ schoolId, academicYear }) => {
    if (!schoolId || typeof schoolId !== 'string' || schoolId.trim() === '') {
        throw new Error('schoolId invalide.');
    }
    if (!academicYear || typeof academicYear !== 'string' || academicYear.trim() === '') {
        throw new Error('academicYear invalide.');
    }
    const canonical = JSON.stringify({
        schoolId: schoolId.trim(),
        academicYear: academicYear.trim()
    });
    const sha256 = (0, node_crypto_1.createHash)('sha256').update(canonical).digest('hex');
    return `counter_${sha256}`;
};
exports.makeTuitionDiscountCounterId = makeTuitionDiscountCounterId;
//# sourceMappingURL=discountHelpers.js.map
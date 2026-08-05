// No types needed at runtime since it's just 'any' inside

export function sanitizeBoardViewerData<T>(data: T, collectionName: string): T {
  if (!data) return data;

  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => sanitizeBoardViewerData(item, collectionName)) as unknown as T;
  }

  // Clone the object to avoid mutating the original reference
  const sanitized = { ...data } as Record<string, unknown>;

  switch (collectionName) {
    case 'students':
      delete sanitized.allergies;
      delete sanitized.medicalConditions;
      delete sanitized.emergencyContact;
      delete sanitized.address;
      delete sanitized.parentPhone;
      delete sanitized.parentEmails;
      delete sanitized.fatherPhone;
      delete sanitized.fatherEmail;
      delete sanitized.motherPhone;
      delete sanitized.motherEmail;
      delete sanitized.guardianPhone;
      delete sanitized.guardianEmail;
      delete sanitized.departureNote;
      delete sanitized.financialBypass;
      break;

    case 'staff':
      delete sanitized.phone;
      delete sanitized.email;
      delete sanitized.dateOfBirth;
      break;

    case 'payments':
      delete sanitized.phoneNumber;
      delete sanitized.reference;
      delete sanitized.providerTransactionId;
      delete sanitized.failureReason;
      break;

    case 'grades':
      delete sanitized.comment;
      break;

    case 'attendance':
      delete sanitized.reason;
      break;

    case 'users':
      delete sanitized.mustChangePin;
      // We don't delete 'id' because React needs it for keys, but we ensure no other sensitive auth data is exposed
      break;
      
    case 'school':
      delete sanitized.adminPin;
      delete sanitized.apiKeys;
      delete sanitized.paymentSettings;
      break;
  }

  return sanitized as T;
}

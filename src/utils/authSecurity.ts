const TEMPORARY_SECRET_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*';

export const generateTemporaryAuthSecret = (length = 32): string => {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => TEMPORARY_SECRET_ALPHABET[value % TEMPORARY_SECRET_ALPHABET.length]).join('');
};

export const logAuthenticationFailure = (code?: string): void => {
  console.error('Login failed', { code: code || 'auth/unknown', category: 'authentication' });
};

export const isUserActive = (user: { active?: boolean; isActive?: boolean }): boolean => {
  return user.active === true || user.isActive === true;
};

export const getFirebaseErrorCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
};

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: { name: 'primary-auth' },
  sendPasswordResetEmail: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  deleteApp: vi.fn()
}));

vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({})),
  deleteApp: mocks.deleteApp
}));
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => mocks.auth),
  sendPasswordResetEmail: mocks.sendPasswordResetEmail,
  createUserWithEmailAndPassword: mocks.createUserWithEmailAndPassword,
  signOut: mocks.signOut
}));
vi.mock('firebase/firestore', () => ({ getFirestore: vi.fn(() => ({})) }));
vi.mock('firebase/storage', () => ({ getStorage: vi.fn(() => ({})) }));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(() => ({})) }));

describe('requestPasswordReset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendPasswordResetEmail.mockResolvedValue(undefined);
    mocks.createUserWithEmailAndPassword.mockResolvedValue({ user: { uid: 'generated-user' } });
    mocks.signOut.mockResolvedValue(undefined);
    mocks.deleteApp.mockResolvedValue(undefined);
  });

  it('appelle réellement Firebase Auth avec un email normalisé', async () => {
    const { requestPasswordReset } = await import('../../src/db/firebase');
    await requestPasswordReset('  User@Example.COM  ');

    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledOnce();
    expect(mocks.sendPasswordResetEmail).toHaveBeenCalledWith(mocks.auth, 'user@example.com');
  });

  it('crée le compte avec un secret temporaire aléatoire jamais retourné', async () => {
    const { createSecondaryUserForPasswordSetup } = await import('../../src/db/firebase');
    const user = await createSecondaryUserForPasswordSetup('new@example.com');

    expect(user).toEqual({ uid: 'generated-user' });
    expect(mocks.createUserWithEmailAndPassword).toHaveBeenCalledOnce();
    const [, email, temporarySecret] = mocks.createUserWithEmailAndPassword.mock.calls[0];
    expect(email).toBe('new@example.com');
    expect(temporarySecret).toHaveLength(32);
    expect(temporarySecret).not.toBe('123456');
    expect(mocks.signOut).toHaveBeenCalledOnce();
    expect(mocks.deleteApp).toHaveBeenCalledOnce();
  });
});

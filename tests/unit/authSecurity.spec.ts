import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { generateTemporaryAuthSecret, isUserActive, logAuthenticationFailure } from '../../src/utils/authSecurity';

describe('Auth security helpers', () => {
  it('génère un secret temporaire fort, non constant et non prévisible', () => {
    const first = generateTemporaryAuthSecret();
    const second = generateTemporaryAuthSecret();

    expect(first).toHaveLength(32);
    expect(second).toHaveLength(32);
    expect(first).not.toBe(second);
    expect(first).not.toBe('123456');
  });

  it('ne journalise que le code et une catégorie non sensible', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    logAuthenticationFailure('auth/invalid-credential');

    expect(consoleSpy).toHaveBeenCalledWith('Login failed', {
      code: 'auth/invalid-credential',
      category: 'authentication'
    });
    const serialized = JSON.stringify(consoleSpy.mock.calls);
    expect(serialized).not.toContain('user-entered-secret');
    consoleSpy.mockRestore();
  });

  it('aucun appel console frontend ne reçoit une variable sensible', () => {
    const files = ['src/context/AppContext.tsx', 'src/pages/Login.tsx', 'src/pages/UsersManagement.tsx'];
    const consoleLines = files.flatMap(file => fs.readFileSync(file, 'utf8').split(/\r?\n/)
      .filter(line => /console\.(log|error|warn|debug)/.test(line)));

    expect(consoleLines.join('\n')).not.toMatch(/\b(password|pin|token|credential)\b/i);
  });

  it('le formulaire de création ne contient aucun secret initial constant', () => {
    const source = fs.readFileSync('src/pages/UsersManagement.tsx', 'utf8');
    expect(source).not.toContain('123456');
    expect(source).not.toMatch(/Mot de passe initial/i);
  });

  it('accepte les marqueurs actifs legacy et le schéma courant', () => {
    expect(isUserActive({ active: true })).toBe(true);
    expect(isUserActive({ active: true, isActive: false })).toBe(true);
    expect(isUserActive({ isActive: true })).toBe(true);
    expect(isUserActive({ active: true, isActive: true })).toBe(true);
    expect(isUserActive({ active: false, isActive: false })).toBe(false);
  });
});

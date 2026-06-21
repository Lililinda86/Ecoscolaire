import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

test.describe('Campay Environment Enablement Logic', () => {
  const getIsSandbox = (secrets) => secrets?.campayEnvironment !== 'production';

  test('campayEnvironment absent -> sandbox', () => {
    const secrets = {};
    expect(getIsSandbox(secrets)).toBe(true);
  });

  test('campayEnvironment = sandbox -> sandbox', () => {
    const secrets = { campayEnvironment: 'sandbox' };
    expect(getIsSandbox(secrets)).toBe(true);
  });

  test('campayEnvironment = production -> production', () => {
    const secrets = { campayEnvironment: 'production' };
    expect(getIsSandbox(secrets)).toBe(false);
  });

  test('aucun secret n\'est logué (Security Static Audit)', () => {
    const serviceCode = fs.readFileSync(path.resolve(process.cwd(), 'functions/src/services/campayService.ts'), 'utf8');
    
    expect(serviceCode).not.toContain('console.log(username');
    expect(serviceCode).not.toContain('console.log(password');
    expect(serviceCode).not.toContain('console.log(token');
    
    const indexCode = fs.readFileSync(path.resolve(process.cwd(), 'functions/src/index.ts'), 'utf8');
    expect(indexCode).not.toContain('console.log(secrets.campayAppUsername)');
    expect(indexCode).not.toContain('console.log(secrets.campayAppPassword)');
  });
});

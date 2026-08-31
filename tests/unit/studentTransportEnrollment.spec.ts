import { describe, expect, it } from 'vitest';
import {
  getTransportEnrollmentStatusLabel,
  isSecondaryClass,
  isValidTransportZonePk,
  resolveTransportEnrollmentStatus
} from '../../src/services/studentTransportEnrollment';

describe('student transport enrollment state', () => {
  it('keeps the current PK14-PK42 validation when a zone is provided', () => {
    expect(isValidTransportZonePk(14)).toBe(true);
    expect(isValidTransportZonePk(42)).toBe(true);
    expect(isValidTransportZonePk(13)).toBe(false);
    expect(isValidTransportZonePk(42.5)).toBe(false);
    expect(isValidTransportZonePk(43)).toBe(false);
  });

  it('marks a configured primary transport enrollment active', () => {
    expect(resolveTransportEnrollmentStatus({
      usesTransport: true,
      transportZonePk: 35,
      classData: { cycle: 'primary' }
    })).toBe('active');
  });

  it('keeps a primary student saveable while configuration is incomplete', () => {
    const status = resolveTransportEnrollmentStatus({
      usesTransport: true,
      transportZonePk: undefined,
      classData: { cycle: 'primary' }
    });
    expect(status).toBe('needs_configuration');
    expect(getTransportEnrollmentStatusLabel(status)).toBe('À compléter');
  });

  it('does not require a PK for the structured secondary cycle', () => {
    expect(isSecondaryClass({ catalogLevelId: 'fr-secondary-6e' })).toBe(true);
    expect(resolveTransportEnrollmentStatus({
      usesTransport: true,
      transportZonePk: undefined,
      classData: { cycle: 'secondary' }
    })).toBe('active');
  });

  it('keeps private pickup information inactive rather than deleting it on deactivation', () => {
    expect(resolveTransportEnrollmentStatus({
      usesTransport: false,
      transportZonePk: 28,
      classData: { cycle: 'primary' }
    })).toBe('none');
  });
});

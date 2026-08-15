import { beforeEach, describe, expect, it, vi } from 'vitest';
import { httpsCallable } from 'firebase/functions';
import { createStudentSecure } from '../../src/services/studentCreationFunctions';

vi.mock('../../src/db/firebase', () => ({ functions: { name: 'functions-test' } }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

const payload = {
  studentId: 'student-1',
  studentData: {}, privateData: {}, financeData: {}, parentPrivateData: {}, parentFinanceData: {}
};

beforeEach(() => vi.clearAllMocks());

describe('createStudentSecure frontend client', () => {
  it('calls only the dedicated secure callable', async () => {
    vi.mocked(httpsCallable).mockReturnValue(vi.fn().mockResolvedValue({ data: { studentId: 'student-1', created: true } }) as never);
    await expect(createStudentSecure(payload)).resolves.toMatchObject({ studentId: 'student-1', created: true });
    expect(httpsCallable).toHaveBeenCalledWith({ name: 'functions-test' }, 'createStudentSecure');
  });

  it('maps a server business code without exposing internal details', async () => {
    vi.mocked(httpsCallable).mockReturnValue(vi.fn().mockRejectedValue({
      code: 'functions/resource-exhausted',
      message: 'internal detail',
      details: { businessCode: 'STUDENT_QUOTA_REACHED' }
    }) as never);
    await expect(createStudentSecure(payload)).rejects.toThrow('STUDENT_QUOTA_REACHED');
  });
});

import { describe, expect, it } from 'vitest';
import { deduplicateAttendanceRecords, getAfricaDoualaDateKey, normalizeAttendanceStatus } from '../../src/utils/attendanceRecords';

describe('attendance compatibility helpers', () => {
  it('uses the Africa/Douala school calendar date', () => {
    expect(getAfricaDoualaDateKey(new Date('2026-08-20T23:30:00.000Z'))).toBe('2026-08-21');
  });

  it('prefers a corrected canonical row over duplicate legacy rows', () => {
    const rows = deduplicateAttendanceRecords([
      { id: 'legacy-a', schoolId: 'school-a', studentId: 'student-a', date: '2026-08-21', present: true },
      { id: 'legacy-b', schoolId: 'school-a', studentId: 'student-a', date: '2026-08-21T00:00:00Z', present: false },
      { id: 'att-canonical', schoolId: 'school-a', academicYearId: 'year-a', studentId: 'student-a', date: '2026-08-21', present: false, status: 'left_early', canonicalAttendance: true, version: 3 },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('att-canonical');
    expect(normalizeAttendanceStatus(rows[0])).toBe('left_early');
  });

  it('does not merge tenants, students, or different calendar dates', () => {
    const rows = deduplicateAttendanceRecords([
      { id: 'a', schoolId: 'school-a', studentId: 'student-a', date: '2026-08-21', present: true },
      { id: 'b', schoolId: 'school-b', studentId: 'student-a', date: '2026-08-21', present: true },
      { id: 'c', schoolId: 'school-a', studentId: 'student-b', date: '2026-08-21', present: true },
      { id: 'd', schoolId: 'school-a', studentId: 'student-a', date: '2027-08-21', present: true },
    ]);
    expect(rows).toHaveLength(4);
  });
});

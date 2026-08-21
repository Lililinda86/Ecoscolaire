import type { Attendance, AttendanceStatus } from '../types';

export const ATTENDANCE_STATUSES: AttendanceStatus[] = ['present', 'absent', 'late', 'left_early'];

export const getAfricaDoualaDateKey = (date = new Date()): string => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Douala',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

export const normalizeAttendanceDate = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return /^\d{4}-\d{2}-\d{2}/.test(trimmed) ? trimmed.slice(0, 10) : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return getAfricaDoualaDateKey(value);
  if (value && typeof value === 'object') {
    const timestamp = value as { toDate?: () => Date; seconds?: number };
    if (typeof timestamp.toDate === 'function') {
      try {
        return getAfricaDoualaDateKey(timestamp.toDate());
      } catch {
        return null;
      }
    }
    if (typeof timestamp.seconds === 'number') {
      return getAfricaDoualaDateKey(new Date(timestamp.seconds * 1000));
    }
  }
  return null;
};

export const normalizeAttendanceStatus = (
  record: Pick<Attendance, 'status' | 'present'>,
): AttendanceStatus | null => {
  if (record.status && ATTENDANCE_STATUSES.includes(record.status)) return record.status;
  if (record.present === true) return 'present';
  if (record.present === false) return 'absent';
  return null;
};

const logicalKey = (record: Attendance): string | null => {
  const date = normalizeAttendanceDate(record.date);
  if (!date || !record.studentId) return null;
  return `${record.schoolId || ''}\u001f${date}\u001f${record.studentId}`;
};

const timestampMillis = (value: unknown): number => {
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object') {
    const timestamp = value as { toMillis?: () => number; seconds?: number };
    if (typeof timestamp.toMillis === 'function') {
      try { return timestamp.toMillis(); } catch { return 0; }
    }
    if (typeof timestamp.seconds === 'number') return timestamp.seconds * 1000;
  }
  return 0;
};

const preference = (record: Attendance): [number, number, number, string] => [
  record.canonicalAttendance === true ? 1 : 0,
  Number(record.version) || 0,
  timestampMillis(record.correctedAt || record.updatedAt || record.createdAt),
  record.id || '',
];

const isPreferred = (candidate: Attendance, current: Attendance): boolean => {
  const left = preference(candidate);
  const right = preference(current);
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] === right[index]) continue;
    return left[index] > right[index];
  }
  return false;
};

export const deduplicateAttendanceRecords = (records: Attendance[]): Attendance[] => {
  const deduplicated = new Map<string, Attendance>();
  const unkeyed: Attendance[] = [];
  records.forEach(record => {
    const key = logicalKey(record);
    if (!key) {
      unkeyed.push(record);
      return;
    }
    const current = deduplicated.get(key);
    if (!current || isPreferred(record, current)) deduplicated.set(key, record);
  });
  return [...deduplicated.values(), ...unkeyed];
};

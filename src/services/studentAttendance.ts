import { httpsCallable } from 'firebase/functions';
import { functions } from '../db/firebase';
import type { Attendance, AttendanceStatus } from '../types';

type RecordAttendanceResponse = {
  success: true;
  changed: boolean;
  corrected: boolean;
  attendance: Attendance;
};

const callable = httpsCallable<{
  studentId: string;
  date: string;
  status: AttendanceStatus;
  note?: string;
}, RecordAttendanceResponse>(functions, 'recordStudentAttendance');

export const recordStudentAttendance = async (input: {
  studentId: string;
  date: string;
  status: AttendanceStatus;
  note?: string;
}): Promise<RecordAttendanceResponse> => {
  const result = await callable(input);
  return result.data;
};

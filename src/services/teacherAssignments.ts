import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../db/firebase';

export interface TeacherAssignment {
  id: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  teacherStaffId: string;
  assignmentRole: 'primary';
  sourceProgramId: string;
  sourcePublishedRevisionId: string;
  sourceClassSubjectId: string;
  isActive: boolean;
  startedAt: string;
  endedAt?: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  deactivatedAt?: string;
  deactivatedBy?: string;
  deactivationReason?: string;
  teacherUserId?: string;
}

export interface TeacherAssignmentSlot {
  id: string;
  assignmentId: string;
  schoolId: string;
  academicYearId: string;
  classId: string;
  subjectId: string;
  teacherStaffId: string;
  assignmentRole: 'primary';
  sourceProgramId: string;
  sourcePublishedRevisionId: string;
  sourceClassSubjectId: string;
  isActive: boolean;
  updatedAt: string;
  updatedBy: string;
  teacherUserId?: string;
}

export interface StaffUserLinkPointer {
  id: string;
  linkId: string;
  schoolId: string;
  staffId: string;
  userId: string;
  isActive: boolean;
}

export async function getClassTeacherAssignmentSlots(
  schoolId: string,
  academicYearId: string,
  classId: string
): Promise<TeacherAssignmentSlot[]> {
  try {
    const collRef = collection(db, 'teacherAssignmentSlots');
    const q = query(
      collRef,
      where('schoolId', '==', schoolId),
      where('academicYearId', '==', academicYearId),
      where('classId', '==', classId)
    );

    const snap = await getDocs(q);
    const list: TeacherAssignmentSlot[] = [];
    snap.forEach((d) => {
      list.push(d.data() as TeacherAssignmentSlot);
    });
    return list;
  } catch (error: unknown) {
    console.error('Error fetching teacher assignment slots:', error);
    throw error;
  }
}

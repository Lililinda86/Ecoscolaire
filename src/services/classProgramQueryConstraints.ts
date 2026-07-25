export function buildClassProgramQueryConstraints(
  cleanSchoolId: string,
  cleanAcademicYearId: string,
  cleanClassId: string
) {
  return {
    collectionName: 'classPrograms',
    filters: [
      { field: 'schoolId', op: '==', val: cleanSchoolId },
      { field: 'academicYearId', op: '==', val: cleanAcademicYearId },
      { field: 'classId', op: '==', val: cleanClassId }
    ],
    limitVal: 2
  };
}

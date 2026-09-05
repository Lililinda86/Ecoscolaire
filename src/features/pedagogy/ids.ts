const safe = (value: string): string => value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');

export const pedagogyAdoptionId = (schoolId: string, academicYearId: string, catalogLevelId: string): string =>
  `${safe(schoolId)}__${safe(academicYearId)}__${safe(catalogLevelId)}`;

export const pedagogyPlanId = (schoolId: string, academicYearId: string, classId: string, weekStartDate: string): string =>
  `${safe(schoolId)}__${safe(academicYearId)}__${safe(classId)}__${weekStartDate}`;

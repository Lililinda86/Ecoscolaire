import fs from 'fs';

const args = process.argv.slice(2);
const inputArg = args.findIndex(a => a === '--input');
if (inputArg === -1 || !args[inputArg + 1]) {
  console.error("Erreur: L'option --input <fichier.json> est requise.");
  process.exit(1);
}

const exportFilePath = args[inputArg + 1];

let data;
try {
  const raw = fs.readFileSync(exportFilePath, 'utf8');
  data = JSON.parse(raw);
} catch (e) {
  console.error('Erreur lecture export:', e.message);
  process.exit(1);
}

const report = {
  total: data.length,
  legacyStructureComplete: 0,
  missingSchoolId: 0,
  missingMaxScore: 0,
  missingStudentId: 0,
  missingSubjectId: 0,
  missingAcademicYearId: 0,
  missingPeriodId: 0,
  missingEvaluationId: 0,
  missingClassId: 0,
  missingClassSubjectId: 0,
  missingTeacherId: 0,
  potentialDuplicates: 0,
  datesFound: new Set(),
  migratable: 0,
  nonMigratable: 0
};

const idSet = new Set();

for (const legacy of data) {
  let isLegacyComplete = true;
  if (!legacy.schoolId) { report.missingSchoolId++; isLegacyComplete = false; }
  if (legacy.maxScore === undefined) { report.missingMaxScore++; isLegacyComplete = false; }
  if (!legacy.studentId) { report.missingStudentId++; isLegacyComplete = false; }
  if (!legacy.subjectId) { report.missingSubjectId++; isLegacyComplete = false; }
  
  let isFullyMigratable = isLegacyComplete;
  if (!legacy.academicYearId) { report.missingAcademicYearId++; isFullyMigratable = false; }
  if (!legacy.periodId) { report.missingPeriodId++; isFullyMigratable = false; }
  if (!legacy.evaluationId) { report.missingEvaluationId++; isFullyMigratable = false; }
  if (!legacy.classId) { report.missingClassId++; isFullyMigratable = false; }
  if (!legacy.classSubjectId) { report.missingClassSubjectId++; isFullyMigratable = false; }
  if (!legacy.teacherId) { report.missingTeacherId++; isFullyMigratable = false; }

  if (isLegacyComplete) {
    report.legacyStructureComplete++;
  }

  if (isFullyMigratable) {
    report.migratable++;
  } else {
    report.nonMigratable++;
  }

  if (legacy.date) report.datesFound.add(legacy.date);

  const dupKey = legacy.studentId + '_' + legacy.subjectId + '_' + legacy.date;
  if (idSet.has(dupKey)) {
    report.potentialDuplicates++;
  }
  idSet.add(dupKey);
}

console.log(JSON.stringify({
  total: report.total,
  legacyStructureComplete: report.legacyStructureComplete,
  missingSchoolId: report.missingSchoolId,
  missingMaxScore: report.missingMaxScore,
  missingStudentId: report.missingStudentId,
  missingSubjectId: report.missingSubjectId,
  missingAcademicYearId: report.missingAcademicYearId,
  missingPeriodId: report.missingPeriodId,
  missingEvaluationId: report.missingEvaluationId,
  missingClassId: report.missingClassId,
  missingClassSubjectId: report.missingClassSubjectId,
  missingTeacherId: report.missingTeacherId,
  potentialDuplicates: report.potentialDuplicates,
  migratable: report.migratable,
  nonMigratable: report.nonMigratable
}, null, 2));

process.exit(0);

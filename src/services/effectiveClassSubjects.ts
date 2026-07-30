import type { ClassSection as Class, ClassProgram as ClassProgramDraft, ClassSubject, Subject } from '../types';

export interface GetEffectiveClassSubjectsParams {
  classId: string;
  classes: Class[];
  classPrograms: ClassProgramDraft[];
  classSubjects: ClassSubject[];
  subjects: Subject[];
  activeAcademicYearId: string;
}

export interface EffectiveClassSubject {
  classSubjectId: string;
  subjectId: string;
  name: string;
  code: string;
  coefficient: number;
  weeklyHours: number;
  isRequired: boolean;
  displayOrder: number;
}

export interface EffectiveClassSubjectsResult {
  status: 'no_program' | 'empty' | 'success';
  subjects: EffectiveClassSubject[];
}

export function getEffectiveClassSubjects({
  classId,
  classes,
  classPrograms,
  classSubjects,
  subjects,
  activeAcademicYearId
}: GetEffectiveClassSubjectsParams): EffectiveClassSubjectsResult {
  // 1 & 2. Récupérer la classe réelle
  const studentClass = classes.find(c => c.id === classId);
  if (!studentClass) return { status: 'no_program', subjects: [] };

  // 3. Sélectionner uniquement le programme publié de cette classe
  const program = classPrograms.find(
    p =>
      p.schoolId === studentClass.schoolId &&
      p.classId === studentClass.id &&
      p.academicYearId === activeAcademicYearId &&
      p.status === 'published' &&
      p.publishedRevisionId != null
  );

  if (!program) return { status: 'no_program', subjects: [] };

  // 4 & 5. Filtrer les classSubjects par revisionId publié et actifs
  const effectiveSubjects = classSubjects
    .filter(cs => 
      cs.schoolId === studentClass.schoolId &&
      cs.classId === studentClass.id &&
      cs.revisionId === program.publishedRevisionId && 
      cs.isActive
    )
    .map(cs => {
      const baseSubject = subjects.find(s => s.id === cs.subjectId && s.schoolId === studentClass.schoolId);
      
      // 6. Conserver les champs stricts
      return {
        classSubjectId: cs.id as string,
        subjectId: cs.subjectId,
        name: baseSubject?.name || 'Inconnu',
        code: cs.subjectCodeSnapshot || baseSubject?.code || 'INC',
        coefficient: cs.coefficient as number, // "Ne pas inventer un coefficient manquant" -> la spec dit qu'on doit avoir le vrai coeff. Si undefined, ça restera undefined, ce qui fera échouer les tests/calculs si mal géré
        weeklyHours: cs.weeklyHours || 0,
        isRequired: cs.isRequired ?? true,
        displayOrder: cs.displayOrder || 0
      };
    });

  // 7. Trier par l'ordre du programme
  effectiveSubjects.sort((a, b) => a.displayOrder - b.displayOrder);

  if (effectiveSubjects.length === 0) return { status: 'empty', subjects: [] };

  return { status: 'success', subjects: effectiveSubjects };
}


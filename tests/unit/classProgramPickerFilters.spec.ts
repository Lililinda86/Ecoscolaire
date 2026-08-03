import { test, expect } from '@playwright/test';
import type { Subject, ClassSubject } from '../../src/types';

import { filterAvailableSubjectsForClass } from '../../src/pages/subjects/programs/editor/classProgramSubjectFilters';

test.describe('ClassProgramSubjectPicker Recommendation Filter Logic tests', () => {
  const schoolId = 'emu-school';
  const francophoneClassSection = 'francophone';
  const anglophoneClassSection = 'anglophone';
  const primaryCycle = 'primaire';
  const nurseryCycle = 'maternelle';

  const mathFrancophone: Subject = {
    id: 'math-fr',
    schoolId,
    name: 'Mathématiques',
    code: 'MATH',
    section: 'francophone',
    cycles: ['primary'],
    isActive: true
  };

  const englishAnglophone: Subject = {
    id: 'eng-en',
    schoolId,
    name: 'English Language',
    code: 'ENG',
    section: 'anglophone',
    cycles: ['primary'],
    isActive: true
  };

  const bilingualCommon: Subject = {
    id: 'bil-common',
    schoolId,
    name: 'Bilinguisme',
    code: 'BIL',
    section: 'all',
    cycles: ['primary'],
    isActive: true
  };

  const nurseryMath: Subject = {
    id: 'nursery-math',
    schoolId,
    name: 'Nursery Math',
    code: 'NMATH',
    section: 'anglophone',
    cycles: ['nursery'],
    isActive: true
  };

  const inactiveSubject: Subject = {
    id: 'inactive-sub',
    schoolId,
    name: 'Inactive',
    code: 'INAC',
    isActive: false
  };

  const legacySubject: Subject = {
    id: 'legacy-sub',
    name: 'Legacy Subject',
    isActive: true
  };

  const catalog = [mathFrancophone, englishAnglophone, bilingualCommon, nurseryMath, inactiveSubject, legacySubject];

  test('1. classe francophone + matière francophone -> visible', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: true,
      searchTerm: ''
    });
    expect(res.some(s => s.id === 'math-fr')).toBe(true);
  });

  test('2. classe francophone + matière exclusivement anglophone -> masquée', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: true,
      searchTerm: ''
    });
    expect(res.some(s => s.id === 'eng-en')).toBe(false);
  });

  test('3. classe anglophone + matière anglophone -> visible', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [],
      schoolId,
      classSection: anglophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: true,
      searchTerm: ''
    });
    expect(res.some(s => s.id === 'eng-en')).toBe(true);
  });

  test('4. matière commune aux deux sections -> visible', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: true,
      searchTerm: ''
    });
    expect(res.some(s => s.id === 'bil-common')).toBe(true);
  });

  test('5. cycle correspondant -> visible', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [],
      schoolId,
      classSection: anglophoneClassSection,
      classCycle: nurseryCycle,
      isFiltered: true,
      searchTerm: ''
    });
    expect(res.some(s => s.id === 'nursery-math')).toBe(true);
  });

  test('6. cycle différent -> masqué', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [],
      schoolId,
      classSection: anglophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: true,
      searchTerm: ''
    });
    expect(res.some(s => s.id === 'nursery-math')).toBe(false);
  });

  test('7. matière couvrant plusieurs cycles -> visible', () => {
    const multiCycleSubject: Subject = {
      id: 'multi-cycle',
      schoolId,
      name: 'Multi Cycle',
      section: 'all',
      cycles: ['nursery', 'primary'],
      isActive: true
    };
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: [multiCycleSubject],
      activeSubjects: [],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: true,
      searchTerm: ''
    });
    expect(res.some(s => s.id === 'multi-cycle')).toBe(true);
  });

  test('8. matière inactive -> masquée', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: true,
      searchTerm: ''
    });
    expect(res.some(s => s.id === 'inactive-sub')).toBe(false);
  });

  test('9. matière déjà ajoutée -> masquée', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [{ subjectId: 'math-fr', isActive: true } as ClassSubject],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: true,
      searchTerm: ''
    });
    expect(res.some(s => s.id === 'math-fr')).toBe(false);
  });

  test('10. mode afficher toutes -> autre section visible', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: false, // OFF
      searchTerm: ''
    });
    expect(res.some(s => s.id === 'eng-en')).toBe(true);
  });

  test('11. mode afficher toutes -> matière inactive toujours masquée', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: false,
      searchTerm: ''
    });
    expect(res.some(s => s.id === 'inactive-sub')).toBe(false);
  });

  test('12. recherche par nom', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: false,
      searchTerm: 'Mathématiques'
    });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('math-fr');
  });

  test('13. recherche par code', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: false,
      searchTerm: 'ENG'
    });
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('eng-en');
  });

  test('14. matière legacy classifiable', () => {
    const classifiableLegacy: Subject = {
      id: 'legacy-classifiable',
      name: 'Legacy Math',
      section: 'francophone',
      cycles: ['primary'],
      isActive: true
    };
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: [classifiableLegacy],
      activeSubjects: [],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: true,
      searchTerm: ''
    });
    expect(res.some(s => s.id === 'legacy-classifiable')).toBe(true);
  });

  test('15. matière legacy non classifiable masquée', () => {
    const unclassifiableLegacy: Subject = {
      id: 'legacy-unclassifiable',
      name: 'Old Course',
      isActive: true
    };
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: [unclassifiableLegacy],
      activeSubjects: [],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: true,
      searchTerm: ''
    });
    expect(res.some(s => s.id === 'legacy-unclassifiable')).toBe(false);
  });

  test('16. matière legacy non classifiable visible en mode global', () => {
    const legacySub: Subject = {
      id: 'unclassifiable-legacy',
      name: 'Unclassifiable Legacy',
      isActive: true
    };
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: [legacySub],
      activeSubjects: [],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: false, // global mode
      searchTerm: ''
    });
    expect(res.some(s => s.id === 'unclassifiable-legacy')).toBe(true);
  });

  test('17. aucune matière recommandée', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [],
      schoolId,
      classSection: 'unknown',
      classCycle: 'unknown',
      isFiltered: true,
      searchTerm: ''
    });
    expect(res.length).toBe(0);
  });

  test('18. toutes les matières déjà ajoutées', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [
        { subjectId: 'math-fr', isActive: true },
        { subjectId: 'eng-en', isActive: true },
        { subjectId: 'bil-common', isActive: true },
        { subjectId: 'nursery-math', isActive: true },
        { subjectId: 'legacy-sub', isActive: true }
      ] as ClassSubject[],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: false,
      searchTerm: ''
    });
    expect(res.length).toBe(0);
  });

  test('19. recherche sans résultat', () => {
    const res = filterAvailableSubjectsForClass({
      catalogSubjects: catalog,
      activeSubjects: [],
      schoolId,
      classSection: francophoneClassSection,
      classCycle: primaryCycle,
      isFiltered: false,
      searchTerm: 'non-existing-subject-name'
    });
    expect(res.length).toBe(0);
  });
});

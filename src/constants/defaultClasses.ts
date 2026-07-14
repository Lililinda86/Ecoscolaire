export interface DefaultClass {
  id: string;
  name: string;
  section: 'francophone' | 'anglophone';
  cycle: 'preschool' | 'nursery' | 'primary' | 'secondary';
  educationType: 'general' | 'technical';
  levelOrder: number;
  isDefault: true;
  isActive: boolean;
}

export const DEFAULT_CLASS_LEVELS: DefaultClass[] = [
  // SECTION FRANCOPHONE - MATERNELLE (Preschool/Nursery)
  { id: 'fr-pre-maternelle', name: 'Pré-maternelle', section: 'francophone', cycle: 'nursery', educationType: 'general', levelOrder: 1, isDefault: true, isActive: true },
  { id: 'fr-maternelle-1', name: 'Maternelle 1', section: 'francophone', cycle: 'nursery', educationType: 'general', levelOrder: 2, isDefault: true, isActive: true },
  { id: 'fr-maternelle-2', name: 'Maternelle 2', section: 'francophone', cycle: 'nursery', educationType: 'general', levelOrder: 3, isDefault: true, isActive: true },
  { id: 'fr-maternelle-3', name: 'Maternelle 3', section: 'francophone', cycle: 'nursery', educationType: 'general', levelOrder: 4, isDefault: true, isActive: true },

  // SECTION FRANCOPHONE - PRIMAIRE
  { id: 'fr-sil', name: 'SIL', section: 'francophone', cycle: 'primary', educationType: 'general', levelOrder: 5, isDefault: true, isActive: true },
  { id: 'fr-cp', name: 'CP', section: 'francophone', cycle: 'primary', educationType: 'general', levelOrder: 6, isDefault: true, isActive: true },
  { id: 'fr-ce1', name: 'CE1', section: 'francophone', cycle: 'primary', educationType: 'general', levelOrder: 7, isDefault: true, isActive: true },
  { id: 'fr-ce2', name: 'CE2', section: 'francophone', cycle: 'primary', educationType: 'general', levelOrder: 8, isDefault: true, isActive: true },
  { id: 'fr-cm1', name: 'CM1', section: 'francophone', cycle: 'primary', educationType: 'general', levelOrder: 9, isDefault: true, isActive: true },
  { id: 'fr-cm2', name: 'CM2', section: 'francophone', cycle: 'primary', educationType: 'general', levelOrder: 10, isDefault: true, isActive: true },

  // SECTION FRANCOPHONE - SECONDAIRE GENERAL
  { id: 'fr-6e', name: '6ème', section: 'francophone', cycle: 'secondary', educationType: 'general', levelOrder: 11, isDefault: true, isActive: true },
  { id: 'fr-5e', name: '5ème', section: 'francophone', cycle: 'secondary', educationType: 'general', levelOrder: 12, isDefault: true, isActive: true },
  { id: 'fr-4e', name: '4ème', section: 'francophone', cycle: 'secondary', educationType: 'general', levelOrder: 13, isDefault: true, isActive: true },
  { id: 'fr-3e', name: '3ème', section: 'francophone', cycle: 'secondary', educationType: 'general', levelOrder: 14, isDefault: true, isActive: true },
  { id: 'fr-2nde', name: 'Seconde', section: 'francophone', cycle: 'secondary', educationType: 'general', levelOrder: 15, isDefault: true, isActive: false },
  { id: 'fr-1ere', name: 'Première', section: 'francophone', cycle: 'secondary', educationType: 'general', levelOrder: 16, isDefault: true, isActive: false },
  { id: 'fr-tle', name: 'Terminale', section: 'francophone', cycle: 'secondary', educationType: 'general', levelOrder: 17, isDefault: true, isActive: false },

  // SECTION FRANCOPHONE - SECONDAIRE TECHNIQUE
  { id: 'fr-6e-tech', name: '6ème technique', section: 'francophone', cycle: 'secondary', educationType: 'technical', levelOrder: 18, isDefault: true, isActive: false },
  { id: 'fr-5e-tech', name: '5ème technique', section: 'francophone', cycle: 'secondary', educationType: 'technical', levelOrder: 19, isDefault: true, isActive: false },
  { id: 'fr-4e-tech', name: '4ème technique', section: 'francophone', cycle: 'secondary', educationType: 'technical', levelOrder: 20, isDefault: true, isActive: false },
  { id: 'fr-3e-tech', name: '3ème technique', section: 'francophone', cycle: 'secondary', educationType: 'technical', levelOrder: 21, isDefault: true, isActive: false },
  { id: 'fr-2nde-tech', name: 'Seconde technique', section: 'francophone', cycle: 'secondary', educationType: 'technical', levelOrder: 22, isDefault: true, isActive: false },
  { id: 'fr-1ere-tech', name: 'Première technique', section: 'francophone', cycle: 'secondary', educationType: 'technical', levelOrder: 23, isDefault: true, isActive: false },
  { id: 'fr-tle-tech', name: 'Terminale technique', section: 'francophone', cycle: 'secondary', educationType: 'technical', levelOrder: 24, isDefault: true, isActive: false },

  // SECTION ANGLOPHONE - NURSERY
  { id: 'en-pre-nursery', name: 'Pre-Nursery', section: 'anglophone', cycle: 'nursery', educationType: 'general', levelOrder: 25, isDefault: true, isActive: true },
  { id: 'en-nursery-1', name: 'Nursery 1', section: 'anglophone', cycle: 'nursery', educationType: 'general', levelOrder: 26, isDefault: true, isActive: true },
  { id: 'en-nursery-2', name: 'Nursery 2', section: 'anglophone', cycle: 'nursery', educationType: 'general', levelOrder: 27, isDefault: true, isActive: true },
  { id: 'en-nursery-3', name: 'Nursery 3', section: 'anglophone', cycle: 'nursery', educationType: 'general', levelOrder: 28, isDefault: true, isActive: true },

  // SECTION ANGLOPHONE - PRIMARY
  { id: 'en-class-1', name: 'Class 1', section: 'anglophone', cycle: 'primary', educationType: 'general', levelOrder: 29, isDefault: true, isActive: true },
  { id: 'en-class-2', name: 'Class 2', section: 'anglophone', cycle: 'primary', educationType: 'general', levelOrder: 30, isDefault: true, isActive: true },
  { id: 'en-class-3', name: 'Class 3', section: 'anglophone', cycle: 'primary', educationType: 'general', levelOrder: 31, isDefault: true, isActive: true },
  { id: 'en-class-4', name: 'Class 4', section: 'anglophone', cycle: 'primary', educationType: 'general', levelOrder: 32, isDefault: true, isActive: true },
  { id: 'en-class-5', name: 'Class 5', section: 'anglophone', cycle: 'primary', educationType: 'general', levelOrder: 33, isDefault: true, isActive: true },
  { id: 'en-class-6', name: 'Class 6', section: 'anglophone', cycle: 'primary', educationType: 'general', levelOrder: 34, isDefault: true, isActive: true },

  // SECTION ANGLOPHONE - SECONDARY GENERAL
  { id: 'en-form-1', name: 'Form 1', section: 'anglophone', cycle: 'secondary', educationType: 'general', levelOrder: 35, isDefault: true, isActive: true },
  { id: 'en-form-2', name: 'Form 2', section: 'anglophone', cycle: 'secondary', educationType: 'general', levelOrder: 36, isDefault: true, isActive: true },
  { id: 'en-form-3', name: 'Form 3', section: 'anglophone', cycle: 'secondary', educationType: 'general', levelOrder: 37, isDefault: true, isActive: false },
  { id: 'en-form-4', name: 'Form 4', section: 'anglophone', cycle: 'secondary', educationType: 'general', levelOrder: 38, isDefault: true, isActive: false },
  { id: 'en-form-5', name: 'Form 5', section: 'anglophone', cycle: 'secondary', educationType: 'general', levelOrder: 39, isDefault: true, isActive: false },
  { id: 'en-lower-sixth', name: 'Lower Sixth', section: 'anglophone', cycle: 'secondary', educationType: 'general', levelOrder: 40, isDefault: true, isActive: false },
  { id: 'en-upper-sixth', name: 'Upper Sixth', section: 'anglophone', cycle: 'secondary', educationType: 'general', levelOrder: 41, isDefault: true, isActive: false },

  // SECTION ANGLOPHONE - SECONDARY TECHNICAL
  { id: 'en-tech-form-1', name: 'Technical Form 1', section: 'anglophone', cycle: 'secondary', educationType: 'technical', levelOrder: 42, isDefault: true, isActive: false },
  { id: 'en-tech-form-2', name: 'Technical Form 2', section: 'anglophone', cycle: 'secondary', educationType: 'technical', levelOrder: 43, isDefault: true, isActive: false },
  { id: 'en-tech-form-3', name: 'Technical Form 3', section: 'anglophone', cycle: 'secondary', educationType: 'technical', levelOrder: 44, isDefault: true, isActive: false },
  { id: 'en-tech-form-4', name: 'Technical Form 4', section: 'anglophone', cycle: 'secondary', educationType: 'technical', levelOrder: 45, isDefault: true, isActive: false },
  { id: 'en-tech-form-5', name: 'Technical Form 5', section: 'anglophone', cycle: 'secondary', educationType: 'technical', levelOrder: 46, isDefault: true, isActive: false },
  { id: 'en-lower-sixth-tech', name: 'Lower Sixth Technical', section: 'anglophone', cycle: 'secondary', educationType: 'technical', levelOrder: 47, isDefault: true, isActive: false },
  { id: 'en-upper-sixth-tech', name: 'Upper Sixth Technical', section: 'anglophone', cycle: 'secondary', educationType: 'technical', levelOrder: 48, isDefault: true, isActive: false }
];

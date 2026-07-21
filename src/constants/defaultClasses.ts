export interface DefaultClass {
  id: string;
  catalogLevelId: string;
  name: string;
  section: 'francophone' | 'anglophone';
  cycle: 'preschool' | 'nursery' | 'primary' | 'secondary';
  educationType: 'general' | 'technical';
  levelOrder: number;
  isDefault: true;
  isActive: boolean;
}

export const DEFAULT_CLASS_LEVELS: DefaultClass[] = [
  // A. SECTION FRANCOPHONE - MATERNELLE (4 niveaux)
  { id: 'fr-preschool-pre', catalogLevelId: 'fr-preschool-pre', name: 'Pré-maternelle', section: 'francophone', cycle: 'nursery', educationType: 'general', levelOrder: 1, isDefault: true, isActive: true },
  { id: 'fr-preschool-ps', catalogLevelId: 'fr-preschool-ps', name: 'Petite Section', section: 'francophone', cycle: 'nursery', educationType: 'general', levelOrder: 2, isDefault: true, isActive: true },
  { id: 'fr-preschool-ms', catalogLevelId: 'fr-preschool-ms', name: 'Moyenne Section', section: 'francophone', cycle: 'nursery', educationType: 'general', levelOrder: 3, isDefault: true, isActive: true },
  { id: 'fr-preschool-gs', catalogLevelId: 'fr-preschool-gs', name: 'Grande Section', section: 'francophone', cycle: 'nursery', educationType: 'general', levelOrder: 4, isDefault: true, isActive: true },

  // A. SECTION FRANCOPHONE - PRIMAIRE (6 niveaux)
  { id: 'fr-primary-sil', catalogLevelId: 'fr-primary-sil', name: 'SIL', section: 'francophone', cycle: 'primary', educationType: 'general', levelOrder: 5, isDefault: true, isActive: true },
  { id: 'fr-primary-cp', catalogLevelId: 'fr-primary-cp', name: 'CP', section: 'francophone', cycle: 'primary', educationType: 'general', levelOrder: 6, isDefault: true, isActive: true },
  { id: 'fr-primary-ce1', catalogLevelId: 'fr-primary-ce1', name: 'CE1', section: 'francophone', cycle: 'primary', educationType: 'general', levelOrder: 7, isDefault: true, isActive: true },
  { id: 'fr-primary-ce2', catalogLevelId: 'fr-primary-ce2', name: 'CE2', section: 'francophone', cycle: 'primary', educationType: 'general', levelOrder: 8, isDefault: true, isActive: true },
  { id: 'fr-primary-cm1', catalogLevelId: 'fr-primary-cm1', name: 'CM1', section: 'francophone', cycle: 'primary', educationType: 'general', levelOrder: 9, isDefault: true, isActive: true },
  { id: 'fr-primary-cm2', catalogLevelId: 'fr-primary-cm2', name: 'CM2', section: 'francophone', cycle: 'primary', educationType: 'general', levelOrder: 10, isDefault: true, isActive: true },

  // A. SECTION FRANCOPHONE - SECONDAIRE GENERAL (7 niveaux)
  { id: 'fr-secondary-6e', catalogLevelId: 'fr-secondary-6e', name: '6e', section: 'francophone', cycle: 'secondary', educationType: 'general', levelOrder: 11, isDefault: true, isActive: true },
  { id: 'fr-secondary-5e', catalogLevelId: 'fr-secondary-5e', name: '5e', section: 'francophone', cycle: 'secondary', educationType: 'general', levelOrder: 12, isDefault: true, isActive: true },
  { id: 'fr-secondary-4e', catalogLevelId: 'fr-secondary-4e', name: '4e', section: 'francophone', cycle: 'secondary', educationType: 'general', levelOrder: 13, isDefault: true, isActive: true },
  { id: 'fr-secondary-3e', catalogLevelId: 'fr-secondary-3e', name: '3e', section: 'francophone', cycle: 'secondary', educationType: 'general', levelOrder: 14, isDefault: true, isActive: true },
  { id: 'fr-secondary-2nde', catalogLevelId: 'fr-secondary-2nde', name: '2nde', section: 'francophone', cycle: 'secondary', educationType: 'general', levelOrder: 15, isDefault: true, isActive: true },
  { id: 'fr-secondary-1re', catalogLevelId: 'fr-secondary-1re', name: '1re', section: 'francophone', cycle: 'secondary', educationType: 'general', levelOrder: 16, isDefault: true, isActive: true },
  { id: 'fr-secondary-terminale', catalogLevelId: 'fr-secondary-terminale', name: 'Terminale', section: 'francophone', cycle: 'secondary', educationType: 'general', levelOrder: 17, isDefault: true, isActive: true },

  // B. SECTION ANGLOPHONE - NURSERY (4 niveaux)
  { id: 'en-nursery-pre', catalogLevelId: 'en-nursery-pre', name: 'Pre-Nursery', section: 'anglophone', cycle: 'nursery', educationType: 'general', levelOrder: 18, isDefault: true, isActive: true },
  { id: 'en-nursery-1', catalogLevelId: 'en-nursery-1', name: 'Nursery 1', section: 'anglophone', cycle: 'nursery', educationType: 'general', levelOrder: 19, isDefault: true, isActive: true },
  { id: 'en-nursery-2', catalogLevelId: 'en-nursery-2', name: 'Nursery 2', section: 'anglophone', cycle: 'nursery', educationType: 'general', levelOrder: 20, isDefault: true, isActive: true },
  { id: 'en-nursery-3', catalogLevelId: 'en-nursery-3', name: 'Nursery 3', section: 'anglophone', cycle: 'nursery', educationType: 'general', levelOrder: 21, isDefault: true, isActive: true },

  // B. SECTION ANGLOPHONE - PRIMARY (6 niveaux)
  { id: 'en-primary-1', catalogLevelId: 'en-primary-1', name: 'Class 1', section: 'anglophone', cycle: 'primary', educationType: 'general', levelOrder: 22, isDefault: true, isActive: true },
  { id: 'en-primary-2', catalogLevelId: 'en-primary-2', name: 'Class 2', section: 'anglophone', cycle: 'primary', educationType: 'general', levelOrder: 23, isDefault: true, isActive: true },
  { id: 'en-primary-3', catalogLevelId: 'en-primary-3', name: 'Class 3', section: 'anglophone', cycle: 'primary', educationType: 'general', levelOrder: 24, isDefault: true, isActive: true },
  { id: 'en-primary-4', catalogLevelId: 'en-primary-4', name: 'Class 4', section: 'anglophone', cycle: 'primary', educationType: 'general', levelOrder: 25, isDefault: true, isActive: true },
  { id: 'en-primary-5', catalogLevelId: 'en-primary-5', name: 'Class 5', section: 'anglophone', cycle: 'primary', educationType: 'general', levelOrder: 26, isDefault: true, isActive: true },
  { id: 'en-primary-6', catalogLevelId: 'en-primary-6', name: 'Class 6', section: 'anglophone', cycle: 'primary', educationType: 'general', levelOrder: 27, isDefault: true, isActive: true },

  // B. SECTION ANGLOPHONE - SECONDARY GENERAL (7 niveaux)
  { id: 'en-secondary-form1', catalogLevelId: 'en-secondary-form1', name: 'Form 1', section: 'anglophone', cycle: 'secondary', educationType: 'general', levelOrder: 28, isDefault: true, isActive: true },
  { id: 'en-secondary-form2', catalogLevelId: 'en-secondary-form2', name: 'Form 2', section: 'anglophone', cycle: 'secondary', educationType: 'general', levelOrder: 29, isDefault: true, isActive: true },
  { id: 'en-secondary-form3', catalogLevelId: 'en-secondary-form3', name: 'Form 3', section: 'anglophone', cycle: 'secondary', educationType: 'general', levelOrder: 30, isDefault: true, isActive: true },
  { id: 'en-secondary-form4', catalogLevelId: 'en-secondary-form4', name: 'Form 4', section: 'anglophone', cycle: 'secondary', educationType: 'general', levelOrder: 31, isDefault: true, isActive: true },
  { id: 'en-secondary-form5', catalogLevelId: 'en-secondary-form5', name: 'Form 5', section: 'anglophone', cycle: 'secondary', educationType: 'general', levelOrder: 32, isDefault: true, isActive: true },
  { id: 'en-secondary-lower-sixth', catalogLevelId: 'en-secondary-lower-sixth', name: 'Lower Sixth', section: 'anglophone', cycle: 'secondary', educationType: 'general', levelOrder: 33, isDefault: true, isActive: true },
  { id: 'en-secondary-upper-sixth', catalogLevelId: 'en-secondary-upper-sixth', name: 'Upper Sixth', section: 'anglophone', cycle: 'secondary', educationType: 'general', levelOrder: 34, isDefault: true, isActive: true },

  // OPTIONS ET CLASSES SECONDAIRES TECHNIQUES CONSERVÉES EN COMPLÉMENT
  { id: 'fr-6e-tech', catalogLevelId: 'fr-6e-tech', name: '6e technique', section: 'francophone', cycle: 'secondary', educationType: 'technical', levelOrder: 35, isDefault: true, isActive: false },
  { id: 'fr-5e-tech', catalogLevelId: 'fr-5e-tech', name: '5e technique', section: 'francophone', cycle: 'secondary', educationType: 'technical', levelOrder: 36, isDefault: true, isActive: false },
  { id: 'fr-4e-tech', catalogLevelId: 'fr-4e-tech', name: '4e technique', section: 'francophone', cycle: 'secondary', educationType: 'technical', levelOrder: 37, isDefault: true, isActive: false },
  { id: 'fr-3e-tech', catalogLevelId: 'fr-3e-tech', name: '3e technique', section: 'francophone', cycle: 'secondary', educationType: 'technical', levelOrder: 38, isDefault: true, isActive: false },
  { id: 'fr-2nde-tech', catalogLevelId: 'fr-2nde-tech', name: '2nde technique', section: 'francophone', cycle: 'secondary', educationType: 'technical', levelOrder: 39, isDefault: true, isActive: false },
  { id: 'fr-1ere-tech', catalogLevelId: 'fr-1ere-tech', name: '1re technique', section: 'francophone', cycle: 'secondary', educationType: 'technical', levelOrder: 40, isDefault: true, isActive: false },
  { id: 'fr-tle-tech', catalogLevelId: 'fr-tle-tech', name: 'Terminale technique', section: 'francophone', cycle: 'secondary', educationType: 'technical', levelOrder: 41, isDefault: true, isActive: false },
  { id: 'en-tech-form-1', catalogLevelId: 'en-tech-form-1', name: 'Technical Form 1', section: 'anglophone', cycle: 'secondary', educationType: 'technical', levelOrder: 42, isDefault: true, isActive: false },
  { id: 'en-tech-form-2', catalogLevelId: 'en-tech-form-2', name: 'Technical Form 2', section: 'anglophone', cycle: 'secondary', educationType: 'technical', levelOrder: 43, isDefault: true, isActive: false },
  { id: 'en-tech-form-3', catalogLevelId: 'en-tech-form-3', name: 'Technical Form 3', section: 'anglophone', cycle: 'secondary', educationType: 'technical', levelOrder: 44, isDefault: true, isActive: false },
  { id: 'en-tech-form-4', catalogLevelId: 'en-tech-form-4', name: 'Technical Form 4', section: 'anglophone', cycle: 'secondary', educationType: 'technical', levelOrder: 45, isDefault: true, isActive: false },
  { id: 'en-tech-form-5', catalogLevelId: 'en-tech-form-5', name: 'Technical Form 5', section: 'anglophone', cycle: 'secondary', educationType: 'technical', levelOrder: 46, isDefault: true, isActive: false },
  { id: 'en-lower-sixth-tech', catalogLevelId: 'en-lower-sixth-tech', name: 'Lower Sixth Technical', section: 'anglophone', cycle: 'secondary', educationType: 'technical', levelOrder: 47, isDefault: true, isActive: false },
  { id: 'en-upper-sixth-tech', catalogLevelId: 'en-upper-sixth-tech', name: 'Upper Sixth Technical', section: 'anglophone', cycle: 'secondary', educationType: 'technical', levelOrder: 48, isDefault: true, isActive: false }
];

/** Metadata only: no third-party curriculum text or redistribution permission. */
export const sourceReferences = [
  {
    id: 'minesec-programmes-index', title: 'MINESEC — index des programmes FR/EN',
    url: 'https://www.minesec.gov.cm/web/index.php/fr/systeme-educatif/progammes-officiels',
    publisher: 'MINESEC', host: 'MINESEC', coverage: 'Enseignement secondaire, catalogues francophone et anglophone',
    checkedOn: '2026-09-08', access: 'Index consulté ; fichiers du corpus non authentifiés ni intégrés.',
    rights: 'Droits de redistribution des documents non établis.',
  },
  {
    id: 'minedub-portal', title: 'MINEDUB — portail institutionnel',
    url: 'https://www.minedub.cm/', publisher: 'MINEDUB', host: 'MINEDUB',
    coverage: 'Éducation de base ; aucune couverture de curriculum acquise par ce lien.',
    checkedOn: '2026-09-08', access: 'Dernière tentative de lecture : erreur HTTP 502. Ne pas considérer le fonds à jour.',
    rights: 'Droits de redistribution des documents non établis.',
  },
  {
    id: 'ebase-curriculum-copies', title: 'eBASE — catalogue de copies de curricula primaires',
    url: 'https://ebaselearning.org/resources/curriculum-policy-documents',
    publisher: 'Organisme émetteur de chaque PDF à vérifier dans le document', host: 'eBASE ; liens de fichiers hébergés sur S3',
    coverage: 'Catalogue listant Class 1–6 EN et trois niveaux du primaire FR ; aucune adoption automatique.',
    checkedOn: '2026-09-08', access: 'Page catalogue consultée. Copies PDF non authentifiées, non importées et non vérifiées comme version courante.',
    rights: 'Aucune licence de réutilisation acquise. Lien uniquement.',
  },
] as const;

import { minedubDocuments } from './minedubVerified';
export type ProvenanceStatus = 'OFFICIAL_VERIFIED' | 'OFFICIAL_PENDING_VERIFICATION' | 'COMPLEMENTARY_VERIFIED' | 'LINK_ONLY' | 'EXTERNAL_LINK_ONLY' | 'ITALO_INTERNAL' | 'MOCK' | 'REJECTED';
export interface ProvenanceRecord {
  id: string; authority: 'MINEDUB' | 'MINESEC' | 'MINESUP' | 'CEDUC' | 'ITALO' | 'OTHER';
  issuingOrganization: string | null; hostingOrganization: string | null;
  sourceType: 'catalogue' | 'curriculum' | 'guide' | 'instruction' | 'exam' | 'internal';
  title: string; officialUrl: string | null; retrievalUrl: string | null;
  publicationDate: string | null; effectiveDate: string | null; edition: string | null;
  language: string | null; section: string | null; subsystem: string | null;
  levels: string[]; subjects: string[]; checksumSha256: string | null;
  retrievedAt: string | null; verifiedAt: string | null; verificationMethod: string | null;
  rightsStatus: 'UNKNOWN' | 'LINK_ONLY' | 'REUSE_AUTHORIZED' | 'NOT_AUTHORIZED';
  storagePolicy: 'METADATA_ONLY' | 'LINK_ONLY' | 'STORE_AUTHORIZED';
  status: ProvenanceStatus; applicability: 'APPLICABLE' | 'PENDING' | 'NOT_APPLICABLE';
  accessStatus: 'CHECK_FAILED' | 'AVAILABLE' | 'UNAVAILABLE' | 'NOT_CHECKED';
  missingReason: string;
}
const metadata: Omit<ProvenanceRecord, 'id' | 'authority' | 'issuingOrganization' | 'hostingOrganization' | 'title' | 'officialUrl' | 'retrievalUrl' | 'missingReason'> = {
  sourceType: 'catalogue', publicationDate: null, effectiveDate: null, edition: null,
  language: null, section: null, subsystem: null, levels: [], subjects: [],
  checksumSha256: null, retrievedAt: null, verifiedAt: null, verificationMethod: null,
  rightsStatus: 'UNKNOWN', storagePolicy: 'METADATA_ONLY', status: 'OFFICIAL_PENDING_VERIFICATION',
  applicability: 'PENDING', accessStatus: 'NOT_CHECKED',
};
/** Hierarchy is authority scope, not a claim that any corpus has been authenticated. */
export const provenanceRegistry: ProvenanceRecord[] = [
  { ...metadata, id: 'minesec-seconde-english-2018-pending', authority: 'MINESEC', issuingOrganization: 'Ministère des Enseignements Secondaires — Inspection générale des enseignements', hostingOrganization: 'MINESEC', sourceType: 'curriculum',
    title: 'English to Francophones — Seconde, 2018', officialUrl: 'https://files.minesec.gov.cm/direct/view.php?/ANGLAIS_SYLLABUS_2DE_edited.pdf=&s=4s', retrievalUrl: 'https://files.minesec.gov.cm/direct/view.php?/ANGLAIS_SYLLABUS_2DE_edited.pdf=&s=4s',
    edition: '2018', language: 'en', section: 'francophone', levels: ['Seconde'], subjects: ['Anglais'], retrievedAt: '2026-09-09', accessStatus: 'AVAILABLE', rightsStatus: 'LINK_ONLY', storagePolicy: 'LINK_ONLY',
    verificationMethod: 'PDF de 33 pages consulté via le chemin institutionnel direct ; couverture p.1 et tableau des séries p.8. Téléchargement local expiré : empreinte non calculée.',
    missingReason: 'Document consultable mais arrêté p.2 non numéroté/non daté ; version actuellement applicable et checksum à confirmer. Page 8 distingue série A et C/D : ne pas attribuer un volume unique sans connaître la série. Aucune adoption ni republication.' },
  { ...metadata, id: 'gce-board-examinations', authority: 'OTHER', issuingOrganization: 'Cameroon GCE Board', hostingOrganization: 'Cameroon GCE Board', sourceType: 'exam',
    title: 'GCE Board — règlements, syllabus et accès aux annales', officialUrl: 'https://camgceb.org/examinations/', retrievalUrl: 'https://camgceb.org/examinations/', retrievedAt: '2026-09-09',
    status: 'LINK_ONLY', accessStatus: 'AVAILABLE', rightsStatus: 'LINK_ONLY', storagePolicy: 'LINK_ONLY',
    verificationMethod: 'Page de l’organisme d’examens consultée ; modalités de mise à disposition des règlements, syllabus et annales.',
    missingReason: 'Le Board indique une distribution des syllabus aux centres reconnus et la vente d’annales via ses bureaux. Aucun achat ni copie effectué. Les listes de matières d’examen ne valent pas curriculum pour chaque année.' },
  { ...metadata, id: 'minesec-vod', authority: 'MINESEC', issuingOrganization: 'Ministère des Enseignements Secondaires', hostingOrganization: 'MINESEC / CAMTEL',
    title: 'MINESEC — ressources de télé-enseignement', officialUrl: 'https://vod.minesec.gov.cm/', retrievalUrl: 'https://vod.minesec.gov.cm/',
    retrievedAt: '2026-09-09', verificationMethod: 'Page consultée sur le sous-domaine ministériel ; rubrique Télé-Enseignement / Distance Education et mention MINESEC / CAMTEL.',
    status: 'LINK_ONLY', accessStatus: 'AVAILABLE', rightsStatus: 'LINK_ONLY', storagePolicy: 'LINK_ONLY',
    missingReason: 'Portail de ressources, pas un curriculum ni une preuve de couverture. Aucun média copié. Niveau, date, applicabilité et droits de chaque ressource à vérifier avant usage.' },
  { ...metadata, id: 'minesec-distance-form-one-maths-candidate', authority: 'MINESEC', issuingOrganization: null, hostingOrganization: 'schoolfaqs.net',
    title: 'Enseignement à distance — Mathematics, Form One (rattachement institutionnel à confirmer)', officialUrl: null,
    retrievalUrl: 'https://minesec.schoolfaqs.net/learn/mathematics/form-one', language: 'en', levels: ['Form One'], subjects: ['Mathematics'],
    retrievedAt: '2026-09-09', verificationMethod: 'Page publique consultée ; intitulés de modules présents, leçons affichées à zéro. Le logo ne constitue pas une authentification.',
    status: 'LINK_ONLY', accessStatus: 'AVAILABLE', rightsStatus: 'LINK_ONLY', storagePolicy: 'LINK_ONLY',
    missingReason: 'Hébergement tiers : lien institutionnel canonique, édition et droits non confirmés. Ne pas adopter ni importer comme programme officiel. Aucun contenu de cours copié.' },
  ...minedubDocuments.map((document): ProvenanceRecord => ({ ...metadata,
    id: document.id, authority: 'MINEDUB', issuingOrganization: 'Ministère de l’Éducation de Base', hostingOrganization: 'MINEDUB', sourceType: 'curriculum',
    title: document.title, officialUrl: 'https://www.minedub.cm/wp-file-download-search/',
    retrievalUrl: 'https://www.minedub.cm/download/350/archives/' + document.download,
    edition: '2018', language: document.language, section: document.language, levels: document.levels,
    checksumSha256: document.sha, retrievedAt: '2026-09-08', verifiedAt: '2026-09-08',
    verificationMethod: 'Lien du catalogue public MINEDUB, téléchargement sur le domaine ministériel, couverture et empreinte SHA-256 ; ' + document.pages + ' pages PDF.',
    status: 'OFFICIAL_VERIFIED', applicability: 'APPLICABLE', accessStatus: 'AVAILABLE', storagePolicy: 'LINK_ONLY',
    missingReason: 'Authenticité documentaire vérifiée, pas une adoption. Date d’effet et édition actuellement applicable à confirmer. Droits de republication inconnus. Texte intégral non publié. Correspondances ITALO, progression et validation humaine requises.',
  })),
  { ...metadata, id: 'minedub-catalogue', authority: 'MINEDUB', issuingOrganization: 'Ministère de l’Éducation de Base', hostingOrganization: 'MINEDUB',
    title: 'MINEDUB — éducation de base', officialUrl: 'https://www.minedub.cm/', retrievalUrl: 'https://www.minedub.cm/',
    applicability: 'APPLICABLE', accessStatus: 'AVAILABLE',
    missingReason: 'Catalogue public consulté le 8 septembre 2026 : huit programmes maternels/primaires FR et EN et deux variantes de fichiers, édition de couverture 2018. Applicabilité actuelle, prématernel et droits restent à confirmer. Métadonnées seulement, pas d’adoption automatique.' },
  { ...metadata, id: 'minesec-catalogue', authority: 'MINESEC', issuingOrganization: 'Ministère des Enseignements Secondaires', hostingOrganization: 'MINESEC',
    title: 'MINESEC — programmes FR et syllabus EN', officialUrl: 'https://www.minesec.gov.cm/web/index.php/fr/systeme-educatif/progammes-officiels',
    retrievalUrl: 'https://www.minesec.gov.cm/web/index.php/fr/systeme-educatif/progammes-officiels', applicability: 'APPLICABLE', accessStatus: 'CHECK_FAILED',
    missingReason: 'Catalogue institutionnel identifié ; nouvelle lecture directe expirée. Fichiers, éditions, matières et droits non authentifiés. Aucun programme importé.' },
  { ...metadata, id: 'minesup-scope', authority: 'MINESUP', issuingOrganization: 'Ministère de l’Enseignement Supérieur', hostingOrganization: 'MINESUP',
    title: 'MINESUP — périmètre supérieur, pas de curriculum de substitution',
    officialUrl: 'https://www.minesup.gov.cm/index.php/missions-du-minesup/', retrievalUrl: 'https://www.minesup.gov.cm/index.php/missions-du-minesup/',
    accessStatus: 'AVAILABLE', applicability: 'NOT_APPLICABLE', status: 'EXTERNAL_LINK_ONLY', rightsStatus: 'LINK_ONLY', storagePolicy: 'LINK_ONLY',
    missingReason: 'Page des missions consultée le 8 septembre 2026. Aucune pertinence curriculaire directe établie pour les classes ITALO visées. Pas de veille ni d’import MINESUP activé.' },
  { ...metadata, id: 'ceduc-pending', authority: 'CEDUC', issuingOrganization: null, hostingOrganization: null,
    title: 'CEDUC — bibliothèque complémentaire à identifier', officialUrl: null, retrievalUrl: null, status: 'EXTERNAL_LINK_ONLY',
    missingReason: 'Identité canonique, organisme, catalogue, droits de consultation/indexation/stockage et API non établis. Aucun abonnement, API ou accès inventé. Ne bloque pas le fonds principal.' },
  { ...metadata, id: 'ebase-links', authority: 'OTHER', issuingOrganization: null, hostingOrganization: 'eBASE',
    title: 'eBASE — copies de curricula primaires, liens seulement', officialUrl: null,
    retrievalUrl: 'https://ebaselearning.org/resources/curriculum-policy-documents', status: 'EXTERNAL_LINK_ONLY', rightsStatus: 'LINK_ONLY', storagePolicy: 'LINK_ONLY',
    missingReason: 'Catalogue de copies repéré ; émetteur et hébergeur distincts. Authenticité, version courante et licence non établies. Aucun texte intégré.' },
];
export function authenticatedOfficialDocument(record: ProvenanceRecord): boolean {
  return record.status === 'OFFICIAL_VERIFIED' && ['MINEDUB', 'MINESEC', 'MINESUP'].includes(record.authority)
    && record.sourceType !== 'catalogue' && record.applicability === 'APPLICABLE'
    && Boolean(record.issuingOrganization && record.officialUrl && record.retrievalUrl && record.verifiedAt && record.verificationMethod)
    && /^[a-f0-9]{64}$/.test(record.checksumSha256 || '');
}
export function provenanceBadge(record: ProvenanceRecord): string {
  if (authenticatedOfficialDocument(record)) return record.sourceType === 'exam' ? 'EXAMEN OFFICIEL — ' + record.authority : 'OFFICIEL — ' + record.authority;
  if (record.status === 'ITALO_INTERNAL') return 'RESSOURCE — ITALO';
  if (record.status === 'COMPLEMENTARY_VERIFIED' && record.authority === 'CEDUC') return 'RESSOURCE — CEDUC';
  if (record.status === 'MOCK') return 'DÉMONSTRATION — NON OFFICIELLE';
  return 'LIEN EXTERNE — ' + record.status;
}

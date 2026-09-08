export type ProvenanceStatus = 'OFFICIAL_VERIFIED' | 'OFFICIAL_PENDING_VERIFICATION' | 'COMPLEMENTARY_VERIFIED' | 'EXTERNAL_LINK_ONLY' | 'ITALO_INTERNAL' | 'MOCK' | 'REJECTED';
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
  { ...metadata, id: 'minedub-catalogue', authority: 'MINEDUB', issuingOrganization: 'Ministère de l’Éducation de Base', hostingOrganization: 'MINEDUB',
    title: 'MINEDUB — éducation de base', officialUrl: 'https://www.minedub.cm/', retrievalUrl: 'https://www.minedub.cm/',
    applicability: 'APPLICABLE', accessStatus: 'CHECK_FAILED',
    missingReason: 'Portail indexé le 8 septembre 2026 ; lecture directe instable. Curricula, éditions applicables, périmètre prématernel et droits non authentifiés. Aucun programme importé.' },
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

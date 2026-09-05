import crypto from 'node:crypto';
import process from 'node:process';

const program = {
  id: 'cm-primary-fr-demo-v1',
  countryCode: 'CM',
  section: 'francophone',
  cycle: 'primary',
  title: 'Programme primaire camerounais — démonstration Lot A',
  version: 'demo-v1',
  status: 'published',
  sourceType: 'mock',
  provenance: {
    label: 'Jeu minimal de démonstration Ecoscolaire, non homologué',
    note: 'À remplacer par un import vérifié depuis les référentiels officiels avant usage réel.'
  }
};

const units = [
  ['francais', 'Lecture et compréhension', 'Identifier les informations explicites d’un texte court'],
  ['francais', 'Expression écrite', 'Produire des phrases simples et cohérentes'],
  ['mathematiques', 'Numération', 'Lire, écrire et comparer les nombres du niveau'],
  ['mathematiques', 'Calcul', 'Résoudre des additions et soustractions adaptées au niveau'],
  ['sciences', 'Le vivant', 'Observer et décrire les besoins des êtres vivants']
].map(([subjectId, title, objective], index) => ({
  id: `${program.id}__primary-1__${subjectId}__${String(index + 1).padStart(2, '0')}`,
  programId: program.id,
  catalogLevelId: 'primary-1',
  subjectId,
  title,
  objective,
  sequence: index + 1,
  status: 'published',
  sourceType: 'mock'
}));

const canonical = JSON.stringify({ program, units });
const checksum = crypto.createHash('sha256').update(canonical).digest('hex');
const args = new Set(process.argv.slice(2));
const projectArg = process.argv.find(value => value.startsWith('--project='));
const projectId = projectArg?.slice('--project='.length) || process.env.GCLOUD_PROJECT || '';
const apply = args.has('--apply');

console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', projectId: projectId || null, checksum, program, units }, null, 2));

if (!apply) process.exit(0);
if (!/(staging|demo|emulator)/i.test(projectId) || /(prod|production)/i.test(projectId)) {
  throw new Error('REFUS_PRODUCTION: --apply exige un projet explicitement staging, demo ou emulator.');
}

const { initializeApp, applicationDefault } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
initializeApp({ credential: applicationDefault(), projectId });
const firestore = getFirestore();
const batch = firestore.batch();
batch.set(firestore.collection('curriculumPrograms').doc(program.id), {
  ...program, checksum, updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp()
}, { merge: true });
units.forEach(unit => batch.set(firestore.collection('curriculumUnits').doc(unit.id), {
  ...unit, checksum, updatedAt: FieldValue.serverTimestamp(), createdAt: FieldValue.serverTimestamp()
}, { merge: true }));
await batch.commit();
console.log(`Seed Pédagogie appliqué sur ${projectId}: ${units.length} unités, checksum ${checksum}.`);

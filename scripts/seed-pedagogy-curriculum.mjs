import crypto from "node:crypto";
import process from "node:process";

const program = {
  id: "cm-primary-fr-demo-v1",
  countryCode: "CM",
  section: "francophone",
  cycle: "primary",
  title: "Programme primaire camerounais — démonstration Lot A",
  version: "demo-v1",
  status: "published",
  sourceType: "mock",
  provenance: {
    label: "Jeu minimal de démonstration Ecoscolaire, non homologué",
    note: "À remplacer par un import vérifié depuis les référentiels officiels avant usage réel.",
  },
};

const units = [
  [
    "francais",
    "Lecture et compréhension",
    "Identifier les informations explicites d’un texte court",
  ],
  [
    "francais",
    "Expression écrite",
    "Produire des phrases simples et cohérentes",
  ],
  [
    "mathematiques",
    "Numération",
    "Lire, écrire et comparer les nombres du niveau",
  ],
  [
    "mathematiques",
    "Calcul",
    "Résoudre des additions et soustractions adaptées au niveau",
  ],
  [
    "sciences",
    "Le vivant",
    "Observer et décrire les besoins des êtres vivants",
  ],
].map(([subjectId, title, objective], index) => ({
  id: `${program.id}__primary-1__${subjectId}__${String(index + 1).padStart(2, "0")}`,
  programId: program.id,
  catalogLevelId: "primary-1",
  subjectId,
  title,
  objective,
  sequence: index + 1,
  status: "published",
  sourceType: "mock",
}));

const canonical = JSON.stringify({ program, units });
const checksum = crypto.createHash("sha256").update(canonical).digest("hex");
const args = new Set(process.argv.slice(2));
const projectArg = process.argv.find((value) => value.startsWith("--project="));
const projectId =
  projectArg?.slice("--project=".length) || process.env.GCLOUD_PROJECT || "";
const apply = args.has("--apply");

const safeTarget =
  /(staging|demo|emulator)/i.test(projectId) &&
  !/(prod|production)/i.test(projectId);
if (projectId && !safeTarget) {
  throw new Error(
    "REFUS_PRODUCTION: le projet doit être explicitement staging, demo ou emulator.",
  );
}

const documents = [
  { collection: "curriculumPrograms", data: program },
  ...units.map((unit) => ({ collection: "curriculumUnits", data: unit })),
];
console.log(
  JSON.stringify(
    {
      mode: apply ? "apply" : "dry-run",
      projectId: projectId || null,
      checksum,
      sourceType: program.sourceType,
      documentsExpected: documents.length,
    },
    null,
    2,
  ),
);

if (!apply) process.exit(0);
if (!safeTarget) {
  throw new Error(
    "REFUS_PRODUCTION: --apply exige un projet explicitement staging, demo ou emulator.",
  );
}

const { initializeApp, applicationDefault } =
  await import("firebase-admin/app");
const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
initializeApp({ credential: applicationDefault(), projectId });
const firestore = getFirestore();
const refs = documents.map((document) =>
  firestore.collection(document.collection).doc(document.data.id),
);
const snapshots = await firestore.getAll(...refs);
const summary = {
  documentsExpected: documents.length,
  documentsCreated: 0,
  documentsUpdated: 0,
  documentsSkipped: 0,
  errors: 0,
};
const batch = firestore.batch();

documents.forEach((document, index) => {
  const snapshot = snapshots[index];
  if (snapshot.exists && snapshot.data()?.checksum === checksum) {
    summary.documentsSkipped += 1;
    return;
  }
  if (snapshot.exists) summary.documentsUpdated += 1;
  else summary.documentsCreated += 1;
  batch.set(
    refs[index],
    {
      ...document.data,
      checksum,
      updatedAt: FieldValue.serverTimestamp(),
      ...(!snapshot.exists ? { createdAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true },
  );
});

if (summary.documentsCreated || summary.documentsUpdated) await batch.commit();
console.log(`PEDAGOGY_SEED_SUMMARY ${JSON.stringify(summary)}`);

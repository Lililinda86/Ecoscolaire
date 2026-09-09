import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { requirePedagogyActor, requireId, audit } from './authorization';
import { matchOfficialSubjects, primaryDocumentByLevel, MappingSubject, proposeDocumentaryProgression, DocumentaryWeek } from './subjectMappingEngine';
import { subjectMappingSources } from './subjectMappingSources';
import { secondarySubjectSources } from './secondarySubjectSources';

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const readers = ['owner', 'director', 'secretary', 'boardViewer', 'superAdmin'];
const active = (d: admin.firestore.DocumentData) => d.isActive !== false && d.active !== false && !['inactive', 'archived'].includes(d.status);
const version = 'subject-mapping-v1';

/** Stores proposed local links only: no classProgram publication, requirement,
 * teacher assignment, documentary decision or curriculum adoption is changed. */
export const reviewCurriculumSubjectMappings = functions.https.onCall(async (data, context) => {
  if (!['preview', 'apply'].includes(data?.action)) throw new functions.https.HttpsError('invalid-argument', 'Action invalide.');
  const applying = data.action === 'apply';
  const { actor, schoolId } = await requirePedagogyActor(context, data.schoolId, applying ? ['owner'] : readers);
  const academicYearId = requireId(data.academicYearId, 'academicYearId');
  const classId = applying ? requireId(data.classId, 'classId') : null;
  if (applying && (data.confirmed !== true || typeof data.expectedVersion !== 'string')) throw new functions.https.HttpsError('invalid-argument', 'Récapitulatif confirmé requis.');
  const db = admin.firestore();
  return db.runTransaction(async tx => {
    const [user, year, catalogSnap, classesSnap, previousSnap, weeksSnap] = await Promise.all([
      tx.get(db.doc('users/' + actor.uid)), tx.get(db.doc('academicYears/' + academicYearId)),
      tx.get(db.collection('subjects').where('schoolId', '==', schoolId).limit(1001)),
      tx.get(db.collection('classes').where('schoolId', '==', schoolId).limit(501)),
      tx.get(db.collection('curriculumSubjectMappings').where('schoolId', '==', schoolId).limit(2001)),
      tx.get(db.collection('teachingWeeks').where('schoolId', '==', schoolId).limit(1001)),
    ]);
    const u = user.data();
    if (!u || u.isActive !== true || !(applying ? ['owner'] : readers).includes(u.role) || (u.role !== 'superAdmin' && u.schoolId !== schoolId)) throw new functions.https.HttpsError('permission-denied', 'Droits modifiés.');
    if (year.data()?.schoolId !== schoolId || year.data()?.status !== 'active' || !active(year.data()!)) throw new functions.https.HttpsError('failed-precondition', 'Année active requise.');
    if (catalogSnap.size > 1000 || classesSnap.size > 500 || previousSnap.size > 2000 || weeksSnap.size > 1000) throw new functions.https.HttpsError('resource-exhausted', 'Limite de lecture atteinte.');
    const catalog = catalogSnap.docs.map(doc => {
      const d = doc.data();
      return { id: doc.id, schoolId: d.schoolId, name: d.name, section: d.section, cycles: d.cycles,
        isActive: active(d), localConfigurationStatus: d.localConfigurationStatus || '' } as MappingSubject;
    }).filter(d => typeof d.name === 'string');
    const rows = classesSnap.docs.filter(doc => active(doc.data()) && (!doc.data().academicYearId || doc.data().academicYearId === academicYearId)).flatMap(doc => {
      const cls = doc.data();
      const source = subjectMappingSources.find(s => s.documentId === primaryDocumentByLevel[cls.catalogLevelId]);
      const section = cls.section || cls.type;
      if (!source || !['francophone', 'anglophone'].includes(source.section) || (section && section !== source.section) || (cls.cycle && cls.cycle !== 'primary') || cls.educationType === 'technical') return [];
      const mappings = matchOfficialSubjects(source.names, catalog, schoolId, source.section as 'francophone' | 'anglophone');
      const safe = mappings.filter(m => m.localMatch !== null);
      const sourceVersion = source.sourceVersion;
      const mappingVersion = digest([version, sourceVersion, doc.id, cls.catalogLevelId, mappings]);
      const id = digest([schoolId, academicYearId, doc.id, sourceVersion, mappingVersion]);
      const previous = previousSnap.docs.find(d => d.id === id)?.data();
      const progressionSuggestions = previous?.status === 'proposed' ? proposeDocumentaryProgression(schoolId, academicYearId, cls.catalogLevelId, mappings, source.units, weeksSnap.docs.map(w => ({ ...w.data(), id: w.id } as DocumentaryWeek))) : [];
      return [{ classId: doc.id, className: cls.name, catalogLevelId: cls.catalogLevelId, source, mappings, sourceVersion, mappingVersion, safeCount: safe.length, ambiguousCount: mappings.filter(m => m.status === 'AMBIGUOUS').length, missingCount: mappings.filter(m => m.status === 'MISSING_LOCAL_SUBJECT').length, id, status: previous?.status || 'not_applied', appliedBy: previous?.appliedBy || null, progressionSuggestions }];
    });
    if (!applying) {
      const secondaryRows = classesSnap.docs.filter(doc => active(doc.data())).flatMap(doc => {
        const cls = doc.data(), reference = secondarySubjectSources.find(s => s.catalogLevelId === cls.catalogLevelId);
        if (!reference || (cls.academicYearId && cls.academicYearId !== academicYearId) || ((cls.section || cls.type) && (cls.section || cls.type) !== reference.section) || (cls.cycle && cls.cycle !== 'secondary') || cls.educationType === 'technical') return [];
        return [{ classId: doc.id, className: cls.name, coverage: reference.coverage, mappings: matchOfficialSubjects(reference.subjects.map(s => s.officialSubject), catalog, schoolId, reference.section as 'francophone' | 'anglophone', 'secondary'), sources: reference.subjects, autoApplyAllowed: false }];
      });
      return { rows, secondaryRows, scope: 'PROPOSED_SUBJECT_LINKS_ONLY' };
    }
    const row = rows.find(r => r.classId === classId);
    if (!row) throw new functions.https.HttpsError('failed-precondition', 'Classe primaire compatible requise.');
    if (row.mappingVersion !== data.expectedVersion) throw new functions.https.HttpsError('aborted', 'Catalogue ou source modifié : rechargez le récapitulatif.');
    if (!row.safeCount) throw new functions.https.HttpsError('failed-precondition', 'Aucune correspondance sûre.');
    if (row.status !== 'not_applied') return { id: row.id, status: row.status, idempotent: true };
    const links = row.mappings.filter(m => m.localMatch).map(m => ({ officialSubject: m.officialSubject, subjectId: m.localMatch!.id, subjectName: m.localMatch!.name, matchStatus: m.status }));
    const unitLinks = row.source.units.filter(unit => unit.catalogLevelId === row.catalogLevelId).flatMap(unit => {
      const link = links.find(l => l.officialSubject === unit.officialSubject);
      return link ? [{ curriculumUnitId: unit.id + '-review-2018-v1', subjectId: link.subjectId, sourceDocumentId: unit.documentId, sourcePage: unit.sourcePdfPage }] : [];
    });
    tx.create(db.collection('curriculumSubjectMappings').doc(row.id), {
      schoolId, academicYearId, classId, catalogLevelId: row.catalogLevelId,
      sourceDocumentId: row.source.documentId, sourceVersion: row.sourceVersion, mappingVersion: row.mappingVersion,
      sourceUrl: row.source.sourceUrl, sourcePages: row.source.pdfPages, links, unitLinks,
      status: 'proposed', scope: 'PROPOSED_SUBJECT_LINKS_ONLY', appliedBy: actor.uid,
      appliedAt: FieldValue.serverTimestamp(), adoptionChanged: false, classProgramPublished: false,
    });
    audit(tx, actor, schoolId, 'CURRICULUM_SAFE_SUBJECT_MAPPINGS_PROPOSED', 'curriculumSubjectMapping', row.id,
      { academicYearId, classId, sourceVersion: row.sourceVersion, mappingVersion: row.mappingVersion, subjectCount: links.length, adoptionChanged: false });
    return { id: row.id, status: 'proposed', idempotent: false };
  });
});

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { assessmentMechanicalIssues } from './assessmentMechanicalQuality';
import type { GeneratedAssessmentItem } from './weeklyAssessmentGenerator';
import { sourceChecksum, type ValidatedPreparationSource } from './weeklyAssessmentGenerator';
import { taughtContentIssues } from './taughtContentCoverage';

/** Keep a flawed paid draft editable; never require another provider call to fix it. */
export async function assertAiAssessmentReviewQuality(transaction: admin.firestore.Transaction, assessment: admin.firestore.DocumentData, schoolId: string, id: string) {
  if (assessment.generatorProvider !== 'openai') return;
  const snapshot = assessment.sourceSnapshot as ValidatedPreparationSource[];
  if (!Array.isArray(snapshot) || !snapshot.length || sourceChecksum(snapshot) !== assessment.sourceChecksum) throw new functions.https.HttpsError('failed-precondition', 'Snapshot enseigné absent ou altéré : conserver le brouillon pour revue.');
  const items = await transaction.get(admin.firestore().collection('assessmentItems').where('schoolId', '==', schoolId).where('weeklyAssessmentId', '==', id).where('generationVersion', '==', assessment.generationVersion).limit(101));
  if (!items.size || items.size > 100 || items.size !== assessment.itemCount) throw new functions.https.HttpsError('failed-precondition', 'Questions incomplètes : vérifier le brouillon.');
  // Historical AI rows also need explicit choices before a new signoff.
  // Manual/non-AI rows retain their existing workflow.
  const issues = assessmentMechanicalIssues(items.docs.map(item => {
    const data = item.data() as GeneratedAssessmentItem;
    return { ...data, choices: data.choices ?? [] };
  }));
  for (const item of items.docs) issues.push(...taughtContentIssues(item.data(), snapshot));
  if (issues.length) throw new functions.https.HttpsError('failed-precondition', 'Corriger les défauts détectés avant visa ou impression : ' + issues.join(', '));
}

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { assessmentMechanicalIssues } from './assessmentMechanicalQuality';
import type { GeneratedAssessmentItem } from './weeklyAssessmentGenerator';

/** Keep a flawed paid draft editable; never require another provider call to fix it. */
export async function assertAiAssessmentReviewQuality(transaction: admin.firestore.Transaction, assessment: admin.firestore.DocumentData, schoolId: string, id: string) {
  if (assessment.generatorProvider !== 'openai') return;
  const items = await transaction.get(admin.firestore().collection('assessmentItems').where('schoolId', '==', schoolId).where('weeklyAssessmentId', '==', id).where('generationVersion', '==', assessment.generationVersion).limit(101));
  if (!items.size || items.size > 100 || items.size !== assessment.itemCount) throw new functions.https.HttpsError('failed-precondition', 'Questions incomplètes : vérifier le brouillon.');
  const issues = assessmentMechanicalIssues(items.docs.map(item => item.data() as GeneratedAssessmentItem));
  if (issues.length) throw new functions.https.HttpsError('failed-precondition', 'Corriger les défauts détectés avant visa ou impression : ' + issues.join(', '));
}

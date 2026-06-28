import { NormalizedStudentRow, RowNormalizationResult } from './studentImportNormalizer';

export interface DiscoveryResult {
  creates: NormalizedStudentRow[];
  updates: NormalizedStudentRow[];
  skippedRows: any[]; // Appends internal duplicates to previously skipped rows
  summary: {
    totalRows: number;
    validRows: number;
    invalidRows: number;
    skippedRows: number;
    existingStudents: number;
    newStudents: number;
    updatedStudents: number;
  };
  quotaCheck: {
    passed: boolean;
    futureCount: number;
    limit: number;
  };
}

/**
 * Executes the Discovery (Pre-flight) phase.
 * Detects internal duplicates, queries Firestore for existing students by chunk,
 * classifies them into creates/updates, and checks quota.
 */
export async function runDiscovery(
  db: FirebaseFirestore.Firestore,
  normalizedData: RowNormalizationResult,
  currentStudentCount: number,
  studentLimit: number
): Promise<DiscoveryResult> {
  const result: DiscoveryResult = {
    creates: [],
    updates: [],
    skippedRows: [...normalizedData.skippedRows],
    summary: {
      totalRows: normalizedData.summary.total,
      validRows: 0,
      invalidRows: normalizedData.summary.invalid,
      skippedRows: normalizedData.summary.skipped,
      existingStudents: 0,
      newStudents: 0,
      updatedStudents: 0
    },
    quotaCheck: {
      passed: false,
      futureCount: 0,
      limit: studentLimit
    }
  };

  if (!normalizedData || !normalizedData.validRows || normalizedData.validRows.length === 0) {
    result.quotaCheck.passed = (currentStudentCount <= studentLimit);
    result.quotaCheck.futureCount = currentStudentCount;
    return result;
  }

  // 1. Detect internal duplicates
  const uniqueRows: NormalizedStudentRow[] = [];
  const seenIds = new Set<string>();

  for (const row of normalizedData.validRows) {
    if (seenIds.has(row.id)) {
      result.skippedRows.push({
        rowIndex: -1, // We don't have original index here unless we carry it over, but acceptable
        matricule: row.matricule,
        reason: 'DUPLICATE_IN_FILE'
      });
      result.summary.skippedRows++;
    } else {
      seenIds.add(row.id);
      uniqueRows.push(row);
    }
  }

  result.summary.validRows = uniqueRows.length;

  // 2. Firestore Discovery by chunks of 100
  const CHUNK_SIZE = 100;
  
  for (let i = 0; i < uniqueRows.length; i += CHUNK_SIZE) {
    const chunk = uniqueRows.slice(i, i + CHUNK_SIZE);
    
    // Build doc refs
    const docRefs = chunk.map(row => 
      db.collection('students').doc(row.id)
    );

    try {
      const snapshots = await db.getAll(...docRefs);

      for (let j = 0; j < snapshots.length; j++) {
        const snap = snapshots[j];
        const row = chunk[j];

        if (snap.exists) {
          result.updates.push(row);
          result.summary.updatedStudents++;
          result.summary.existingStudents++;
        } else {
          result.creates.push(row);
          result.summary.newStudents++;
        }
      }
    } catch (error) {
      throw new Error(`Erreur lors de la lecture Firestore (Discovery): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // 3. Quota check
  result.quotaCheck.futureCount = currentStudentCount + result.summary.newStudents;
  result.quotaCheck.passed = result.quotaCheck.futureCount <= studentLimit;

  return result;
}

import { query, collection, where, limit, Firestore } from 'firebase/firestore';
import { buildClassProgramQueryConstraints } from './classProgramQueryConstraints';

export function buildClassProgramQuery(
  db: Firestore,
  cleanSchoolId: string,
  cleanAcademicYearId: string,
  cleanClassId: string
) {
  const constraints = buildClassProgramQueryConstraints(cleanSchoolId, cleanAcademicYearId, cleanClassId);
  const collRef = collection(db, constraints.collectionName);
  return query(
    collRef,
    where(constraints.filters[0].field, '==', constraints.filters[0].val),
    where(constraints.filters[1].field, '==', constraints.filters[1].val),
    where(constraints.filters[2].field, '==', constraints.filters[2].val),
    limit(constraints.limitVal)
  );
}

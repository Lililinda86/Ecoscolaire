import { getDocs, limit, query, startAfter, type Query, type QueryDocumentSnapshot } from 'firebase/firestore';

/** Page reads, with an explicit error instead of presenting a truncated dataset. */
export async function readBoundedDocuments<T>(base: Query, maximum: number, label: string): Promise<T[]> {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 5000) throw new Error('Invalid query bound.');
  const result: T[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  for (;;) {
    const pageSize = Math.min(100, maximum - result.length + 1);
    const page = await getDocs(query(base, ...(cursor ? [startAfter(cursor)] : []), limit(pageSize)));
    if (result.length + page.size > maximum) throw new Error(`${label} : trop de documents. Affinez le périmètre ; aucun résultat tronqué n’est affiché.`);
    result.push(...page.docs.map(document => ({ ...document.data(), id: document.id } as T)));
    if (page.size < pageSize) return result;
    const next = page.docs[page.docs.length - 1];
    if (!next || next.id === cursor?.id) throw new Error('Pagination interrompue : curseur inchangé.');
    cursor = next;
  }
}

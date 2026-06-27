import { 
  increment, 
  DocumentReference,
  Transaction
} from 'firebase/firestore';

/**
 * P0-003: UTILITAIRES TRANSACTIONNELS (LOST UPDATE PROTECTION)
 * Ce fichier centralise les helpers garantissant l'atomicité et l'intégrité
 * des données en environnement multi-utilisateurs.
 *
 * Règles d'usage :
 * - utiliser `safeUpdate` pour la modification de paramètres d'un document existant.
 * - utiliser `runAtomicOperation` pour les opérations impliquant un read préalable.
 * - utiliser `safeIncrement` pour tous les compteurs absolus.
 */

// Placeholder pour l'implémentation future.
// Aucune migration métier n'est autorisée dans cette étape.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const safeUpdate = async (_ref: DocumentReference, _data: unknown) => {
  // A implémenter
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const runAtomicOperation = async (_operation: (transaction: Transaction) => Promise<void>) => {
  // A implémenter
};

export const safeIncrement = (value: number = 1) => {
  return increment(value);
};

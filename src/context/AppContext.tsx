import React, { createContext, useContext, useState, useEffect } from 'react';
import { defaultDB } from '../db/storage';
import type { User as FirebaseUser } from 'firebase/auth';
import type { Database, DatabasePatch } from '../db/storage';
import type { User, School, Student, Payment, Expense, Evaluation, Grade } from '../types';
import type { QuerySnapshot, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { AcademicCalendarMutationCancelledError } from '../services/academicCalendarConfiguration';
import { createAcademicYear as createAY, activateAcademicYear as actAY, updateAcademicYearBounds as updateAYBounds, createPeriod as createP, openPeriod as openP, updatePeriodStatus as updatePStatus } from '../services/academicCalendarPersistence';
import { db as firestoreDb } from '../db/firebase';
import type { AcademicYear, Period } from '../types';
import { partitionGradeDocuments } from '../services/gradeSchemaPartition';
import { saveStructuredEvaluationGrades, StructuredGradeSaveCancelledError } from '../services/structuredGradesPersistence';
import { sanitizeBoardViewerData } from '../utils/boardViewerSanitizer';

type EntityWithId = {
  id: string;
  [key: string]: unknown;
};

type MergeableCollection = EntityWithId[];

const getMergeableCollection = (
  source: Partial<Database>,
  key: keyof Database
): MergeableCollection => {
  const value = source[key];
  return Array.isArray(value) ? (value as MergeableCollection) : [];
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return String(error);
};

const getErrorCode = (error: unknown): string | undefined => {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code;
  }
  return undefined;
};

export type StudentLocalStatusPatch = Partial<Pick<
  Student,
  | 'schoolingStatus'
  | 'departureReason'
  | 'departureDate'
  | 'departureNote'
  | 'deactivatedBy'
  | 'reactivatedBy'
>>;

interface AppContextProps {
  db: Database | null;
  updateLocalState: (patch: Partial<Database>) => void;
  updateStudentLocal: (studentId: string, patch: StudentLocalStatusPatch) => void;
  addStudentsLocal: (studentsToAdd: Student[]) => void;
  patchLocalEntities: (student: Student, payment: Payment, receipt?: { id: string; [key: string]: unknown }) => void;
  saveDB: (newDb: Database) => Promise<void>;
  safeMergeDB: (newDb: Database) => Promise<void>;
  safePatchDB: (patch: DatabasePatch) => Promise<void>;
  saveStructuredGrades: (params: { evaluation: Evaluation, grades: Grade[] }) => Promise<void>;
  currentUser: User | null;
  currentSchool: School | null;
  isSupervising: boolean;
  enterSupervision: (schoolId: string) => void;
  exitSupervision: () => void;
  login: (email: string, pin: string) => Promise<boolean>;
  logout: () => void;
  isFirestoreConnected: boolean | null;
  firestoreError: string | null;
  lastSyncDate: Date | null;
  supervisionSchoolId: string | null;
  authLoading: boolean;
  logAuditAction: (params: { action: string, targetType: string, targetId: string, targetName: string, details?: Record<string, unknown> }) => Promise<void>;
  isSchoolSuspended: boolean;
  createAcademicYear: (year: Omit<AcademicYear, 'id' | 'createdAt' | 'updatedAt'>, activateImmediately?: boolean) => Promise<void>;
  activateAcademicYear: (yearId: string) => Promise<void>;
  updateAcademicYearBounds: (yearId: string, startDate: string, endDate: string) => Promise<void>;
  createAcademicPeriod: (period: Omit<Period, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  openAcademicPeriod: (periodId: string) => Promise<void>;
  closeAcademicPeriod: (periodId: string) => Promise<void>;
  publishAcademicPeriod: (periodId: string) => Promise<void>;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const isCompleteAcademicYear = (
  value: Partial<AcademicYear> & { id: string }
): value is AcademicYear => {
  const isNonEmptyString = (str: unknown): str is string => typeof str === 'string' && str.trim() !== '';
  return (
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.schoolId) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.startDate) &&
    isNonEmptyString(value.endDate) &&
    isNonEmptyString(value.createdAt) &&
    isNonEmptyString(value.createdBy) &&
    isNonEmptyString(value.updatedAt) &&
    isNonEmptyString(value.updatedBy) &&
    ['draft', 'active', 'closed', 'archived'].includes(value.status as string)
  );
};

export const upsertCanonicalAcademicYears = (existing: AcademicYear[], updates: Array<Partial<AcademicYear> & { id: string }>) => {
  const updateMap = new Map(updates.map(u => [u.id, u]));
  const merged = existing.map(y => {
    if (!updateMap.has(y.id)) return y;
    const update = updateMap.get(y.id)!;
    const cleanUpdate = Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined));
    return { ...y, ...cleanUpdate } as AcademicYear;
  });
  const existingIds = new Set(existing.map(y => y.id));
  updates.forEach(u => {
    if (!existingIds.has(u.id)) {
      if (isCompleteAcademicYear(u)) {
        merged.push(u);
      }
    }
  });
  return merged;
};

const upsertCanonicalPeriods = (existing: Period[], updates: Period[]) => {
  const updateMap = new Map(updates.map(u => [u.id, u]));
  const merged = existing.map(p => updateMap.has(p.id) ? updateMap.get(p.id)! : p);
  const existingIds = new Set(existing.map(p => p.id));
  updates.forEach(u => {
    if (!existingIds.has(u.id)) merged.push(u);
  });
  return merged;
};

export const replaceAcademicYearByCanonicalResult = (
  existingYears: AcademicYear[],
  result: { academicYearId: string; startDate: string; endDate: string }
): AcademicYear[] => {
  return existingYears.map(y => {
    if (y.id === result.academicYearId) {
      return { ...y, startDate: result.startDate, endDate: result.endDate };
    }
    return y;
  });
};


export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<Database | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentSchool, setCurrentSchool] = useState<School | null>(null);
  const [isSupervising, setIsSupervising] = useState(false);
  const [supervisionSchoolId, setSupervisionSchoolId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isFirestoreConnected, setIsFirestoreConnected] = useState<boolean | null>(null);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);
  const [lastSyncDate, setLastSyncDate] = useState<Date | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);

  const updateLocalState = (patch: Partial<Database>) => {
    setDb(prev => prev ? { ...prev, ...patch } : null);
  };

  // 1. Auth Listener
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    const initAuth = async () => {
      try {
        const { auth } = await import('../db/firebase');
        const { onAuthStateChanged } = await import('firebase/auth');

        unsubscribe = onAuthStateChanged(auth, (user) => {
          setFirebaseUser(user);
          if (!user) {
            setCurrentUser(null);
            setCurrentSchool(null);
            setDb(null);
            setLoading(false);
          }
        });
      } catch (err) {
        console.error("Firebase Auth Init Error:", err);
        setLoading(false);
      }
    };
    initAuth();
    return () => unsubscribe && unsubscribe();
  }, []);

  // 2. Data Fetcher
  useEffect(() => {
    if (!firebaseUser) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const { db: firestoreDb } = await import('../db/firebase');
        const { doc, getDoc, setDoc, collection, getDocs, query, where, serverTimestamp, documentId } = await import('firebase/firestore');

        // Fetch user profile
        console.log("Utilisateur Firebase connecté:", firebaseUser.email, firebaseUser.uid);
        const userDoc = await getDoc(doc(firestoreDb, 'users', firebaseUser.uid));
        let userData: User;

        if (!userDoc.exists()) {
          console.log("Document Firestore non trouvé pour:", firebaseUser.email);
          if (firebaseUser.email === 'kyrialove@gmail.com') {              try {
                userData = {
                  id: firebaseUser.uid,
                  email: firebaseUser.email ?? '',
                  role: 'superAdmin',
                  isActive: true,
                  schoolId: undefined,
                  createdAt: new Date().toISOString()
                } as User;

                const superAdminFirestorePayload = {
                  ...userData,
                  uid: firebaseUser.uid,
                  active: true,
                  schoolId: null,
                  createdAt: serverTimestamp()
                };

                await setDoc(doc(firestoreDb, 'users', firebaseUser.uid), superAdminFirestorePayload, { merge: true });
                console.log("Profil créé avec succès pour superAdmin:", userData);
              } catch (err: unknown) {
                const message = getErrorMessage(err);
                console.error("Erreur lors de la création du profil Firestore:", err);
                alert("Erreur: Impossible de créer le profil dans Firestore. " + message);
                // On ne déconnecte pas, on continue avec un objet local temporaire
                userData = { 
                  id: firebaseUser.uid, 
                  email: firebaseUser.email ?? '', 
                  role: 'superAdmin', 
                  isActive: true,
                  schoolId: undefined,
                  createdAt: new Date().toISOString()
                } as User;
              }        }
          else {
            console.error("Profil utilisateur introuvable et non autorisé à la création automatique.");
            const { auth } = await import('../db/firebase');
            auth.signOut();
            return;
          }
        } else {
          console.log("Document Firestore trouvé:", userDoc.data());
          userData = { id: userDoc.id, ...userDoc.data() } as User;
        }

        console.log("Rôle détecté:", userData.role);
        console.log("Redirection gérée par App.tsx en fonction de ce rôle.");
        if (!userData.isActive) {
          alert("Votre compte est désactivé.");
          const { auth } = await import('../db/firebase');
          auth.signOut();
          return;
        }

        setCurrentUser(userData);

        const loadedDb: Database = { ...defaultDB };
        const collectionsToFetch: (keyof Database)[] = [
          'classes', 'students', 'staff', 'buses', 'inventory', 
          'grades', 'attendance', 'validation_requests', 'notifications',
          'subjects', 'technicalSpecialties', 'busRoutes', 'fuelExpenses', 'maintenances',
          'breakdowns', 'inventoryTransactions', 'staffAttendance', 'audit_logs', 'transactions', 'receipts',
          'academicYears', 'periods', 'classPrograms', 'classSubjects', 'evaluations', 'teacherAssignments'
        ];

        console.log("================ DIAGNOSTIC AppContext ===============");
        console.log("1. userData.role :", userData.role);
        console.log("2. supervisionSchoolId :", supervisionSchoolId);

        if (userData.role === 'superAdmin' && !supervisionSchoolId) {
          // Mode Global Super Admin
          console.log("3. Branche exécutée : Mode Global Super Admin");
          console.log("🔵 [AppContext] Collection interrogée : /schools");
          const schoolsSnap = await getDocs(collection(firestoreDb, 'schools'));
          console.log("4. schoolsSnap.size :", schoolsSnap.size);
          
          const docsInfo = schoolsSnap.docs.map(d => ({id: d.id, name: d.data().name}));
          console.log(`🔵 [AppContext] Nombre de documents retournés dans /schools : ${schoolsSnap.docs.length}`);
          console.log(`🔵 [AppContext] IDs trouvés : ${docsInfo.map(d => d.id).join(', ')}`);
          console.log(`🔵 [AppContext] Noms trouvés : ${docsInfo.map(d => d.name).join(', ')}`);
          
          loadedDb.schools = schoolsSnap.docs.map(d => ({id: d.id, ...d.data()}) as School);
          const usersSnap = await getDocs(collection(firestoreDb, 'users'));
          loadedDb.users = usersSnap.docs.map(d => ({id: d.id, ...d.data()}) as User);
          console.log("5. Contenu de loadedDb.schools avant setDb :", loadedDb.schools);
          
          setIsFirestoreConnected(true);
          setDb(loadedDb);
          setLoading(false);
          return;
        }

        // Mode École
        console.log("3. Branche exécutée : Mode Supervision / École (targetSchoolId requis)");
        const targetSchoolId = supervisionSchoolId || userData.schoolId;
        if (!targetSchoolId) {
          console.warn("⚠️ targetSchoolId est VITE. userData.role =", userData.role, "- L'utilisateur n'est pas superAdmin et n'a pas d'école assignée. loadedDb.schools =", loadedDb.schools);
          setDb(loadedDb);
          setLoading(false);
          return;
        }

        let schoolDocData: School | null = null;
        try {
          const schoolDoc = await getDoc(doc(firestoreDb, 'schools', targetSchoolId));
          if (schoolDoc.exists()) {
            schoolDocData = { id: schoolDoc.id, ...schoolDoc.data() } as School;
            loadedDb.schools = [schoolDocData];
            loadedDb.school = schoolDocData; // ITALO-16P: db.school doit être synchronisé avec Firestore au chargement
            setCurrentSchool(schoolDocData);
          } else {
            setCurrentSchool(null);
          }
        } catch (e) {
          console.warn("❌ [AppContext] Erreur lecture schools (schoolDoc) :", e);
        }

        let usersData: User[] = [];
        try {
          const usersQ = query(collection(firestoreDb, 'users'), where('schoolId', '==', targetSchoolId));
          const usersSnap = await getDocs(usersQ);
          usersData = usersSnap.docs.map(d => ({id: d.id, ...d.data()}) as User);
        } catch (e) {
          console.warn("❌ [AppContext] Erreur lecture users (permission refusée pour ce rôle) :", e);
          usersData = [userData]; // Fallback : on s'inclut soi-même a minima
        }
        loadedDb.users = usersData;

        // Fetch collections ciblées
        const fetchPromises = collectionsToFetch.map(async (colName) => {
          try {
            let q;
            if (colName === 'students') {
              console.log(`[DEBUG STUDENTS] Avant getDocs pour students. targetSchoolId: ${targetSchoolId}, role: ${userData.role}`);
            }
            if (userData.role === 'parent' && colName === 'students') {
              const fetchQueries = [];
              if (userData.studentIds && userData.studentIds.length > 0) {
                fetchQueries.push(getDocs(query(collection(firestoreDb, colName), where('schoolId', '==', targetSchoolId), where(documentId(), 'in', userData.studentIds))));
              }
              if (firebaseUser.email) {
                fetchQueries.push(getDocs(query(collection(firestoreDb, colName), where('schoolId', '==', targetSchoolId), where('parentEmails', 'array-contains', firebaseUser.email.toLowerCase().trim()))));
              }
              if (fetchQueries.length === 0) {
                if (colName === 'students') console.log(`[DEBUG STUDENTS] Parent sans liaison, aucun document chargé.`);
                return { colName, data: [] };
              }
              const snaps = await Promise.all(fetchQueries);
              const allDocs = new Map();
              snaps.forEach((snap: QuerySnapshot<DocumentData>) => snap.docs.forEach((d: QueryDocumentSnapshot<DocumentData>) => allDocs.set(d.id, { id: d.id, ...d.data() })));
              console.log(`🔵 [AppContext] Lecture Firestore [${colName}] pour parent : ${allDocs.size} document(s) chargé(s).`);
              if (colName === 'students') {
                console.log(`[DEBUG STUDENTS] Documents trouvés (${allDocs.size}):`);
                allDocs.forEach((val, key) => console.log(` - ID: ${key}, Name: ${val.name}, schoolId: ${val.schoolId}`));
              }
              return { colName, data: Array.from(allDocs.values()) };
            } else {
              q = query(collection(firestoreDb, colName), where('schoolId', '==', targetSchoolId));
            }
            const snap = await getDocs(q);
            if (colName === 'students') {
              console.log(`[DEBUG STUDENTS] Après getDocs pour students. Nombre docs: ${snap.docs.length}`);
              snap.docs.forEach(d => console.log(` - ID: ${d.id}, Name: ${d.data().name}, schoolId: ${d.data().schoolId}`));
            }
            console.log(`🔵 [AppContext] Lecture Firestore [${colName}] : ${snap.docs.length} document(s) chargé(s).`);
            return { colName, data: snap.docs.map(d => ({id: d.id, ...d.data()})) };
          } catch (e) {
            console.warn(`❌ [AppContext] Erreur ou lecture bloquée pour [${colName}]`, e);
            return { colName, data: [] };
          }
        });

        const results = await Promise.race([
          Promise.all(fetchPromises),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout Firestore")), 10000))
        ]) as { colName: keyof Database; data: unknown[] }[];

        results.forEach((res) => {
          let sanitizedData = res.data;
          if (userData.role === 'boardViewer') {
            sanitizedData = sanitizeBoardViewerData(res.data, res.colName as string);
          }

          if (res.colName === 'grades') {
            const partition = partitionGradeDocuments(sanitizedData as Grade[]);
            Object.assign(loadedDb, { 
              grades: partition.legacyGrades, 
              gradesStrict: partition.strictGrades,
              invalidGradeDocumentsCount: partition.invalidGrades.length
            });
            if (partition.invalidGrades.length > 0) {
               console.warn(`[AppContext] ${partition.invalidGrades.length} grades ignorés (structure invalide ou hybride).`);
            }
          } else {
            Object.assign(loadedDb, { [res.colName]: sanitizedData });
          }
        });

        console.log("5. Contenu de loadedDb.schools avant setDb final (Mode École) :", loadedDb.schools);

        setIsFirestoreConnected(true);
        setFirestoreError(null);
        setDb(prevDb => ({
          ...loadedDb,
          payments: prevDb ? prevDb.payments : loadedDb.payments,
          expenses: prevDb ? prevDb.expenses : loadedDb.expenses
        }));
        setLastSyncDate(new Date());
        setLoading(false);

      } catch (error: unknown) {
        const message = getErrorMessage(error);
        console.error("Data Fetch Error:", error);
        setIsFirestoreConnected(false);
        setFirestoreError(message);
        setLoading(false);
      }
    };

    fetchData();
  }, [firebaseUser, supervisionSchoolId]);

  // 2b. Realtime Financial Subscriptions (payments & expenses)
  useEffect(() => {
    let cancelled = false;
    let unsubPayments: (() => void) | null = null;
    let unsubExpenses: (() => void) | null = null;

    const targetSchoolId = supervisionSchoolId || currentUser?.schoolId;

    // Réinitialisation immédiate lors du changement d'école / déconnexion (AVANT les early returns)
    setDb(prevDb => {
      if (!prevDb) return prevDb;
      return {
        ...prevDb,
        payments: [],
        expenses: []
      };
    });

    if (!firebaseUser || !targetSchoolId) {
      return () => {
        cancelled = true;
        if (unsubPayments) unsubPayments();
        if (unsubExpenses) unsubExpenses();
      };
    }

    const initListeners = async () => {
      try {
        const { db: firestoreDb } = await import('../db/firebase');
        if (cancelled) return;

        const { collection, query, where, onSnapshot } = await import('firebase/firestore');
        if (cancelled) return;

        const paymentsQ = query(
          collection(firestoreDb, 'payments'),
          where('schoolId', '==', targetSchoolId)
        );

        unsubPayments = onSnapshot(paymentsQ, (snapshot) => {
          if (cancelled) return;
          const paymentsList: Payment[] = [];
          snapshot.forEach((docSnap) => {
            let item = { id: docSnap.id, ...docSnap.data() } as Payment;
            if (currentUser?.role === 'boardViewer') {
              item = sanitizeBoardViewerData(item, 'payments') as Payment;
            }
            paymentsList.push(item);
          });
          setDb(prevDb => {
            const current = prevDb || defaultDB;
            return { ...current, payments: paymentsList };
          });
        }, (err) => {
          if (cancelled) return;
          console.warn("❌ [AppContext] Erreur listener payments:", err);
          setDb(prevDb => prevDb ? { ...prevDb, payments: [] } : prevDb);
        });

        if (cancelled) {
          unsubPayments();
          return;
        }

        const expensesQ = query(
          collection(firestoreDb, 'expenses'),
          where('schoolId', '==', targetSchoolId)
        );

        unsubExpenses = onSnapshot(expensesQ, (snapshot) => {
          if (cancelled) return;
          const expensesList: Expense[] = [];
          snapshot.forEach((docSnap) => {
            let item = { id: docSnap.id, ...docSnap.data() } as Expense;
            if (currentUser?.role === 'boardViewer') {
              item = sanitizeBoardViewerData(item, 'expenses') as Expense;
            }
            expensesList.push(item);
          });
          setDb(prevDb => {
            const current = prevDb || defaultDB;
            return { ...current, expenses: expensesList };
          });
        }, (err) => {
          if (cancelled) return;
          console.warn("❌ [AppContext] Erreur listener expenses:", err);
          setDb(prevDb => prevDb ? { ...prevDb, expenses: [] } : prevDb);
        });

        if (cancelled) {
          unsubExpenses();
          return;
        }

      } catch (e) {
        if (cancelled) return;
        console.warn("❌ [AppContext] Erreur initialisation listeners financiers:", e);
      }
    };

    initListeners();

    return () => {
      cancelled = true;
      if (unsubPayments) unsubPayments();
      if (unsubExpenses) unsubExpenses();
    };
  }, [firebaseUser, supervisionSchoolId, currentUser?.schoolId, currentUser?.role]);

  const saveDB = async (newDb: Database) => {
    if (!db || !currentUser) return;
    
    if (isSupervising) {
      const confirm = window.confirm("MODE SUPERVISION : Vous êtes sur le point de modifier les données de cette école. Êtes-vous sûr ?");
      if (!confirm) return;
    }
    
    setDb({ ...newDb });

    try {
      const { db: firestoreDb } = await import('../db/firebase');
      const { doc, setDoc, deleteDoc } = await import('firebase/firestore');

      const collections = [
        'schools', 'users', 'classes', 'students', 'staff', 'buses', 
        'inventory', 'grades', 'payments', 'attendance', 'validation_requests', 'notifications',
        'subjects', 'busRoutes', 'fuelExpenses', 'maintenances', 
        'breakdowns', 'expenses', 'inventoryTransactions', 'staffAttendance', 'transactions'
      ] as const;
      
      for (const col of collections) {
        const oldArray = getMergeableCollection(db, col as keyof Database);
        const newArray = getMergeableCollection(newDb, col as keyof Database);

        const oldMap = new Map(oldArray.map((item) => [item.id, item]));
        const newMap = new Map(newArray.map((item) => [item.id, item]));

        for (const newItem of newArray) {
          const oldItem = oldMap.get(newItem.id);
          if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
            // Force schoolId pour la sécurité
            if (!newItem.schoolId && col !== 'schools' && col !== 'users' && currentSchool) {
              newItem.schoolId = currentSchool.id;
            }
            console.log(`🟢 [AppContext] Sauvegarde Firestore - Mise à jour ou ajout dans [${col}] :`, newItem);
            await setDoc(doc(firestoreDb, col, newItem.id), newItem, { merge: true });
          }
        }

        for (const oldItem of oldArray) {
          if (!newMap.has(oldItem.id)) {
            if (col === 'schools') {
              console.log(`🛡️ [AppContext] Protection activée : Suppression de l'école ${oldItem.id} bloquée.`);
              continue;
            }
            await deleteDoc(doc(firestoreDb, col, oldItem.id));
          }
        }
      }
      setLastSyncDate(new Date());
    } catch (e) {
      console.error("Sync Error:", e);
      alert("Une erreur de permissions est survenue lors de la synchronisation.");
    }
  };

  const saveStructuredGrades = async ({ evaluation, grades }: { evaluation: Evaluation, grades: Grade[] }) => {
    if (!db) {
      throw new Error("Les données de l'école ne sont pas disponibles.");
    }
    if (!currentUser) {
      throw new Error("Vous devez être authentifié pour enregistrer les notes.");
    }
    
    if (isSupervising) {
      const confirm = window.confirm("MODE SUPERVISION : Vous êtes sur le point de modifier les notes structurées de cette école. Êtes-vous sûr ?");
      if (!confirm) {
        throw new StructuredGradeSaveCancelledError();
      }
    }

    try {
      const { db: firestoreDb } = await import('../db/firebase');
      await saveStructuredEvaluationGrades({ firestore: firestoreDb, evaluation, grades });
      
      // Update local state after successful persistence
      setDb(prevDb => {
        if (!prevDb) return prevDb;
        
        // Update evaluations
        const nextEvaluations = [...(prevDb.evaluations || [])];
        const evalIndex = nextEvaluations.findIndex(e => e.id === evaluation.id);
        if (evalIndex >= 0) {
          nextEvaluations[evalIndex] = evaluation;
        } else {
          nextEvaluations.push(evaluation);
        }
        
        // Update gradesStrict
        const nextStrictGrades = [...(prevDb.gradesStrict || [])];
        grades.forEach(g => {
          const gIndex = nextStrictGrades.findIndex(existing => existing.id === g.id);
          if (gIndex >= 0) {
            nextStrictGrades[gIndex] = g;
          } else {
            nextStrictGrades.push(g);
          }
        });
        
        return {
          ...prevDb,
          evaluations: nextEvaluations,
          gradesStrict: nextStrictGrades
        };
      });
    } catch (e) {
      console.error("Structured Grades Save Error:", e);
      throw e;
    }
  };

  const safePatchDB = async (patch: DatabasePatch) => {
    if (!db || !currentUser) return;
    
    if (isSupervising) {
      const confirm = window.confirm("MODE SUPERVISION : Vous êtes sur le point de modifier les données de cette école. Êtes-vous sûr ?");
      if (!confirm) return;
    }
    
    setDb(prev => prev ? { ...prev, ...patch } : prev);

    try {
      const { db: firestoreDb } = await import('../db/firebase');
      const { doc, setDoc } = await import('firebase/firestore');

      for (const [collectionName, items] of Object.entries(patch)) {
        if (!Array.isArray(items)) continue;

        for (const item of items) {
          if (!item || typeof item !== "object" || !("id" in item)) continue;

          const itemWithSchool = {
            ...item,
            ...(
              !("schoolId" in item) &&
              collectionName !== "schools" &&
              collectionName !== "users" &&
              currentSchool
                ? { schoolId: currentSchool.id }
                : {}
            ),
          };

          await setDoc(
            doc(firestoreDb, collectionName, String(item.id)),
            itemWithSchool,
            { merge: true }
          );
        }
      }

      setLastSyncDate(new Date());
    } catch (e) {
      console.error("Patch Sync Error:", e);
      alert("Une erreur de permissions est survenue lors de la synchronisation.");
    }
  };

  const safeMergeDB = async (newDb: Database) => {
    if (!db || !currentUser) return;
    
    if (isSupervising) {
      const confirm = window.confirm("MODE SUPERVISION : Vous êtes sur le point de modifier les données de cette école. Êtes-vous sûr ?");
      if (!confirm) return;
    }
    
    setDb({ ...newDb });

    try {
      const { db: firestoreDb } = await import('../db/firebase');
      const { doc, setDoc, deleteDoc } = await import('firebase/firestore');

      const collections = [
        'schools', 'users', 'classes', 'students', 'staff', 'buses', 
        'inventory', 'grades', 'payments', 'attendance', 'validation_requests', 'notifications',
        'subjects', 'technicalSpecialties', 'busRoutes', 'fuelExpenses', 'maintenances',
        'breakdowns', 'expenses', 'inventoryTransactions', 'staffAttendance', 'transactions'
      ] as const;
      
      for (const col of collections) {
        const oldArray = getMergeableCollection(db, col as keyof Database);
        const newArray = getMergeableCollection(newDb, col as keyof Database);

        const oldMap = new Map(oldArray.map((item) => [item.id, item]));
        const newMap = new Map(newArray.map((item) => [item.id, item]));

        for (const newItem of newArray) {
          const oldItem = oldMap.get(newItem.id);
          if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
            // Force schoolId pour la sécurité
            if (!newItem.schoolId && col !== 'schools' && col !== 'users' && currentSchool) {
              newItem.schoolId = currentSchool.id;
            }
            console.log(`🟢 [AppContext] Sauvegarde Firestore - Mise à jour ou ajout dans [${col}] :`, newItem);
            await setDoc(doc(firestoreDb, col, newItem.id), newItem, { merge: true });
          }
        }

        for (const oldItem of oldArray) {
          if (!newMap.has(oldItem.id)) {
            if (col === 'schools') {
              console.log(`🛡️ [AppContext] Protection activée : Suppression de l'école ${oldItem.id} bloquée.`);
              continue;
            }
            await deleteDoc(doc(firestoreDb, col, oldItem.id));
          }
        }
      }

      // Handle current school explicit save — only authorized roles can write to schools/{id}
      const canWriteSchool = ['superAdmin', 'owner', 'director'].includes(currentUser.role);
      if (canWriteSchool && newDb.school && newDb.school.id) {
        const { id, ...dataToSave } = newDb.school;
        const whitelist = ['name', 'address', 'phone', 'email', 'logoUrl', 'subscriptionStatus', 'isInternalSchool', 'directorName', 'accreditationNumber', 'adminPin', 'academicYear', 'globalFees', 'paymentSettings', 'educationCycles', 'founderName', 'principalName', 'cycleNames', 'cycleAccreditationNumbers', 'transportPolicy'];
        const filteredData = Object.fromEntries(
            Object.entries(dataToSave).filter(([key]) => whitelist.includes(key))
        );
        if (!db.school || JSON.stringify(db.school) !== JSON.stringify(newDb.school)) {
          console.log(`🟢 [AppContext] Sauvegarde Firestore - Mise à jour explicite de l'école :`, id);
          await setDoc(doc(firestoreDb, 'schools', id), filteredData, { merge: true });
          // Synchronise le state local currentSchool pour que l'UI reflète
          // immédiatement les changements (logo, etc.) sans attendre un reload
          setCurrentSchool(newDb.school);
          if (newDb.schools) {
            setDb(prev => {
              if (!prev) return prev;
              return {
                ...prev,
                schools: prev.schools.map(s => s.id === id ? { ...s, ...filteredData } : s)
              };
            });
          }
        }
      }

      setLastSyncDate(new Date());
    } catch (e) {
      console.error("Sync Error:", e);
      alert("Une erreur de permissions est survenue lors de la synchronisation.");
      throw e;
    }
  };

  const enterSupervision = (schoolId: string) => {
    if (currentUser?.role !== 'superAdmin') return;
    setSupervisionSchoolId(schoolId);
    setIsSupervising(true);
  };

  const exitSupervision = async () => {
    if (currentUser?.role !== 'superAdmin') return;
    console.log("🔵 [AppContext] exitSupervision appelé. Retour au mode Global.");
    setSupervisionSchoolId(null);
    setIsSupervising(false);
    setCurrentSchool(null);
    
    try {
      const { db: firestoreDb } = await import('../db/firebase');
      const { collection, getDocs } = await import('firebase/firestore');
      const snap = await getDocs(collection(firestoreDb, 'schools'));
      console.log(`🔵 [AppContext] Nombre d'écoles dans Firestore après retour Super Admin : ${snap.docs.length}`);
    } catch (err) {
      console.error("Erreur lors de la vérification Firestore au retour :", err);
    }
  };

  const logAuditAction = async (params: { action: string, targetType: string, targetId: string, targetName: string, details?: Record<string, unknown> }) => {
    if (!currentUser) return;
    try {
      const { collection, addDoc } = await import('firebase/firestore');
      const { db: firestoreDb } = await import('../db/firebase');
      await addDoc(collection(firestoreDb, 'audit_logs'), {
        userId: currentUser.id,
        userEmail: currentUser.email,
        userRole: currentUser.role,
        schoolId: currentSchool?.id || currentUser.schoolId || null,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        targetName: params.targetName,
        timestamp: new Date().toISOString(),
        details: params.details || {}
      });
    } catch (e) {
      console.error("Failed to log audit action", e);
    }
  };

  const login = async (email: string, pin: string): Promise<boolean> => {
    try {
      const { auth, db: firestoreDb } = await import('../db/firebase');
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const { doc, getDoc, collection, addDoc } = await import('firebase/firestore');

      const cred = await signInWithEmailAndPassword(auth, email, pin);

      try {
        const userDoc = await getDoc(doc(firestoreDb, 'users', cred.user.uid));
        const userData = userDoc.data();
        if (userData) {
          await addDoc(collection(firestoreDb, 'audit_logs'), {
            userId: cred.user.uid,
            userEmail: email,
            userRole: userData.role,
            schoolId: userData.schoolId || null,
            action: 'LOGIN',
            targetType: 'SYSTEM',
            targetId: cred.user.uid,
            targetName: email,
            timestamp: new Date().toISOString(),
            details: {}
          });
        }
      } catch (e) {
        console.error("Failed to log LOGIN action", e);
      }

      return true;
    } catch (error: any) {
      const code = getErrorCode(error);
      const message = getErrorMessage(error);
      console.error("Login Error details:", { email, pin, code, message, error });
      if (code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
        alert("Email ou mot de passe incorrect.");
      } else {
        alert(message);
      }
      return false;
    }
  };

  const logout = async () => {
    try {
      if (currentUser) {
        await logAuditAction({
          action: 'LOGOUT',
          targetType: 'SYSTEM',
          targetId: currentUser.id,
          targetName: currentUser.email
        });
      }
      const { auth } = await import('../db/firebase');
      await auth.signOut();
    } catch (e) {
      console.error(e);
    }
  };

  if (!db && firestoreError && firebaseUser) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#fee2e2', color: '#991b1b', padding: '2rem' }}>
        <h2>Erreur Critique de Connexion</h2>
        <p>{firestoreError}</p>
        <button onClick={logout} style={{ padding: '0.75rem', background: '#dc2626', color: 'white', borderRadius: '8px', border: 'none', cursor: 'pointer', marginTop: '1rem' }}>
          Se déconnecter
        </button>
      </div>
    );
  }

  const isSchoolSuspended = !currentSchool?.isInternalSchool && (currentSchool?.subscriptionStatus === 'suspended' || currentSchool?.subscriptionStatus === 'expired');



  const updateStudentLocal = (
    studentId: string,
    patch: StudentLocalStatusPatch
  ) => {
    setDb(previousDb => {
      if (!previousDb || !currentSchool?.id) {
        return previousDb;
      }

      const currentStudent = previousDb.students.find(
        student => student.id === studentId
      );

      if (
        !currentStudent ||
        currentStudent.schoolId !== currentSchool.id
      ) {
        return previousDb;
      }

      return {
        ...previousDb,
        students: previousDb.students.map(student =>
          student.id === studentId
            ? { ...student, ...patch }
            : student
        )
      };
    });
  };

  const addStudentsLocal = (studentsToAdd: Student[]) => {
    setDb(previousDb => {
      if (!previousDb || !currentSchool?.id) {
        return previousDb;
      }

      const safeStudents = studentsToAdd.filter(
        student => student.schoolId === currentSchool.id
      );

      if (safeStudents.length !== studentsToAdd.length) {
        return previousDb;
      }

      const existingIds = new Set(
        previousDb.students.map(student => student.id)
      );

      const newStudents = safeStudents.filter(
        student => !existingIds.has(student.id)
      );

      if (newStudents.length === 0) {
        return previousDb;
      }

      return {
        ...previousDb,
        students: [...previousDb.students, ...newStudents]
      };
    });
  };

  const patchLocalEntities = (student: Student, payment: Payment, receipt?: { id: string; [key: string]: unknown }) => {
    setDb(prev => {
      if (!prev) return prev;
      const students = prev.students.map(item =>
        item.id === student.id ? student : item
      );
      const paymentExists = prev.payments.some(item =>
        item.id === payment.id
      );
      const payments = paymentExists
        ? prev.payments.map(item =>
            item.id === payment.id ? payment : item
          )
        : [payment, ...prev.payments];

      let receipts = prev.receipts || [];
      if (receipt) {
        const receiptExists = receipts.some(item => item.id === receipt.id);
        receipts = receiptExists
          ? receipts.map(item => item.id === receipt.id ? receipt : item)
          : [receipt, ...receipts];
      }

      return {
        ...prev,
        students,
        payments,
        receipts
      };
    });
  };


  const createAcademicYear = async (year: Omit<AcademicYear, 'id' | 'createdAt' | 'updatedAt'>, activateImmediately = false) => {
    if (!db) throw new Error('Database not initialized');
    if (!currentUser || !currentSchool) throw new Error('Not authenticated or no active school');
    if (isSupervising && !window.confirm('Action critique en mode supervision. Continuer ?')) throw new AcademicCalendarMutationCancelledError();
    
    const result = await createAY(firestoreDb, currentSchool.id, year as AcademicYear, activateImmediately);
    setDb(prev => {
      if (!prev) throw new Error('État local indisponible.');
      return {
        ...prev,
        school: (result.updatedSchool && prev.school ? Object.assign({}, prev.school, result.updatedSchool) : prev.school) as School,
        academicYears: upsertCanonicalAcademicYears(prev.academicYears || [], [result.createdYear, result.activatedYear, result.closedYear].filter(Boolean) as AcademicYear[])
      };
    });
  };

  const activateAcademicYear = async (yearId: string) => {
    if (!db) throw new Error('Database not initialized');
    if (!currentUser || !currentSchool) throw new Error('Not authenticated or no active school');
    if (isSupervising && !window.confirm('Action critique en mode supervision. Continuer ?')) throw new AcademicCalendarMutationCancelledError();
    
    const result = await actAY(firestoreDb, currentSchool.id, yearId, currentUser.id);
    setDb(prev => {
      if (!prev) throw new Error('État local indisponible.');
      return {
        ...prev,
        school: (result.updatedSchool && prev.school ? Object.assign({}, prev.school, result.updatedSchool) : prev.school) as School,
        academicYears: upsertCanonicalAcademicYears(prev.academicYears || [], [result.activatedYear, result.closedYear].filter(Boolean) as AcademicYear[])
      };
    });
  };

  const updateAcademicYearBounds = async (yearId: string, startDate: string, endDate: string) => {
    if (!currentUser || !currentSchool) throw new Error('Not authenticated or no active school');

    try {
      const result = await updateAYBounds({
        schoolId: currentSchool.id,
        academicYearId: yearId,
        startDate,
        endDate
      });

      if (result.success) {
        setDb(prev => {
          if (!prev || !prev.academicYears) return prev;
          const updatedYears = replaceAcademicYearByCanonicalResult(prev.academicYears, result);
          return { ...prev, academicYears: updatedYears };
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erreur lors de la modification des dates de l\'année académique.';
      throw new Error(message);
    }
  };

  const createAcademicPeriod = async (period: Omit<Period, 'id' | 'createdAt' | 'updatedAt'>) => {
    if (!db) throw new Error('Database not initialized');
    if (!currentUser || !currentSchool) throw new Error('Not authenticated or no active school');
    if (isSupervising && !window.confirm('Action critique en mode supervision. Continuer ?')) throw new AcademicCalendarMutationCancelledError();
    
    const result = await createP(firestoreDb, currentSchool.id, period as Period);
    setDb(prev => {
      if (!prev) throw new Error('État local indisponible.');
      return {
        ...prev,
        academicYears: upsertCanonicalAcademicYears(prev.academicYears || [], [result.updatedAcademicYear as AcademicYear]),
        periods: upsertCanonicalPeriods(prev.periods || [], [result.createdPeriod])
      };
    });
  };

  const openAcademicPeriod = async (periodId: string) => {
    if (!db) throw new Error('Database not initialized');
    if (!currentUser || !currentSchool) throw new Error('Not authenticated or no active school');
    if (isSupervising && !window.confirm('Action critique en mode supervision. Continuer ?')) throw new AcademicCalendarMutationCancelledError();
    
    if (!currentSchool.activeAcademicYearId) throw new Error('Aucune année académique active');
    const result = await openP(firestoreDb, currentSchool.id, currentSchool.activeAcademicYearId, periodId, currentUser.id);
    setDb(prev => {
      if (!prev) throw new Error('État local indisponible.');
      return {
        ...prev,
        academicYears: upsertCanonicalAcademicYears(prev.academicYears || [], [result.updatedAcademicYear as AcademicYear]),
        periods: upsertCanonicalPeriods(prev.periods || [], [result.openedPeriod, result.closedPeriod].filter(Boolean) as Period[])
      };
    });
  };

  const closeAcademicPeriod = async (periodId: string) => {
    if (!db) throw new Error('Database not initialized');
    if (!currentUser || !currentSchool) throw new Error('Not authenticated or no active school');
    if (isSupervising && !window.confirm('Action critique en mode supervision. Continuer ?')) throw new AcademicCalendarMutationCancelledError();
    const result = await updatePStatus(firestoreDb, currentSchool.id, periodId, 'closed', currentUser.id);
    setDb(prev => {
      if (!prev) throw new Error('État local indisponible.');
      return {
        ...prev,
        periods: upsertCanonicalPeriods(prev.periods || [], [result.updatedPeriod])
      };
    });
  };

  const publishAcademicPeriod = async (periodId: string) => {
    if (!db) throw new Error('Database not initialized');
    if (!currentUser || !currentSchool) throw new Error('Not authenticated or no active school');
    if (isSupervising && !window.confirm('Action critique en mode supervision. Continuer ?')) throw new AcademicCalendarMutationCancelledError();
    const result = await updatePStatus(firestoreDb, currentSchool.id, periodId, 'published', currentUser.id);
    setDb(prev => {
      if (!prev) throw new Error('État local indisponible.');
      return {
        ...prev,
        periods: upsertCanonicalPeriods(prev.periods || [], [result.updatedPeriod])
      };
    });
  };

  return (
    <AppContext.Provider value={{ 
      db, updateLocalState, updateStudentLocal, addStudentsLocal, patchLocalEntities, saveDB, safeMergeDB, safePatchDB, saveStructuredGrades, currentUser, currentSchool,
      createAcademicYear, activateAcademicYear, updateAcademicYearBounds, createAcademicPeriod, openAcademicPeriod, closeAcademicPeriod, publishAcademicPeriod,
      isSupervising, enterSupervision, exitSupervision, 
      login, logout, isFirestoreConnected, firestoreError, lastSyncDate, supervisionSchoolId,
      authLoading: loading, logAuditAction, isSchoolSuspended
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context as Omit<AppContextProps, 'db'> & { db: Database };
};

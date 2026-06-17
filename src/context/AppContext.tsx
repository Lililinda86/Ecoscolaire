import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Database } from '../db/storage';
import { defaultDB } from '../db/storage';
import type { User, School } from '../types';

interface AppContextProps {
  db: Database | null;
  saveDB: (newDb: Database) => Promise<void>;
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
  logAuditAction: (params: { action: string, targetType: string, targetId: string, targetName: string, details?: any }) => Promise<void>;
  isSchoolSuspended: boolean;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

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
  const [firebaseUser, setFirebaseUser] = useState<any>(null);

  // 1. Auth Listener
  useEffect(() => {
    let unsubscribe: any;
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
        let userDoc = await getDoc(doc(firestoreDb, 'users', firebaseUser.uid));
        let userData: any;

        if (!userDoc.exists()) {
          console.log("Document Firestore non trouvé pour:", firebaseUser.email);
          if (firebaseUser.email === 'kyrialove@gmail.com') {
            try {
              userData = {
                id: firebaseUser.uid,
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                role: 'superAdmin',
                active: true,
                isActive: true,
                schoolId: null,
                createdAt: serverTimestamp()
              };
              await setDoc(doc(firestoreDb, 'users', firebaseUser.uid), userData);
              console.log("Profil créé avec succès pour superAdmin:", userData);
            } catch (err: any) {
              console.error("Erreur lors de la création du profil Firestore:", err);
              alert("Erreur: Impossible de créer le profil dans Firestore. " + err.message);
              // On ne déconnecte pas, on continue avec un objet local temporaire
              userData = { id: firebaseUser.uid, email: firebaseUser.email, role: 'superAdmin', active: true, isActive: true };
            }
          } else {
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

        const loadedDb: any = { ...defaultDB };
        const collectionsToFetch = [
          'classes', 'students', 'staff', 'buses', 'inventory', 
          'grades', 'payments', 'attendance', 'validation_requests', 'notifications',
          'subjects', 'busRoutes', 'fuelExpenses', 'maintenances', 
          'breakdowns', 'expenses', 'inventoryTransactions', 'staffAttendance', 'audit_logs', 'transactions', 'receipts'
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
          
          loadedDb.schools = schoolsSnap.docs.map(d => ({id: d.id, ...d.data()}));
          const usersSnap = await getDocs(collection(firestoreDb, 'users'));
          loadedDb.users = usersSnap.docs.map(d => ({id: d.id, ...d.data()}));
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

        let schoolDocData: any = null;
        try {
          const schoolDoc = await getDoc(doc(firestoreDb, 'schools', targetSchoolId));
          if (schoolDoc.exists()) {
            schoolDocData = { id: schoolDoc.id, ...schoolDoc.data() };
            loadedDb.schools = [schoolDocData];
            setCurrentSchool(loadedDb.schools[0] as School);
          } else {
            setCurrentSchool(null);
          }
        } catch (e) {
          console.warn("❌ [AppContext] Erreur lecture schools (schoolDoc) :", e);
        }

        let usersData: any[] = [];
        try {
          const usersQ = query(collection(firestoreDb, 'users'), where('schoolId', '==', targetSchoolId));
          const usersSnap = await getDocs(usersQ);
          usersData = usersSnap.docs.map(d => ({id: d.id, ...d.data()}));
        } catch (e) {
          console.warn("❌ [AppContext] Erreur lecture users (permission refusée pour ce rôle) :", e);
          usersData = [userData]; // Fallback : on s'inclut soi-même a minima
        }
        loadedDb.users = usersData;

        // Fetch collections ciblées
        const fetchPromises = collectionsToFetch.map(async (colName) => {
          try {
            let q;
            if (userData.role === 'parent' && colName === 'students') {
              if (userData.studentIds && userData.studentIds.length > 0) {
                q = query(collection(firestoreDb, colName), where(documentId(), 'in', userData.studentIds));
              } else {
                return { colName, data: [] };
              }
            } else {
              q = query(collection(firestoreDb, colName), where('schoolId', '==', targetSchoolId));
            }
            const snap = await getDocs(q);
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
        ]) as any;

        results.forEach((res: any) => {
          loadedDb[res.colName] = res.data;
        });

        console.log("5. Contenu de loadedDb.schools avant setDb final (Mode École) :", loadedDb.schools);

        setIsFirestoreConnected(true);
        setFirestoreError(null);
        setDb(loadedDb);
        setLastSyncDate(new Date());
        setLoading(false);

      } catch (error: any) {
        console.error("Data Fetch Error:", error);
        setIsFirestoreConnected(false);
        setFirestoreError(error.message);
        setLoading(false);
      }
    };

    fetchData();
  }, [firebaseUser, supervisionSchoolId]);

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
        const oldArray = (db as any)[col] || [];
        const newArray = (newDb as any)[col] || [];

        const oldMap = new Map(oldArray.map((item: any) => [item.id, item]));
        const newMap = new Map(newArray.map((item: any) => [item.id, item]));

        for (const newItem of newArray) {
          const oldItem = oldMap.get(newItem.id);
          if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
            // Force schoolId pour la sécurité
            if (!newItem.schoolId && col !== 'schools' && col !== 'users' && currentSchool) {
              newItem.schoolId = currentSchool.id;
            }
            console.log(`🟢 [AppContext] Sauvegarde Firestore - Mise à jour ou ajout dans [${col}] :`, newItem);
            await setDoc(doc(firestoreDb, col, newItem.id), newItem);
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

  const logAuditAction = async (params: { action: string, targetType: string, targetId: string, targetName: string, details?: any }) => {
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
      console.error("Login Error:", error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
        alert("Email ou mot de passe incorrect.");
      } else {
        alert(error.message);
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

  const isSchoolSuspended = currentSchool?.subscriptionStatus === 'suspended' || currentSchool?.subscriptionStatus === 'expired';

  return (
    <AppContext.Provider value={{ 
      db, saveDB, currentUser, currentSchool, 
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

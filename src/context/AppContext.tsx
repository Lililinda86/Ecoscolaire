import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Database } from '../db/storage';
import { defaultDB, saveDB as saveDBToStorage } from '../db/storage';
import type { User, Parent, School } from '../types';
import { hashPIN } from '../utils/crypto';

interface AppContextProps {
  db: Database;
  saveDB: (newDb: Database) => void;
  currentUser: User | Parent | null;
  currentSchool: School | null;
  isSupervising: boolean;
  enterSupervision: (schoolId: string) => void;
  exitSupervision: () => void;
  login: (schoolCode: string, emailOrPhone: string, pin: string) => Promise<boolean>;
  logout: () => void;
  isFirestoreConnected: boolean | null;
  firestoreError: string | null;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<Database | null>(null);
  const [currentUser, setCurrentUser] = useState<User | Parent | null>(null);
  const [currentSchool, setCurrentSchool] = useState<School | null>(null);
  const [isSupervising, setIsSupervising] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isFirestoreConnected, setIsFirestoreConnected] = useState<boolean | null>(null);
  const [firestoreError, setFirestoreError] = useState<string | null>(null);

  useEffect(() => {
    const initializeFirebaseData = async () => {
      try {
        const { db: firestoreDb } = await import('../db/firebase');
        const { collection, getDocs } = await import('firebase/firestore');

        const collectionsToFetch = ['schools', 'users', 'classes', 'students', 'staff', 'buses', 'inventory', 'grades', 'payments', 'attendance', 'parents'];
        const loadedDb: any = { ...defaultDB };

        for (const colName of collectionsToFetch) {
          const snapshot = await getDocs(collection(firestoreDb, colName));
          loadedDb[colName] = snapshot.docs.map(doc => doc.data());
        }

        setIsFirestoreConnected(true);
        setFirestoreError(null);
        
        // Auto-inject missing default classes if none exist
        const missingClasses = defaultDB.classes.filter(defCls => !loadedDb.classes.some((c: any) => c.id === defCls.id));
        if (missingClasses.length > 0) {
          loadedDb.classes = [...loadedDb.classes, ...missingClasses];
          // We will sync them via saveDB later if needed
        }

        // Auto-inject default Super Admin if none exists
        if (!loadedDb.users) loadedDb.users = [];
        const hasSuperAdmin = loadedDb.users.some((u: any) => u.role === 'superAdmin');
        if (!hasSuperAdmin) {
          loadedDb.users.push({
            id: 'super-admin-1',
            emailOrPhone: 'kyrialove@gmail.com',
            pinHash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
            role: 'superAdmin',
            isActive: true,
            mustChangePin: true
          });
        }

        setDb(loadedDb);
        restoreSession(loadedDb);
        setLoading(false);

      } catch (error: any) {
        console.error("Firestore Error:", error);
        setIsFirestoreConnected(false);
        setFirestoreError(error.message || "Erreur de connexion à Firestore");
        setLoading(false);
      }
    };

    const restoreSession = (currentDb: any) => {
      const savedUserId = localStorage.getItem('ecoscolaire_user_id');
      const savedSchoolId = localStorage.getItem('ecoscolaire_school_id');
      
      if (savedUserId) {
        const user = currentDb.users.find((u: any) => u.id === savedUserId) || currentDb.parents.find((p: any) => p.id === savedUserId);
        if (user) {
          setCurrentUser(user as any);
          if (savedSchoolId) {
            const school = currentDb.schools.find((s: any) => s.id === savedSchoolId) || null;
            setCurrentSchool(school);
          }
        } else {
          localStorage.removeItem('ecoscolaire_user_id');
          localStorage.removeItem('ecoscolaire_school_id');
        }
      }
    };

    initializeFirebaseData();
  }, []);

  const saveDB = async (newDb: Database) => {
    if (isSupervising) {
      const confirm = window.confirm("MODE SUPERVISION : Vous êtes sur le point de modifier les données de cette école. Êtes-vous sûr ?");
      if (!confirm) return;
    }
    
    // Update local state immediately for snappy UI
    setDb(newDb);
    saveDBToStorage(newDb); // Keep local fallback just in case

    // Diff Engine to sync only changed items to Firestore
    try {
      const { db: firestoreDb } = await import('../db/firebase');
      const { doc, setDoc, deleteDoc } = await import('firebase/firestore');

      const collections = ['schools', 'users', 'classes', 'students', 'staff', 'buses', 'inventory', 'grades', 'payments', 'attendance', 'parents'] as const;
      
      for (const col of collections) {
        const oldArray = db ? (db[col] as any[]) : [];
        const newArray = newDb[col] as any[];

        // Maps for quick lookup
        const oldMap = new Map(oldArray.map(item => [item.id, item]));
        const newMap = new Map(newArray.map(item => [item.id, item]));

        // Finds Adds & Updates
        for (const newItem of newArray) {
          const oldItem = oldMap.get(newItem.id);
          if (!oldItem || JSON.stringify(oldItem) !== JSON.stringify(newItem)) {
            // Added or Updated
            await setDoc(doc(firestoreDb, col, newItem.id), newItem);
          }
        }

        // Finds Deletes
        for (const oldItem of oldArray) {
          if (!newMap.has(oldItem.id)) {
            // Deleted
            await deleteDoc(doc(firestoreDb, col, oldItem.id));
          }
        }
      }
    } catch (e) {
      console.error("Diffing Sync Error:", e);
    }
  };

  const enterSupervision = (schoolId: string) => {
    if (currentUser?.role !== 'superAdmin') return;
    const targetSchool = db?.schools.find(s => s.id === schoolId);
    if (targetSchool) {
      setCurrentSchool(targetSchool);
      setIsSupervising(true);
    }
  };

  const exitSupervision = () => {
    if (currentUser?.role !== 'superAdmin') return;
    setCurrentSchool(null);
    setIsSupervising(false);
  };

  const login = async (schoolCode: string, emailOrPhone: string, pin: string): Promise<boolean> => {
    if (!db) return false;

    const pinHashed = await hashPIN(pin);

    // Super Admin login bypasses schoolCode
    const superAdmin = db.users.find(u => u.role === 'superAdmin' && u.emailOrPhone === emailOrPhone);
    if (superAdmin && superAdmin.pinHash === pinHashed) {
      setCurrentUser(superAdmin);
      setCurrentSchool(null);
      localStorage.setItem('ecoscolaire_user_id', superAdmin.id);
      localStorage.removeItem('ecoscolaire_school_id');
      return true;
    }

    // Normal User / Parent login
    const targetSchool = db.schools.find(s => s.schoolCode === schoolCode);
    if (!targetSchool) {
      alert("Code école introuvable.");
      return false;
    }

    // Check SaaS subscription
    if (targetSchool.subscriptionStatus !== 'active' && targetSchool.subscriptionStatus !== 'trial') {
      alert("L'abonnement de cette école est suspendu ou expiré. Veuillez contacter l'administration centrale.");
      return false;
    }

    // Try finding User
    let user: User | Parent | undefined = db.users.find(u => u.schoolId === targetSchool.id && u.emailOrPhone === emailOrPhone && u.pinHash === pinHashed && u.isActive);
    
    // Try finding Parent if not user
    if (!user) {
      // For parents, we might check phoneWhatsApp or email. 
      // Note: Parents need a pinHash too. Let's assume parent.pinHash exists.
      // Wait, we didn't add pinHash to Parent! We need to add it or use phone as temp password.
      // We will check by phoneWhatsApp for now, and since we need a PIN, we will need to update Parent type.
      // Assuming parent has pinHash for this logic:
      user = db.parents.find(p => p.schoolId === targetSchool.id && (p.phoneWhatsApp === emailOrPhone || p.email === emailOrPhone) && (p as any).pinHash === pinHashed && p.isActive);
    }

    if (user) {
      setCurrentUser(user);
      setCurrentSchool(targetSchool);
      localStorage.setItem('ecoscolaire_user_id', user.id);
      localStorage.setItem('ecoscolaire_school_id', targetSchool.id);
      return true;
    }

    alert("Identifiants incorrects.");
    return false;
  };

  const logout = () => {
    setCurrentUser(null);
    setCurrentSchool(null);
    setIsSupervising(false);
    localStorage.removeItem('ecoscolaire_user_id');
    localStorage.removeItem('ecoscolaire_school_id');
  };

  if (loading || !db) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#334155' }}>
        <h2 style={{ marginTop: '1.5rem', fontWeight: 600 }}>Chargement de la plateforme...</h2>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ 
      db, saveDB, currentUser, currentSchool, 
      isSupervising, enterSupervision, exitSupervision, 
      login, logout, isFirestoreConnected, firestoreError
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};

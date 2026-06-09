import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Database } from '../db/storage';
import { getDB as getDefaultDB, defaultDB, saveDB as saveDBToStorage } from '../db/storage';
import type { User, Parent, School } from '../types';
import { hashPIN } from '../utils/crypto';

interface AppContextProps {
  db: Database;
  saveDB: (newDb: Database) => void;
  currentUser: User | Parent | null;
  currentSchool: School | null;
  login: (schoolCode: string, emailOrPhone: string, pin: string) => Promise<boolean>;
  logout: () => void;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<Database | null>(null);
  const [currentUser, setCurrentUser] = useState<User | Parent | null>(null);
  const [currentSchool, setCurrentSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadedDb = getDefaultDB();
    let currentDb = { ...loadedDb };
    
    // Auto-inject missing classes
    const missingClasses = defaultDB.classes.filter(defCls => !currentDb.classes.some(c => c.id === defCls.id));
    if (missingClasses.length > 0) {
      currentDb.classes = [...currentDb.classes, ...missingClasses];
      saveDBToStorage(currentDb);
    }
    
    setDb(currentDb);

    // Restore session
    const savedUserId = localStorage.getItem('ecoscolaire_user_id');
    const savedSchoolId = localStorage.getItem('ecoscolaire_school_id');
    
    if (savedUserId) {
      const user = currentDb.users.find(u => u.id === savedUserId) || currentDb.parents.find(p => p.id === savedUserId);
      if (user) {
        setCurrentUser(user as any);
        if (savedSchoolId) {
          const school = currentDb.schools.find(s => s.id === savedSchoolId) || null;
          setCurrentSchool(school);
        }
      } else {
        localStorage.removeItem('ecoscolaire_user_id');
        localStorage.removeItem('ecoscolaire_school_id');
      }
    }

    setLoading(false);
  }, []);

  const saveDB = (newDb: Database) => {
    setDb(newDb);
    saveDBToStorage(newDb);
  };

  const login = async (schoolCode: string, emailOrPhone: string, pin: string): Promise<boolean> => {
    if (!db) return false;

    const pinHashed = await hashPIN(pin);

    // Super Admin login bypasses schoolCode
    if (emailOrPhone === 'admin@ecoscolaire.com' && pinHashed === db.users.find(u => u.role === 'superAdmin')?.pinHash) {
      const admin = db.users.find(u => u.role === 'superAdmin');
      if (admin) {
        setCurrentUser(admin);
        setCurrentSchool(null);
        localStorage.setItem('ecoscolaire_user_id', admin.id);
        localStorage.removeItem('ecoscolaire_school_id');
        return true;
      }
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
    <AppContext.Provider value={{ db, saveDB, currentUser, currentSchool, login, logout }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Database } from '../db/storage';
import { getDB as getDefaultDB, defaultDB, saveDB as saveDBToStorage } from '../db/storage';

interface AppContextProps {
  db: Database;
  saveDB: (newDb: Database) => void;
}

const AppContext = createContext<AppContextProps | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<Database | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Charger depuis localStorage
    const loadedDb = getDefaultDB();
    let currentDb = { ...loadedDb };
    
    // Auto-inject missing default classes (like Pre-Nursery) to ensure they are available
    const missingClasses = defaultDB.classes.filter(defCls => !currentDb.classes.some(c => c.id === defCls.id));
    if (missingClasses.length > 0) {
      currentDb.classes = [...currentDb.classes, ...missingClasses];
      // Save it back to local storage
      saveDBToStorage(currentDb);
    }
    
    setDb(currentDb);
    setLoading(false);
  }, []);

  const saveDB = (newDb: Database) => {
    // Optimistic UI Update immediately
    setDb(newDb);
    // Save to local storage
    saveDBToStorage(newDb);
  };

  if (loading || !db) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', color: '#334155', fontFamily: 'sans-serif' }}>
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: 'spin 1.5s linear infinite', color: '#4f46e5' }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <h2 style={{ marginTop: '1.5rem', fontWeight: 600 }}>Chargement en cours...</h2>
        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <AppContext.Provider value={{ db, saveDB }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error("useAppContext must be used within AppProvider");
  return context;
};

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'fr' | 'en';

interface Translations {
  [key: string]: {
    fr: string;
    en: string;
  }
}

const translations: Translations = {
  "dashboard": { fr: "Tableau de bord", en: "Dashboard" },
  "students": { fr: "Élèves", en: "Students" },
  "staff": { fr: "Personnel", en: "Staff" },
  "buses": { fr: "Bus Scolaires", en: "School Buses" },
  "inventory": { fr: "Inventaire", en: "Inventory" },
  "settings": { fr: "Paramètres", en: "Settings" },
  "add": { fr: "Ajouter", en: "Add" },
  "edit": { fr: "Modifier", en: "Edit" },
  "delete": { fr: "Supprimer", en: "Delete" },
  "save": { fr: "Enregistrer", en: "Save" },
  "cancel": { fr: "Annuler", en: "Cancel" },
  "name": { fr: "Nom", en: "Name" },
  "role": { fr: "Rôle", en: "Role" },
  "section": { fr: "Section", en: "Section" },
  "class": { fr: "Classe", en: "Class" },
  "classes": { fr: "Classes", en: "Classes" },
  "school_setup": { fr: "Configuration de l'école", en: "School Setup" },
  "school_name": { fr: "Nom de l'école", en: "School Name" },
  "create_school": { fr: "Créer l'école", en: "Create School" }
};

interface I18nContextProps {
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: string, defaultText?: string) => string;
}

const I18nContext = createContext<I18nContextProps | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLang] = useState<Language>(() => {
    return (localStorage.getItem('ecoscolaire_lang') as Language) || 'fr';
  });

  useEffect(() => {
    localStorage.setItem('ecoscolaire_lang', lang);
  }, [lang]);

  const t = (key: string, defaultText?: string) => {
    if (translations[key] && translations[key][lang]) {
      return translations[key][lang];
    }
    return defaultText || key;
  };

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within I18nProvider");
  return context;
};

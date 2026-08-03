import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { useI18n } from '../context/I18nContext';
import { DEFAULT_CLASS_LEVELS } from '../constants/defaultClasses';
import { buildStandardClassDocumentId } from '../utils/classCatalog';
import setupBg from '../assets/setup-bg.png';

const Setup: React.FC = () => {
  const { safeMergeDB, db } = useAppContext();
  const { t } = useI18n();
  const navigate = useNavigate();
  
  const [schoolName, setSchoolName] = useState('');
  const [adminPin, setAdminPin] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolName.trim()) return;

    const newDb = { ...db };
    newDb.school = {
      id: crypto.randomUUID(),
      schoolCode: `ECO-${Math.floor(Math.random() * 10000)}`,
      name: schoolName,
      academicYear: `${new Date().getFullYear()} - ${new Date().getFullYear() + 1}`,
      adminPin: adminPin || '0000',
      createdAt: new Date().toISOString()
    };
    
    const schoolId = newDb.school.id;

    // Initialisation des 34 classes générales standards (Section 6 P0-35C)
    newDb.classes = DEFAULT_CLASS_LEVELS
      .filter(level => level.educationType === 'general')
      .map(level => ({
        id: buildStandardClassDocumentId(schoolId, level.catalogLevelId),
        catalogLevelId: level.catalogLevelId,
        schoolId: schoolId,
        name: level.name,
        type: level.section,
        section: level.section,
        cycle: level.cycle,
        educationType: 'general' as const,
        levelOrder: level.levelOrder,
        isDefault: true as const,
        isActive: true
      }));

    newDb.subjects = [
      { id: crypto.randomUUID(), name: 'Mathématiques / Mathematics' },
      { id: crypto.randomUUID(), name: 'Français' },
      { id: crypto.randomUUID(), name: 'English' },
      { id: crypto.randomUUID(), name: 'Sciences de la Vie et de la Terre (SVT) / Science' },
      { id: crypto.randomUUID(), name: 'Histoire - Géographie / History - Geography' },
      { id: crypto.randomUUID(), name: 'Éducation Civique et Morale / Civics and Moral Education' },
      { id: crypto.randomUUID(), name: 'Informatique / ICT' },
      { id: crypto.randomUUID(), name: 'Éducation Physique / Physical Education' },
      { id: crypto.randomUUID(), name: 'Arts Dramatiques ou Plastiques / Arts' },
    ];
    
    safeMergeDB(newDb);
    navigate('/');
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc', fontFamily: "'Inter', sans-serif" }}>
      {/* Colonne Image (Cachée sur petits écrans) */}
      <div style={{ flex: 1, display: 'none', position: 'relative' }} className="setup-image-container">
        <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(79, 70, 229, 0.4)', mixBlendMode: 'multiply' }}></div>
        <img 
          src={setupBg} 
          alt="School Setup" 
          style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
        />
        <div style={{ position: 'absolute', bottom: '40px', left: '40px', color: 'white', maxWidth: '400px' }}>
          <h2 style={{ fontSize: '2.5rem', fontWeight: 800, lineHeight: 1.1, marginBottom: '1rem', textShadow: '0 2px 10px rgba(0,0,0,0.3)' }}>EcoScolaire</h2>
          <p style={{ fontSize: '1.125rem', opacity: 0.9, textShadow: '0 1px 5px rgba(0,0,0,0.3)' }}>L'outil de gestion nouvelle génération pour les écoles primaires bilingues.</p>
        </div>
      </div>

      {/* Colonne Formulaire */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
        <div style={{ width: '100%', maxWidth: '440px', backgroundColor: 'white', padding: '3rem', borderRadius: '24px', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <h1 style={{ fontSize: '2rem', fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>{t('school_setup', 'Configuration')}</h1>
            <p style={{ color: '#64748b' }}>Bienvenue ! Configurez votre établissement pour démarrer.</p>
          </div>
          
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <label htmlFor="schoolName" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>
                {t('school_name', "Nom de l'établissement")}
              </label>
              <input 
                id="schoolName"
                type="text" 
                value={schoolName} 
                onChange={e => setSchoolName(e.target.value)}
                placeholder="Ex: École Primaire Les Papillons"
                required 
                autoFocus
                style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', transition: 'border-color 0.2s', fontSize: '1rem' }}
                onFocus={e => e.target.style.borderColor = '#4f46e5'}
                onBlur={e => e.target.style.borderColor = '#cbd5e1'}
              />
            </div>

            <div>
              <label htmlFor="adminPin" style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.5rem' }}>
                Code PIN Administrateur
              </label>
              <input 
                id="adminPin"
                type="password" 
                value={adminPin} 
                onChange={e => setAdminPin(e.target.value)}
                placeholder="Ex: 1234"
                required 
                style={{ width: '100%', padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid #cbd5e1', outline: 'none', transition: 'border-color 0.2s', fontSize: '1rem' }}
                onFocus={e => e.target.style.borderColor = '#4f46e5'}
                onBlur={e => e.target.style.borderColor = '#cbd5e1'}
              />
              <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.5rem' }}>Ce code protégera l'accès aux paramètres sensibles.</p>
            </div>

            <button 
              type="submit" 
              style={{ 
                width: '100%', 
                padding: '0.875rem', 
                backgroundColor: '#4f46e5', 
                color: 'white', 
                border: 'none', 
                borderRadius: '12px', 
                fontSize: '1rem', 
                fontWeight: 600, 
                cursor: 'pointer', 
                marginTop: '1rem',
                transition: 'background-color 0.2s, transform 0.1s',
                boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.3)'
              }}
              onMouseOver={e => e.currentTarget.style.backgroundColor = '#4338ca'}
              onMouseOut={e => e.currentTarget.style.backgroundColor = '#4f46e5'}
              onMouseDown={e => e.currentTarget.style.transform = 'scale(0.98)'}
              onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {t('create_school', 'Créer mon école')}
            </button>
          </form>
        </div>
      </div>
      <style>
        {`
          @media (min-width: 768px) {
            .setup-image-container { display: block !important; }
          }
        `}
      </style>
    </div>
  );
};

export default Setup;


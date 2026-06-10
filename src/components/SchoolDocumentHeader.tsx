import React from 'react';
import { Building } from 'lucide-react';
import type { School } from '../types';

interface SchoolDocumentHeaderProps {
  school: School | null;
  documentTitle?: string;
}

const SchoolDocumentHeader: React.FC<SchoolDocumentHeaderProps> = ({ school, documentTitle }) => {
  if (!school) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      borderBottom: '2px solid #e2e8f0',
      paddingBottom: '1rem',
      marginBottom: '2rem'
    }}>
      {/* Zone Logo (Gauche) */}
      <div style={{ flex: '0 0 100px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        {school.logoUrl ? (
          <img 
            src={school.logoUrl} 
            alt={`Logo ${school.name}`} 
            style={{ maxWidth: '100px', maxHeight: '100px', objectFit: 'contain' }} 
          />
        ) : (
          <div style={{
            width: '80px',
            height: '80px',
            background: '#f1f5f9',
            borderRadius: '50%',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            border: '1px solid #cbd5e1'
          }}>
            <Building size={40} color="#94a3b8" />
          </div>
        )}
      </div>

      {/* Zone Texte (Centre) */}
      <div style={{ flex: '1', textAlign: 'center', padding: '0 1rem' }}>
        <h1 style={{ margin: '0 0 0.5rem 0', fontSize: '1.8rem', color: '#1e293b', textTransform: 'uppercase' }}>
          {school.name}
        </h1>
        <div style={{ fontSize: '1rem', color: '#64748b', marginBottom: '0.25rem' }}>
          Année Académique : <strong>{school.academicYear}</strong>
        </div>
        <div style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
          Code Établissement : {school.schoolCode}
        </div>
      </div>

      {/* Titre du Document (Droite) */}
      <div style={{ flex: '0 0 200px', textAlign: 'right' }}>
        {documentTitle && (
          <div style={{
            display: 'inline-block',
            padding: '0.5rem 1rem',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            borderRadius: '4px',
            fontWeight: 'bold',
            color: '#334155',
            fontSize: '1.1rem'
          }}>
            {documentTitle}
          </div>
        )}
      </div>
    </div>
  );
};

export default SchoolDocumentHeader;

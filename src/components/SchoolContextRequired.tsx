import React from 'react';
import { Building, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const SchoolContextRequired: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div style={{ 
      height: '100%', 
      minHeight: '60vh',
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      padding: '2rem',
      textAlign: 'center',
      background: '#f8fafc',
      borderRadius: '8px',
      border: '1px dashed #cbd5e1'
    }}>
      <div style={{ 
        background: '#e0e7ff', 
        padding: '1.5rem', 
        borderRadius: '50%', 
        marginBottom: '1.5rem',
        color: '#4f46e5'
      }}>
        <Building size={48} />
      </div>
      <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1e293b', marginBottom: '1rem' }}>
        Contexte d'école requis
      </h2>
      <p style={{ color: '#64748b', fontSize: '1.1rem', maxWidth: '500px', marginBottom: '2rem' }}>
        Veuillez sélectionner une école à superviser avant d'accéder à ce module.
      </p>
      <button 
        onClick={() => navigate('/superadmin')} 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '0.5rem', 
          padding: '0.75rem 1.5rem', 
          background: '#4f46e5', 
          color: 'white', 
          border: 'none', 
          borderRadius: '8px', 
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
        }}
      >
        <ArrowLeft size={18} />
        Retour à la liste des écoles
      </button>
    </div>
  );
};

export default SchoolContextRequired;

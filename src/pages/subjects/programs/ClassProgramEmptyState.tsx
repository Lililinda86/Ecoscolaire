import React from 'react';
import { AlertCircle, Lock, BookOpen, RefreshCw } from 'lucide-react';
import type { ClassProgramErrorType } from '../../../services/classPrograms';

interface ClassProgramEmptyStateProps {
  type:
    | 'no-class-selected'
    | 'loading'
    | 'forbidden'
    | 'no-program'
    | 'no-program-read-only'
    | 'published-incomplete'
    | 'error';
  errorCode?: ClassProgramErrorType | 'LEGACY_MISSING' | null;
  onRetry?: () => void;
}

export const ClassProgramEmptyState: React.FC<ClassProgramEmptyStateProps> = ({
  type,
  errorCode,
  onRetry
}) => {
  const containerStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '4rem 2rem',
    background: 'var(--card-bg)',
    borderRadius: '12px',
    border: '1px solid var(--border-color)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
  };

  const iconCircleStyle = (bgColor: string): React.CSSProperties => ({
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: bgColor,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '0.5rem'
  });

  if (type === 'loading') {
    return (
      <div style={containerStyle}>
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          border: '3px solid rgba(79, 70, 229, 0.1)',
          borderTopColor: 'var(--primary-color)',
          animation: 'spin 1s linear infinite'
        }} />
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.95rem', fontWeight: 500 }}>
          Chargement du programme...
        </span>
      </div>
    );
  }

  if (type === 'no-class-selected') {
    return (
      <div style={containerStyle}>
        <div style={iconCircleStyle('rgba(79, 70, 229, 0.05)')}>
          <BookOpen size={32} style={{ color: 'var(--primary-color)' }} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 750, color: '#1e293b', margin: 0 }}>
          Sélectionnez une classe
        </h3>
        <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: 0, fontSize: '0.95rem', lineHeight: '1.45' }}>
          Choisissez une classe et une section pour consulter le programme scolaire correspondant.
        </p>
      </div>
    );
  }

  if (type === 'forbidden') {
    return (
      <div style={containerStyle}>
        <div style={iconCircleStyle('rgba(239, 68, 68, 0.05)')}>
          <Lock size={32} style={{ color: 'var(--danger)' }} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 750, color: '#1e293b', margin: 0 }}>
          Accès refusé
        </h3>
        <p style={{ color: 'var(--text-muted)', maxWidth: '400px', margin: 0, fontSize: '0.95rem', lineHeight: '1.45' }}>
          Vous n'avez pas accès au programme demandé.
        </p>
      </div>
    );
  }

  if (type === 'no-program') {
    return (
      <div style={containerStyle}>
        <div style={iconCircleStyle('rgba(245, 158, 11, 0.05)')}>
          <AlertCircle size={32} style={{ color: '#d97706' }} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 750, color: '#1e293b', margin: 0 }}>
          Aucun programme n’a encore été créé pour cette classe.
        </h3>
        <p style={{ color: 'var(--text-muted)', maxWidth: '460px', margin: 0, fontSize: '0.95rem', lineHeight: '1.45' }}>
          Créez un brouillon afin de définir les matières et de publier le programme officiel.
        </p>
      </div>
    );
  }

  if (type === 'no-program-read-only') {
    return (
      <div style={containerStyle}>
        <div style={iconCircleStyle('rgba(100, 116, 139, 0.05)')}>
          <AlertCircle size={32} style={{ color: 'var(--text-muted)' }} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 750, color: '#1e293b', margin: 0 }}>
          Aucun programme publié
        </h3>
        <p style={{ color: 'var(--text-muted)', maxWidth: '460px', margin: 0, fontSize: '0.95rem', lineHeight: '1.45' }}>
          Aucun programme n’a encore été créé pour cette classe.
        </p>
      </div>
    );
  }

  if (type === 'published-incomplete') {
    return (
      <div style={containerStyle}>
        <div style={iconCircleStyle('rgba(239, 68, 68, 0.05)')}>
          <AlertCircle size={32} style={{ color: 'var(--danger)' }} />
        </div>
        <h3 style={{ fontSize: '1.25rem', fontWeight: 750, color: '#1e293b', margin: 0 }}>
          Version publiée incomplète
        </h3>
        <p style={{ color: 'var(--text-muted)', maxWidth: '460px', margin: 0, fontSize: '0.95rem', lineHeight: '1.45' }}>
          La version publiée est incomplète ou inaccessible pour cette classe.
        </p>
      </div>
    );
  }

  // General error state
  let errorMessage = 'Une erreur est survenue lors de la récupération des données.';
  if (errorCode === 'PROGRAM_PERMISSION_DENIED') {
    errorMessage = "Vous n’êtes pas autorisé à consulter le programme de cette classe.";
  } else if (errorCode === 'PROGRAM_INTEGRITY_ERROR') {
    errorMessage = "Les données du programme de cette classe sont incohérentes.";
  }

  return (
    <div style={containerStyle}>
      <div style={iconCircleStyle('rgba(239, 68, 68, 0.05)')}>
        <AlertCircle size={32} style={{ color: 'var(--danger)' }} />
      </div>
      <h3 style={{ fontSize: '1.25rem', fontWeight: 750, color: '#1e293b', margin: 0 }}>
        Erreur de chargement
      </h3>
      <p style={{ color: 'var(--text-muted)', maxWidth: '460px', margin: 0, fontSize: '0.95rem', lineHeight: '1.45' }}>
        {errorMessage}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          style={{
            marginTop: '0.5rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: 'var(--primary-color)',
            color: 'white',
            border: 'none',
            padding: '0.6rem 1.25rem',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          <RefreshCw size={16} />
          Réessayer
        </button>
      )}
    </div>
  );
};

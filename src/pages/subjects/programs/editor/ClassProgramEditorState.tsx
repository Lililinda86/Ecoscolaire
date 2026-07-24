import React from 'react';

interface ClassProgramEditorStateProps {
  type: 'loading' | 'saving' | 'error' | 'success' | 'empty' | 'revision-required';
  message?: string;
  onRetry?: () => void;
}

export const ClassProgramEditorState: React.FC<ClassProgramEditorStateProps> = ({
  type,
  message,
  onRetry
}) => {
  if (type === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <svg className="animate-spin h-8 w-8 mb-4 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-sm font-medium">Chargement du brouillon en cours...</p>
      </div>
    );
  }

  if (type === 'saving') {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
        <svg className="animate-spin h-8 w-8 mb-4 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-sm font-medium">Enregistrement des modifications...</p>
      </div>
    );
  }

  if (type === 'error') {
    return (
      <div className="p-4 mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
        <h4 className="text-sm font-bold mb-1">Une erreur est survenue</h4>
        <p className="text-xs mb-3">{message || 'Impossible d\'enregistrer les modifications.'}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold transition"
          >
            Réessayer
          </button>
        )}
      </div>
    );
  }

  if (type === 'revision-required') {
    return (
      <div className="text-center py-12 px-4 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/30">
        <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <h3 className="text-sm font-bold text-gray-950 dark:text-white mb-1">
          Aucun brouillon modifiable
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 max-w-md mx-auto mb-4">
          Ce programme a été publié. Une nouvelle révision brouillon doit être ouverte par le serveur avant toute nouvelle modification.
        </p>
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          Action planifiée pour le LOT 2C-B
        </span>
      </div>
    );
  }

  return null;
};

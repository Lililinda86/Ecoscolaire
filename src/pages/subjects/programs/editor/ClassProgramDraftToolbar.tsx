import React from 'react';

interface ClassProgramDraftToolbarProps {
  isDirty: boolean;
  isSaving: boolean;
  isManager?: boolean;
  onSave: () => void;
  onCancel: () => void;
  onAddSubject: () => void;
  onPublish: () => void;
}

export const ClassProgramDraftToolbar: React.FC<ClassProgramDraftToolbarProps> = ({
  isDirty,
  isSaving,
  isManager = false,
  onSave,
  onCancel,
  onAddSubject,
  onPublish
}) => {
  return (
    <div className="flex flex-col gap-3 mb-5 p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
      <div className="flex items-center justify-between flex-wrap sm:flex-nowrap gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse shrink-0" />
          <h4 className="text-xs font-bold text-amber-800 dark:text-amber-400 whitespace-nowrap">
            Modification du brouillon actif :
          </h4>
          {isDirty ? (
            <span className="text-[11px] text-red-600 dark:text-red-400 font-bold">
              Enregistrez avant de publier.
            </span>
          ) : (
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              Les modifications doivent être enregistrées.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onAddSubject}
            disabled={isSaving}
            className="h-8 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="whitespace-nowrap">Ajouter une matière</span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={!isDirty || isSaving}
            className="h-8 px-3 border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-850 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-bold transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || isSaving}
            className="h-8 px-3 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/30 dark:hover:bg-blue-900/40 text-blue-700 dark:text-blue-450 rounded-lg text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            {isSaving ? 'Enregistrement...' : 'Enregistrer'}
          </button>

          {isManager && (
            <button
              type="button"
              onClick={onPublish}
              disabled={isDirty || isSaving}
              title={isDirty ? "Enregistrez vos modifications avant de publier." : "Publier le programme officiel"}
              className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 shadow-sm shadow-emerald-500/20"
            >
              Publier
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

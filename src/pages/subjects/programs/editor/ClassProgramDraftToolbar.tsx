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
    <div className="class-program-toolbar-container">
      <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
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

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onAddSubject}
            disabled={isSaving}
            className="class-program-btn-add"
          >
            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="whitespace-nowrap">Ajouter une matière</span>
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={!isDirty || isSaving}
            className="class-program-btn-action secondary"
          >
            Annuler
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={!isDirty || isSaving}
            className="class-program-btn-action"
            style={{ backgroundColor: 'rgba(79, 70, 229, 0.1)', color: 'var(--primary-color)' }}
          >
            {isSaving ? 'Enregistrement...' : 'Enregistrer'}
          </button>

          {isManager && (
            <button
              type="button"
              onClick={onPublish}
              disabled={isDirty || isSaving}
              title={isDirty ? "Enregistrez vos modifications avant de publier." : "Publier le programme officiel"}
              className="class-program-btn-action"
              style={{ backgroundColor: 'var(--success)' }}
            >
              Publier
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

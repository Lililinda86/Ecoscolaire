import React, { useState } from 'react';
import { useClassProgramDraft } from '../../../../hooks/useClassProgramDraft';
import type { ClassProgram, ClassSubject, Subject, ClassSection } from '../../../../types';
import { ClassProgramDraftToolbar } from './ClassProgramDraftToolbar';
import { ClassProgramDraftSummary } from './ClassProgramDraftSummary';
import { ClassProgramSubjectRow } from './ClassProgramSubjectRow';
import { ClassProgramSubjectPicker } from './ClassProgramSubjectPicker';
import { ClassProgramEditorState } from './ClassProgramEditorState';
import { publishClassProgramDraft } from '../../../../services/classProgramPublishFunctions';
import Modal from '../../../../components/Modal';

interface ClassProgramEditorProps {
  initialProgram: ClassProgram | null;
  initialSubjects: ClassSubject[];
  schoolId: string;
  academicYearId: string;
  classId: string;
  selectedClass?: ClassSection | null;
  userId: string;
  userRole: string;
  catalogSubjects: Subject[];
  onClose: () => void;
  onSaveSuccess: (updatedProgram: ClassProgram, updatedSubjects: ClassSubject[]) => void;
  onDirtyChange?: (isDirty: boolean) => void;
}

export const ClassProgramEditor: React.FC<ClassProgramEditorProps> = ({
  initialProgram,
  initialSubjects,
  schoolId,
  academicYearId,
  classId,
  selectedClass,
  userId,
  userRole,
  catalogSubjects,
  onClose,
  onSaveSuccess,
  onDirtyChange
}) => {
  const {
    program,
    subjects,
    isDirty,
    isSaving,
    error,
    draftStateToken,
    isTokenCalculating,
    tokenError,
    addSubject,
    updateSubjectFields,
    removeSubject,
    reorderSubjects,
    cancelChanges,
    saveDraft,
    createInitialProgram
  } = useClassProgramDraft({
    initialProgram,
    initialSubjects,
    schoolId,
    academicYearId,
    classId,
    userId,
    userRole,
    onSaveSuccess,
    onDirtyChange
  });

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [isPublishConfirmOpen, setIsPublishConfirmOpen] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  const handlePublish = async () => {
    if (isPublishing || !program) return;
    setIsPublishing(true);
    setPublishError(null);
    try {
      await publishClassProgramDraft({
        schoolId,
        academicYearId,
        classId,
        expectedDraftRevisionId: program.draftRevisionId,
        expectedDraftStateToken: draftStateToken || ''
      });
      setIsPublishConfirmOpen(false);
      onSaveSuccess({
        ...program,
        status: 'published',
        publishedRevisionId: program.draftRevisionId,
        publishedRevisionNumber: program.draftRevisionNumber,
        hasUnpublishedChanges: false
      }, initialSubjects);
      onClose();
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Erreur lors de la publication du programme.';
      setPublishError(errMessage);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleClose = () => {
    if (isDirty) {
      setShowExitConfirm(true);
    } else {
      onClose();
    }
  };

  const handleConfirmExit = () => {
    setShowExitConfirm(false);
    onClose();
  };

  const handleCreateInitial = async () => {
    await createInitialProgram();
  };

  // If no program exists yet
  if (!program) {
    return (
      <div className="p-6 text-center">
        <h3 className="text-sm font-bold text-gray-950 dark:text-white mb-2">
          Aucun programme configuré pour cette classe
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
          Vous devez créer le premier brouillon du programme avant de pouvoir ajouter des matières.
        </p>
        <button
          type="button"
          onClick={handleCreateInitial}
          disabled={isSaving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition disabled:opacity-50"
        >
          {isSaving ? 'Création en cours...' : 'Créer le premier brouillon'}
        </button>
        {error && (
          <div className="mt-4 text-xs font-semibold text-red-600">
            {error}
          </div>
        )}
      </div>
    );
  }

  // If the program is published and there's no active draft (revision numbers match and hasUnpublishedChanges is false)
  const isPublishedWithoutDraft =
    program.status === 'published' &&
    !program.hasUnpublishedChanges &&
    program.publishedRevisionId === program.draftRevisionId;

  if (isPublishedWithoutDraft) {
    return (
      <div className="p-4">
        <ClassProgramEditorState type="revision-required" />
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-bold transition"
          >
            Retour
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* 1. Header Toolbar */}
      <ClassProgramDraftToolbar
        isDirty={isDirty}
        isSaving={isSaving || isTokenCalculating}
        isManager={userRole === 'superAdmin' || userRole === 'owner' || userRole === 'director' || userRole === 'secretary'}
        onSave={saveDraft}
        onCancel={cancelChanges}
        onAddSubject={() => setIsPickerOpen(true)}
        onPublish={() => !isTokenCalculating && setIsPublishConfirmOpen(true)}
      />

      {isTokenCalculating && (
        <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg text-xs text-blue-700 dark:text-blue-400 font-medium mb-4 flex items-center gap-2">
          <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Signature SHA-256 en cours de génération...
        </div>
      )}
      {tokenError && (
        <ClassProgramEditorState type="error" message={`Erreur lors du calcul de la signature : ${tokenError}`} />
      )}

      {/* 2. Error Display */}
      {error && (
        <ClassProgramEditorState type="error" message={error} />
      )}
      {publishError && (
        <ClassProgramEditorState type="error" message={publishError} />
      )}

      {/* 3. Summary Stats */}
      <ClassProgramDraftSummary subjects={subjects} />

      {/* 4. Subjects Table */}
      {subjects.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-gray-200 dark:border-gray-800 rounded-xl">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Aucune matière n'est actuellement ajoutée au brouillon.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/40 text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-800">
                <th className="p-3 text-center w-12">Ordre</th>
                <th className="p-3 text-left">Matière</th>
                <th className="p-3 text-center w-32">Coefficient</th>
                <th className="p-3 text-center w-32">Volume Horaire</th>
                <th className="p-3 text-center w-36">Statut</th>
                <th className="p-3 text-center w-20">Actions</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((subj, idx) => (
                <ClassProgramSubjectRow
                  key={subj.subjectId}
                  subject={subj}
                  index={idx}
                  totalCount={subjects.length}
                  onUpdate={(fields) => updateSubjectFields(subj.subjectId, fields)}
                  onRemove={() => removeSubject(subj.subjectId)}
                  onMoveUp={() => reorderSubjects(idx, idx - 1)}
                  onMoveDown={() => reorderSubjects(idx, idx + 1)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Subject Picker overlay */}
      {isPickerOpen && (
        <ClassProgramSubjectPicker
          key={classId}
          catalogSubjects={catalogSubjects}
          activeSubjects={subjects}
          schoolId={schoolId}
          classId={classId}
          selectedClass={selectedClass}
          onSelect={(s) => {
            addSubject(s);
            setIsPickerOpen(false);
          }}
          onClose={() => setIsPickerOpen(false)}
        />
      )}

      {/* 6. Unsaved Changes confirmation Modal */}
      <Modal
        isOpen={showExitConfirm}
        onClose={() => setShowExitConfirm(false)}
        title="Modifications non enregistrées"
        closeOnBackdrop={false}
      >
        <div className="p-2">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
            Vous avez des modifications en cours qui seront perdues si vous quittez. Voulez-vous continuer à modifier ou abandonner vos modifications ?
          </p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowExitConfirm(false)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold transition"
            >
              Continuer l'édition
            </button>
            <button
              onClick={handleConfirmExit}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold transition shadow-sm"
            >
              Abandonner les modifications
            </button>
          </div>
        </div>
      </Modal>

      {/* 8. Publish confirmation Modal */}
      <Modal
        isOpen={isPublishConfirmOpen}
        onClose={() => !isPublishing && setIsPublishConfirmOpen(false)}
        title="Publier le programme ?"
        closeOnBackdrop={!isPublishing}
      >
        <div className="p-2">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Voulez-vous publier la révision <strong>v{program?.draftRevisionNumber}</strong> de ce programme de classe pour l'année scolaire <strong>{academicYearId}</strong> ?
          </p>
          <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg text-xs text-gray-600 dark:text-gray-400 mb-4 space-y-1.5 border border-gray-150 dark:border-gray-800">
            <div>• Matières actives : <strong>{subjects.length}</strong></div>
            <div>• Matières inactives : <strong>{initialSubjects.length - subjects.length}</strong></div>
            <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-2 font-medium">
              Note : ces chiffres et l'intégrité du programme seront revérifiés côté serveur avant publication.
            </div>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-6">
            Cette version deviendra le programme officiel visible par les enseignants.
          </p>
          {publishError && (
            <div className="mb-4 text-xs font-semibold text-red-600">
              {publishError}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <button
              disabled={isPublishing}
              onClick={() => setIsPublishConfirmOpen(false)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-850 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-semibold transition disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              disabled={isPublishing}
              onClick={handlePublish}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-sm disabled:opacity-50 flex items-center gap-1.5"
            >
              {isPublishing ? 'Publication...' : 'Publier'}
            </button>
          </div>
        </div>
      </Modal>

      {/* 7. Footer action */}
      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={handleClose}
          className="px-4 py-2 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg text-xs font-bold transition"
        >
          Fermer l'éditeur
        </button>
      </div>
    </div>
  );
};

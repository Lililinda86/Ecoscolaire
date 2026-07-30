import React, { useState } from 'react';
import type { AcademicYear, Period, School, User } from '../../types';
import { useAppContext } from '../../context/AppContext';
import { 
  canManageAcademicCalendar, 
  getCalendarConfigurationState,
  buildAcademicYearId,
  validateAcademicYearInput,
  preparePeriodSubmission,
  submitValidatedPeriod,
  AcademicCalendarMutationCancelledError,
} from '../../services/academicCalendarConfiguration';
import type { PeriodFieldErrors } from '../../services/academicCalendarConfiguration';

interface Props {
  currentSchool: School;
  currentUser: User;
  academicYears: AcademicYear[];
  periods: Period[];
}

export const AcademicCalendarSettings: React.FC<Props> = ({ currentSchool, currentUser, academicYears, periods }) => {
  const { 
    createAcademicYear, updateAcademicYearBounds,
    createAcademicPeriod, openAcademicPeriod, closeAcademicPeriod, publishAcademicPeriod
  } = useAppContext();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<PeriodFieldErrors>({});
  const submittingRef = React.useRef(false);

  const isManager = canManageAcademicCalendar(currentUser.role);
  const state = getCalendarConfigurationState(academicYears, periods);
  const activeYear = academicYears.find(y => y.status === 'active');
  const activeYearPeriods = activeYear ? periods.filter(p => p.academicYearId === activeYear.id) : [];
  const openPeriod = activeYearPeriods.find(p => p.status === 'open');

  const [showYearModal, setShowYearModal] = useState(false);
  const [showYearEditModal, setShowYearEditModal] = useState(false);
  const [showPeriodModal, setShowPeriodModal] = useState(false);

  // Forms State
  const [yearForm, setYearForm] = useState<Partial<AcademicYear>>({});
  const [yearEditForm, setYearEditForm] = useState<{startDate: string, endDate: string}>({startDate: '', endDate: ''});
  const [periodForm, setPeriodForm] = useState<Partial<Period>>({ type: 'term', order: 1 });
  const [activateYearImmediately, setActivateYearImmediately] = useState(true);

  const clearPeriodFieldError = (fieldName: keyof PeriodFieldErrors) => {
    setFieldErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[fieldName];
      return newErrors;
    });
  };

  const handleCreateYear = async () => {
    setError(null);
    if (!yearForm.startDate || !yearForm.endDate) {
      setError("Les dates de début et fin sont obligatoires.");
      return;
    }
    const id = buildAcademicYearId(currentSchool.id, yearForm.startDate, yearForm.endDate);
    const payload: AcademicYear = {
      id,
      schoolId: currentSchool.id,
      name: yearForm.name?.trim() || '',
      startDate: yearForm.startDate,
      endDate: yearForm.endDate,
      status: activateYearImmediately ? 'active' : 'draft',
      createdAt: new Date().toISOString(),
      createdBy: currentUser.id,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser.id
    };

    const validation = validateAcademicYearInput(payload, currentSchool.id);
    if (!validation.isValid) {
      const newFieldErrors: PeriodFieldErrors = {};
      validation.errors.forEach(err => {
        if (err.includes("nom")) newFieldErrors.name = err;
        else if (err.includes("début est invalide")) newFieldErrors.startDate = err;
        else if (err.includes("fin est invalide") || err.includes("postérieure")) newFieldErrors.endDate = err;
        else newFieldErrors.general = err;
      });
      setFieldErrors(newFieldErrors);
      if (newFieldErrors.name) document.getElementById('yearNameInput')?.focus();
      else if (newFieldErrors.startDate) document.getElementById('yearStartDateInput')?.focus();
      else if (newFieldErrors.endDate) document.getElementById('yearEndDateInput')?.focus();
      return;
    }

    try {
      setLoading(true);
      await createAcademicYear(payload, activateYearImmediately);
      setShowYearModal(false);
      setYearForm({});
      setFieldErrors({});
    } catch (err: unknown) {
      if (err instanceof AcademicCalendarMutationCancelledError) return;
      setError(err instanceof Error ? err.message : "Erreur lors de la création de l'année.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateYearBounds = async () => {
    setError(null);
    if (!yearEditForm.startDate || !yearEditForm.endDate) {
      setError("Les dates de début et fin sont obligatoires.");
      return;
    }
    if (!activeYear) return;
    try {
      setLoading(true);
      await updateAcademicYearBounds(activeYear.id, yearEditForm.startDate, yearEditForm.endDate);
      setShowYearEditModal(false);
    } catch (err: unknown) {
      if (err instanceof AcademicCalendarMutationCancelledError) return;
      setError(err instanceof Error ? err.message : "Erreur lors de la modification de l'année.");
    } finally {
      setLoading(false);
    }
  };

  const handlePreFillLegacy = () => {
    if (currentSchool.academicYear) {
      setYearForm(prev => ({ ...prev, name: currentSchool.academicYear }));
    }
  };

  const handleCreatePeriod = async () => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    
    setError(null);
    setFieldErrors({});
    if (!activeYear) {
      submittingRef.current = false;
      return;
    }
    
    const submission = preparePeriodSubmission({
      input: periodForm,
      academicYear: activeYear,
      currentSchoolId: currentSchool.id,
      currentUser
    });

    try {
      setLoading(true);
      const success = await submitValidatedPeriod({
        submission,
        persist: createAcademicPeriod
      });

      if (!success) {
        setFieldErrors(submission.fieldErrors);
        if (submission.fieldErrors.name) document.getElementById('periodNameInput')?.focus();
        else if (submission.fieldErrors.startDate) document.getElementById('periodStartDateInput')?.focus();
        else if (submission.fieldErrors.endDate) document.getElementById('periodEndDateInput')?.focus();
        return;
      }

      setShowPeriodModal(false);
      setPeriodForm({ type: 'term', order: (periodForm.order || 1) + 1 });
      setFieldErrors({});
    } catch (err: unknown) {
      if (err instanceof AcademicCalendarMutationCancelledError) return;
      setError(err instanceof Error ? err.message : "Erreur lors de la création de la période.");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const renderState = () => {
    switch(state) {
      case 'NONE':
        return (
          <div className="bg-yellow-50 p-4 rounded-md mb-4 border border-yellow-200">
            <p className="text-sm text-yellow-800 font-medium">Aucun calendrier académique actif.</p>
            {currentSchool.academicYear && (
              <p className="text-xs text-yellow-700 mt-1">
                Une année scolaire est indiquée dans les paramètres généraux ({currentSchool.academicYear}), mais aucun calendrier structuré n'a encore été créé.
              </p>
            )}
            {isManager && (
              <div className="mt-4 flex gap-2">
                <button disabled={loading} onClick={() => { setYearForm({}); setShowYearModal(true); }} className="px-3 py-1 bg-yellow-600 text-white rounded text-sm hover:bg-yellow-700">Créer une année scolaire</button>
                {currentSchool.academicYear && (
                  <button disabled={loading} onClick={() => { handlePreFillLegacy(); setShowYearModal(true); }} className="px-3 py-1 bg-white border border-yellow-600 text-yellow-700 rounded text-sm hover:bg-yellow-50">Préremplir depuis {currentSchool.academicYear}</button>
                )}
              </div>
            )}
          </div>
        );
      case 'NO_PERIODS':
        return (
          <div className="bg-orange-50 p-4 rounded-md mb-4 border border-orange-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-orange-800 font-medium">L'année académique active "{activeYear?.name}" n'a aucune période.</p>
                <p className="text-xs text-orange-700 mt-1">Du {activeYear?.startDate} au {activeYear?.endDate}</p>
                <p className="text-xs text-orange-700 mt-1">Ajoutez au moins une période avant de pouvoir saisir des notes.</p>
              </div>
              {isManager && (
                <button disabled={loading} onClick={() => { setYearEditForm({startDate: activeYear?.startDate || '', endDate: activeYear?.endDate || ''}); setShowYearEditModal(true); }} className="px-3 py-1 bg-white border border-orange-600 text-orange-700 rounded text-sm hover:bg-orange-50">Modifier les dates</button>
              )}
            </div>
            {isManager && (
              <div className="mt-4">
                <button disabled={loading} onClick={() => setShowPeriodModal(true)} className="px-3 py-1 bg-orange-600 text-white rounded text-sm hover:bg-orange-700">Ajouter une période</button>
              </div>
            )}
          </div>
        );
      case 'NO_OPEN_PERIOD':
        return (
          <div className="bg-blue-50 p-4 rounded-md mb-4 border border-blue-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-blue-800 font-medium">L'année académique active "{activeYear?.name}" a des périodes fermées.</p>
                <p className="text-xs text-blue-700 mt-1">Du {activeYear?.startDate} au {activeYear?.endDate}</p>
                <p className="text-xs text-blue-700 mt-1">Aucune période de saisie n'est actuellement ouverte.</p>
              </div>
              {isManager && (
                <button disabled={loading} onClick={() => { setYearEditForm({startDate: activeYear?.startDate || '', endDate: activeYear?.endDate || ''}); setShowYearEditModal(true); }} className="px-3 py-1 bg-white border border-blue-600 text-blue-700 rounded text-sm hover:bg-blue-50">Modifier les dates</button>
              )}
            </div>
            {isManager && (
              <div className="mt-4 flex gap-2">
                <button disabled={loading} onClick={() => setShowPeriodModal(true)} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Ajouter une période</button>
              </div>
            )}
          </div>
        );
      case 'READY':
        return (
          <div className="bg-green-50 p-4 rounded-md mb-4 border border-green-200">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-sm text-green-800 font-medium">Calendrier utilisable</p>
                <p className="text-xs text-green-700 mt-1 flex items-center gap-2">
                  <span className="font-semibold bg-green-200 px-1 py-0.5 rounded">Année active</span> {activeYear?.name}
                  <span className="text-gray-600 font-mono text-[10px]">Du {activeYear?.startDate} au {activeYear?.endDate}</span>
                  {isManager && (
                    <button disabled={loading} onClick={() => { setYearEditForm({startDate: activeYear?.startDate || '', endDate: activeYear?.endDate || ''}); setShowYearEditModal(true); }} className="px-2 py-0.5 text-[10px] bg-white border border-green-600 text-green-700 rounded hover:bg-green-50">Modifier</button>
                  )}
                </p>
                <p className="text-xs text-green-700 mt-1">
                  <span className="font-semibold bg-green-200 px-1 py-0.5 rounded">Période ouverte</span> {openPeriod?.name}
                </p>
                <p className="text-xs text-green-700 mt-1">{activeYearPeriods.length} période(s) configurée(s).</p>
              </div>
              {isManager && (
                <button disabled={loading} onClick={() => setShowPeriodModal(true)} className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700">Ajouter une période</button>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <div id="academic-calendar" className="mt-8 bg-white p-6 rounded-lg shadow border border-gray-200">
      <h2 className="text-lg font-semibold text-gray-800 mb-2">Calendrier académique</h2>
      <p className="text-sm text-gray-600 mb-6">
        Le calendrier académique structure les périodes de saisie des notes et les bulletins. Le champ général Année scolaire de l'établissement est uniquement informatif.
      </p>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {renderState()}

      {activeYearPeriods.length > 0 && (
        <div className="mt-6 border-t border-gray-200 pt-4">
          <h3 className="text-md font-medium text-gray-800 mb-3">Périodes de l'année active</h3>
          <div className="space-y-3">
            {activeYearPeriods.sort((a, b) => a.order - b.order).map(period => (
              <div key={period.id} className="flex justify-between items-center p-3 bg-gray-50 rounded border border-gray-200">
                <div>
                  <p className="text-sm font-semibold text-gray-800">{period.name} <span className="text-xs font-normal text-gray-500">({period.startDate} - {period.endDate})</span></p>
                  <p className="text-xs text-gray-600">Statut : <span className="font-medium">{period.status}</span></p>
                </div>
                {isManager && (
                  <div className="flex gap-2">
                    {period.status === 'draft' && (
                      <button disabled={loading} onClick={() => openAcademicPeriod(period.id)} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200">Ouvrir</button>
                    )}
                    {period.status === 'open' && (
                      <button disabled={loading} onClick={() => closeAcademicPeriod(period.id)} className="px-2 py-1 bg-gray-200 text-gray-800 rounded text-xs hover:bg-gray-300">Fermer</button>
                    )}
                    {period.status === 'closed' && (
                      <>
                        <button disabled={loading} onClick={() => openAcademicPeriod(period.id)} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200">Ré-ouvrir</button>
                        <button disabled={loading} onClick={() => publishAcademicPeriod(period.id)} className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200">Publier</button>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Year Modal */}
      {showYearModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Créer une année scolaire</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nom de l'année</label>
                <input id="yearNameInput" type="text" value={yearForm.name || ''} onChange={e => setYearForm({...yearForm, name: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" placeholder="ex: 2026-2027" />
                {fieldErrors.name && <p className="text-sm text-red-600 mt-1">{fieldErrors.name}</p>}
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Date de début</label>
                  <input id="yearStartDateInput" type="date" value={yearForm.startDate || ''} onChange={e => { setYearForm({...yearForm, startDate: e.target.value}); clearPeriodFieldError('startDate'); }} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                  {fieldErrors.startDate && <p className="text-sm text-red-600 mt-1">{fieldErrors.startDate}</p>}
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Date de fin</label>
                  <input id="yearEndDateInput" type="date" value={yearForm.endDate || ''} onChange={e => { setYearForm({...yearForm, endDate: e.target.value}); clearPeriodFieldError('endDate'); }} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                  {fieldErrors.endDate && <p className="text-sm text-red-600 mt-1">{fieldErrors.endDate}</p>}
                </div>
              </div>
              <div className="flex items-center mt-2">
                <input type="checkbox" id="activateImmediately" checked={activateYearImmediately} onChange={e => setActivateYearImmediately(e.target.checked)} className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded" />
                <label htmlFor="activateImmediately" className="ml-2 block text-sm text-gray-900">Définir comme année active</label>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button disabled={loading} onClick={() => { setShowYearModal(false); setFieldErrors({}); }} className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Annuler</button>
              <button disabled={loading} onClick={handleCreateYear} className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">{loading ? 'Création...' : 'Créer'}</button>
            </div>
            {fieldErrors.general && <p className="text-sm text-red-600 mt-2 text-center">{fieldErrors.general}</p>}
          </div>
        </div>
      )}

      {/* Year Edit Bounds Modal */}
      {showYearEditModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Modifier les dates de l'année scolaire</h3>
            <p className="text-sm text-gray-500 mb-4">Les nouvelles dates doivent inclure toutes les périodes existantes.</p>
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Date de début</label>
                  <input type="date" value={yearEditForm.startDate} onChange={e => setYearEditForm({...yearEditForm, startDate: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Date de fin</label>
                  <input type="date" value={yearEditForm.endDate} onChange={e => setYearEditForm({...yearEditForm, endDate: e.target.value})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <button disabled={loading} onClick={() => setShowYearEditModal(false)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Annuler</button>
                <button disabled={loading} onClick={handleUpdateYearBounds} className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">Enregistrer</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Period Modal */}
      {showPeriodModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Créer une période</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Nom de la période</label>
                <input id="periodNameInput" type="text" value={periodForm.name || ''} onChange={e => { setPeriodForm({...periodForm, name: e.target.value}); clearPeriodFieldError('name'); }} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" placeholder="ex: 1er Trimestre" />
                {fieldErrors.name && <p className="text-sm text-red-600 mt-1">{fieldErrors.name}</p>}
              </div>
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Type</label>
                  <select value={periodForm.type || 'term'} onChange={e => setPeriodForm({...periodForm, type: e.target.value as Period['type']})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border">
                    <option value="term">Trimestre</option>
                    <option value="semester">Semestre</option>
                    <option value="sequence">Séquence</option>
                    <option value="custom">Personnalisé</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Ordre</label>
                  <input type="number" min="1" value={periodForm.order || 1} onChange={e => setPeriodForm({...periodForm, order: parseInt(e.target.value)})} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                </div>
              </div>
              {fieldErrors.academicYear && <p className="text-sm text-red-600 mt-1">{fieldErrors.academicYear}</p>}
              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Date de début</label>
                  <input id="periodStartDateInput" type="date" value={periodForm.startDate || ''} onChange={e => { setPeriodForm({...periodForm, startDate: e.target.value}); clearPeriodFieldError('startDate'); }} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                  {fieldErrors.startDate && <p className="text-sm text-red-600 mt-1">{fieldErrors.startDate}</p>}
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700">Date de fin</label>
                  <input id="periodEndDateInput" type="date" value={periodForm.endDate || ''} onChange={e => { setPeriodForm({...periodForm, endDate: e.target.value}); clearPeriodFieldError('endDate'); }} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-2 border" />
                  {fieldErrors.endDate && <p className="text-sm text-red-600 mt-1">{fieldErrors.endDate}</p>}
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button disabled={loading} onClick={() => { setShowPeriodModal(false); setFieldErrors({}); }} className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Annuler</button>
              <button disabled={loading} onClick={handleCreatePeriod} className="px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">{loading ? 'Création...' : 'Créer'}</button>
            </div>
            {fieldErrors.general && <p className="text-sm text-red-600 mt-2 text-center">{fieldErrors.general}</p>}
          </div>
        </div>
      )}
    </div>
  );
};

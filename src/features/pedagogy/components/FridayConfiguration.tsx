import { useEffect, useRef, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../../db/firebase';

export function FridayConfiguration({ schoolId, academicYearId, classes, canEdit }: { schoolId: string; academicYearId: string; classes: Array<{ id: string; label: string }>; canEdit: boolean }) {
  const [enabled, setEnabled] = useState(false), [localTime, setLocalTime] = useState('10:00'), [classIds, setClassIds] = useState<string[]>([]);
  const [version, setVersion] = useState(0), [loaded, setLoaded] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [execution, setExecution] = useState('Aucune exécution vérifiée.');
  const lock = useRef(false);
  useEffect(() => {
    let alive = true;
    void getDoc(doc(db, 'pedagogyFridayConfigurations', schoolId)).then(snapshot => {
      if (!alive) return;
      const value = snapshot.data();
      if (value) {
        setVersion(value.version);
        if (value.academicYearId === academicYearId) { setEnabled(value.enabled === true); setLocalTime(value.localTime); setClassIds(value.classIds); }
        else setMessage('La configuration précédente appartient à une autre année. Une nouvelle activation explicite est nécessaire.');
        const date = value.lastSuccessAt?.toDate?.();
        setExecution(date ? `Dernière génération réussie : ${date.toLocaleString('fr-FR', { timeZone: 'Africa/Douala' })} (Douala).` : 'Aucune génération automatique réussie enregistrée.');
        if (value.lastError) setExecution(current => `${current} Une tentative nécessite une vérification administrative.`);
      }
      setLoaded(true);
    }).catch(() => { if (alive) setMessage('Configuration indisponible. Aucun changement effectué.'); });
    return () => { alive = false; };
  }, [schoolId, academicYearId]);
  const save = async () => {
    if (!loaded || !canEdit || lock.current) return;
    lock.current = true; setBusy(true);
    try {
      const result = await httpsCallable<unknown, { version: number }>(functions, 'savePedagogyFridayConfiguration')({ schoolId, academicYearId, expectedVersion: version, policy: { enabled, localTime, classIds } });
      setVersion(result.data.version); setMessage('Configuration enregistrée. Ce message ne certifie ni un déclenchement ni le fonctionnement du fournisseur IA.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Enregistrement non confirmé : rechargez.'); }
    finally { lock.current = false; setBusy(false); }
  };
  return <section className="pedagogy-card">
    <h2>Préparation automatique du vendredi</h2>
    <p>Fuseau Africa/Douala. Une vérification serveur a lieu toutes les 15 minutes ; les classes sont traitées progressivement à partir de l’heure choisie, uniquement pendant une semaine ouverte.</p>
    <p>Les sources sont capturées lors de chaque tentative de génération. Les confirmations ultérieures sont signalées dans l’évaluation ; aucune validation, impression ou diffusion n’est automatique. Trois tentatives au maximum par classe et semaine.</p>
    <p>Le fournisseur IA et son budget doivent être autorisés séparément. Une classe en observations sans note ne produit pas d’évaluation chiffrée.</p>
    <p>{execution}</p>
    {message && <p role="status">{message}</p>}
    <fieldset disabled={!loaded || !canEdit || busy}>
      <label><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} /> Activer explicitement pour cette année</label>
      <label>Heure du vendredi à Douala<input type="time" value={localTime} onChange={event => setLocalTime(event.target.value)} /></label>
      <p>Classes autorisées :</p>
      {classes.map(item => <label key={item.id}><input type="checkbox" checked={classIds.includes(item.id)} onChange={event => setClassIds(previous => event.target.checked ? [...previous, item.id] : previous.filter(id => id !== item.id))} /> {item.label}</label>)}
      {canEdit && <button className="pedagogy-button" onClick={() => void save()}>Enregistrer l’automatisation</button>}
    </fieldset>
  </section>;
}

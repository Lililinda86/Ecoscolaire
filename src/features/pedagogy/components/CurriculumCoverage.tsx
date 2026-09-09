import { useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { configuredCurriculumCoverage } from '../services/curriculumCoverage';
import { classCoverageSummary } from '../services/classCoverageSummary';
import type { CurriculumProgram, SchoolCurriculumAdoption } from '../types';
import { getDisplayClassName } from '../../../utils/classCatalog';
export function CurriculumCoverage({ yearId, programs, adoptions, unavailable }: { yearId?: string; programs: CurriculumProgram[]; adoptions: SchoolCurriculumAdoption[]; unavailable: boolean }) {
  const { db, currentSchool } = useAppContext();
  const [page, setPage] = useState(0);
  if (!db || !currentSchool || !yearId || unavailable) return <section className="pedagogy-card"><h2>Couverture du référentiel</h2><p>Couverture indisponible : chargement ou périmètre incomplet. Pas de pourcentage annoncé.</p></section>;
  const rows = configuredCurriculumCoverage(currentSchool.id, yearId, db.classes || [], db.classSubjects || [], db.classPrograms || [], programs, adoptions);
  const totalClasses = new Set(rows.map(row => row.classId)).size;
  const exportMatrix = () => {
    const blob = new Blob([JSON.stringify({ schoolId: currentSchool.id, academicYearId: yearId, generatedAt: new Date().toISOString(), scope: 'configured classes, not proof of actual opening', rows }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'curriculum-coverage.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="pedagogy-card"><h2>Programmes de vos classes</h2>
    <p>Commencez par les classes dont le niveau ou les matières restent à configurer. Une adoption enregistrée ne prouve pas la couverture officielle.</p>
    {classCoverageSummary(rows).map(item => <article className="pedagogy-list-row" key={item.classId}><div><strong>{getDisplayClassName(item.name)}</strong><small>{!item.levelMapped ? 'À faire : rattacher le niveau.' : !item.subjects ? 'À faire : configurer les matières/domaines.' : !item.adopted ? 'À faire : examiner le programme avant adoption.' : 'Décision d’adoption reçue.'}</small><small>Matières/domaines configurés : {item.subjects}. Total attendu : à vérifier dans le référentiel.</small></div></article>)}
    <details><summary>Détails / Administration / Couverture</summary>
    <p>{totalClasses} classe(s) active(s) configurée(s), {rows.length} ligne(s) classe/matière ou domaine. Les niveaux et matières manquants restent visibles. L’ouverture réelle et les décisions pédagogiques sont à confirmer.</p>
    <p>Huit programmes MINEDUB 2018 authentifiés et deux variantes sont référencés dans les ressources. Cela ne prouve pas une correspondance classe/matière ni leur applicabilité actuelle. Aucun rattachement officiel acquis. Pour une classe antérieure au périmètre officiel retrouvé : ITALO_EARLY_YEARS_PROGRAM, validation humaine requise, jamais MINEDUB par défaut.</p>
    <button disabled={!rows.length} onClick={exportMatrix}>Exporter la matrice complète (JSON)</button>
    {rows.slice(page * 25, (page + 1) * 25).map((row, index) => <details key={row.classId + ':' + index}><summary>{row.className} · {row.section} · {row.subject}</summary><p>Niveau : {row.level} ; sous-système : {row.subsystem}.</p><p>Correspondance source/matière trouvée/authentifiée : non/non. Droits connus : non. Contenu de cette ligne extrait/structuré/publié : non/non/non. Revue humaine : requise. Décision d’adoption de version reçue : {row.adoptedByITALO ? 'oui' : 'non établie'}.</p><p>Candidats documentaires (nom de niveau seulement, pas adoption) : {row.candidateDocumentIds.join(', ') || 'aucun rattachement nominal'}</p><p>{row.missingReason}</p></details>)}
    {!rows.length && <p>Aucune classe disponible ; cela ne signifie pas une couverture de 100 %.</p>}
    <button disabled={!page} onClick={() => setPage(page - 1)}>Précédent</button><span> Page {page + 1} </span><button disabled={(page + 1) * 25 >= rows.length} onClick={() => setPage(page + 1)}>Suivant</button>
    </details>
  </section>;
}

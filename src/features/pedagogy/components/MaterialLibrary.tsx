import { useState } from 'react';
import { DocumentaryModules } from './DocumentaryModules';
import { useAppContext } from '../../../context/AppContext';
import { filterMaterials, materialCatalog, materialProvenance, materialPreparationText, type PedagogicalMaterial, type MaterialFilters } from '../resources/materialCatalog';

export function MaterialLibrary() {
  const { db, currentSchool } = useAppContext();
  const [filters, setFilters] = useState<MaterialFilters>({});
  const [classId, setClassId] = useState('');
  const classes = (db?.classes || []).filter(c => c.schoolId === currentSchool?.id && c.isActive !== false);
  const selectedClass = classes.find(c => c.id === classId);
  const resources = classId && !selectedClass?.catalogLevelId ? [] : filterMaterials({ ...filters, level: selectedClass?.catalogLevelId || filters.level });
  const options = (values: string[]) => [...new Set(values)].sort();
  const exportMetadata = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(materialCatalog.map(materialProvenance), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'PEDAGOGICAL_MATERIAL_METADATA.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportOutline = (d: PedagogicalMaterial) => {
    const text = materialPreparationText(d); if (!text) return;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = d.id + '-italo-local-outline.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const select = (key: keyof MaterialFilters, label: string, values: string[]) => <label>{label}<select aria-label={label} value={filters[key] || ''} onChange={e => { setFilters({ ...filters, [key]: e.target.value }); if (key === 'level') setClassId(''); }}><option value="">Tous</option>{options(values).map(v => <option key={v}>{v}</option>)}</select></label>;
  return <section className="pedagogy-card pedagogy-material-library" data-testid="material-library">
    <h2>Bibliothèque documentaire et activités</h2>
    <button onClick={exportMetadata}>Exporter les notices et réserves documentaires</button>
    <p>Consultation sans adoption : 8 curricula MINEDUB, 79 documents MINESEC distincts issus de 81 notices, 3 références GCE et 40 propositions originales préscolaires. Les PDF externes restent chez leur éditeur. Un filtre de classe indique une référence candidate, jamais une équivalence approuvée. Les ressources d’examen sans rattachement documenté restent visibles en choisissant « Toutes » les classes.</p>
    <div className="pedagogy-form-grid">
      <label>Classe de la bibliothèque<select aria-label="Classe de la bibliothèque" value={selectedClass ? classId : ''} onChange={e => setClassId(e.target.value)}><option value="">Toutes</option>{classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      {select('level', 'Niveau documentaire', materialCatalog.flatMap(d => d.levels))}
      {select('subject', 'Matière ou domaine documentaire', materialCatalog.flatMap(d => d.subjects))}
      {select('theme', 'Thème documentaire', materialCatalog.flatMap(d => d.themes))}
      {select('type', 'Type de ressource', materialCatalog.map(d => d.type))}
      {select('language', 'Langue documentaire', materialCatalog.map(d => d.language))}
      {select('source', 'Source documentaire', materialCatalog.map(d => d.authority))}
      <label>Recherche documentaire<input aria-label="Recherche documentaire" value={filters.search || ''} onChange={e => setFilters({ ...filters, search: e.target.value })} /></label>
    </div>
    <p role="status">{resources.length} ressource(s) correspondant aux filtres.</p>
    {resources.map(d => <details key={d.id}><summary>{d.title} · {d.authority} · {d.type}</summary><p>{d.note}</p><DocumentaryModules documentId={d.id} level={selectedClass?.catalogLevelId || filters.level} />{d.preparationOutline && <div><h3>Canevas local de préparation — à compléter</h3><p>ITALO_LOCAL : aide originale, pas un formulaire officiel ni une préparation déjà rédigée.</p><ul>{d.preparationOutline.map(label => <li key={label}>{label}</li>)}</ul><button onClick={() => exportOutline(d)}>Exporter le canevas local</button></div>}<p>Provenance : {d.provenance}. Applicabilité : {d.applicability}. Droits : {d.rights}.</p><p>{d.subjects.join(' · ') || 'Discipline à vérifier'}</p>{d.url && <a href={d.url} target="_blank" rel="noopener noreferrer">Consulter chez l’éditeur</a>}<details><summary>Voir la provenance</summary><p>Édition : {d.edition}. {d.locator}. Récupération : {d.retrievedAt || 'voir le registre source'}.</p>{d.sourceAliases && d.sourceAliases.length > 1 && <p>Alias de fichier identique : {d.sourceAliases.map(a => a.id).join(", ")}. Toutes les notices restent dans le registre exporté.</p>}<p style={{ overflowWrap: 'anywhere' }}>Version : {d.sourceVersion}</p></details></details>)}
    {!resources.length && <p>Aucune ressource documentée pour cette combinaison ; aucun contenu n’est inventé.</p>}
  </section>;
}

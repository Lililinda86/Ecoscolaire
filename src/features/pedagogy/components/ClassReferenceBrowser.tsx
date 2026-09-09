import { useState } from 'react';
import { useAppContext } from '../../../context/AppContext';
import { minedubSubjectIndex, referenceForClass } from '../resources/minedubSubjectIndex';
import { provenanceRegistry } from '../resources/provenanceRegistry';
import { structuredReviewExcerpts } from '../resources/minedubVerified';
export function ClassReferenceBrowser() {
  const { db, currentSchool } = useAppContext();
  const [classId, setClassId] = useState('');
  const classes = (db?.classes || []).filter(item => item.schoolId === currentSchool?.id && item.isActive !== false);
  const classroom = classes.find(item => item.id === classId);
  const match = classroom ? referenceForClass(classroom.name, classroom.section || classroom.type || '') : null;
  const source = provenanceRegistry.find(item => item.id === match?.documentId);
  const index = minedubSubjectIndex.find(item => item.documentId === match?.documentId);
  const excerpts = structuredReviewExcerpts.filter(item => item.documentId === match?.documentId);
  return <section className="pedagogy-card"><h2>Référentiel par classe</h2>
    <label>Classe à consulter<select value={classroom?.id || ''} onChange={event => setClassId(event.target.value)}><option value="">Choisir une classe…</option>{classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {match && <><p><strong>{match.status}</strong> — {match.reason}</p>
      {source && <><h3>{source.title}</h3><p>{source.authority} · édition {source.edition} · {source.status}. Applicabilité actuelle et validation pédagogique à confirmer.</p><a href={source.retrievalUrl!} target="_blank" rel="noopener noreferrer">Ouvrir la source ministérielle</a></>}
      {index && <><h3>{index.kind === 'domains' ? 'Domaines de développement documentés' : 'Matières documentées'}</h3><p>Sommaire, pages PDF {index.pdfPages.join(', ')}. Cette liste n’est pas encore une configuration locale approuvée.</p><ul>{index.names.map(name => <li key={name}>{name}</li>)}</ul></>}
      {source?.id === 'minesec-seconde-english-2018-pending' && <details><summary>Anglais — lecture localisée du module 1</summary><p>Thème (reformulé) : repérage des lieux, aide urgente et bénévolat.</p><p>Objectif (reformulé) : demander ou donner des indications, solliciter une aide et proposer sa participation.</p><p>Compétence (reformulée) : communiquer en anglais dans ces situations sociales concrètes.</p><p>Source : page PDF 11, module 1. Les volumes de la page 8 varient selon la série ; aucun volume choisi automatiquement. Document en attente de vérification complète et d’applicabilité, aucune validation enseignante.</p></details>}
      {excerpts.map(item => <details key={item.id}><summary>{item.subject} — exemple localisé pour {item.level}</summary><p>Domaine : {item.domain}. Unité : {item.officialUnit || 'non précisée'}.</p><p>Objectif (reformulation) : {item.objectiveParaphrase}</p><p>Compétence (reformulation) : {item.competencyParaphrase}</p><p>Page PDF {item.sourcePdfPage} — {item.sourceLocator}</p><p>Extrait partiel du document, pas nécessairement de la classe sélectionnée. Validation pédagogique requise ; aucune leçon enseignée déduite.</p></details>)}
    </>}
  </section>;
}

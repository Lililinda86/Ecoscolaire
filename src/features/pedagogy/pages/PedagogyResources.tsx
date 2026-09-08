import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { originalTemplates, templateText } from '../resources/originalTemplates';
import { sourceReferences } from '../resources/sourceReferences';
import { provenanceRegistry, provenanceBadge } from '../resources/provenanceRegistry';
import { pedagogicalReviewPackText } from '../resources/pedagogicalReviewPack';
import { structuredReviewExcerpts } from '../resources/minedubVerified';
import { resourceTaxonomy } from '../resources/resourceTaxonomy';
import type { OriginalTemplate, ResourceCycle } from '../resources/originalTemplates';

const cycleLabels: Record<ResourceCycle, string> = { pre_nursery: 'Prématernelle / Pre-nursery', nursery: 'Maternelle / Nursery', primary: 'Primaire / Primary', secondary: 'Collège / Secondary' };
export default function PedagogyResources() {
  const [language, setLanguage] = useState(''), [cycle, setCycle] = useState(''), [search, setSearch] = useState('');
  const resources = originalTemplates.filter(item => (!language || item.language === language) && (!cycle || item.cycle === cycle) && (item.title + ' ' + item.objective).toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
  const download = (resource: OriginalTemplate) => {
    const url = URL.createObjectURL(new Blob([templateText(resource)], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url; link.download = resource.id + '.txt'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadReviewPack = () => {
    const url = URL.createObjectURL(new Blob([pedagogicalReviewPackText()], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = 'PEDAGOGICAL_REVIEW_PACK.md'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const downloadRegistry = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(provenanceRegistry, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'PROVENANCE_REGISTRY.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="pedagogy-page">
    <PedagogyHeader title="Ressources pédagogiques" description="Modèles intégrés consultables et exportables. Aucun téléchargement ne vaut adoption, cours enseigné ou validation par un enseignant." /><PedagogyNav />
    <button onClick={downloadRegistry}>Exporter le registre complet de provenance (JSON)</button>
    <section className="pedagogy-card"><h2>Dossier de revue pédagogique humaine</h2><p>Cinq exemples : maternelle FR, primaire FR/EN, secondaire FR/EN. Références MINEDUB localisées lorsqu’elles sont disponibles, exemples internes originaux, progression proposée, préparation, bilan/évaluation, corrigé, preuves d’objectifs et remédiation. Correspondances ITALO et décisions humaines en attente ; sources secondaires manquantes.</p><button onClick={downloadReviewPack}>Télécharger PEDAGOGICAL_REVIEW_PACK</button></section>
    <section className="pedagogy-card"><h2>Classement des ressources et épreuves</h2><p>Ces catégories ne sont pas un inventaire de documents disponibles. La banque actuelle contient uniquement les évaluations internes effectivement validées dans le périmètre sélectionné.</p>{resourceTaxonomy.map(category => <details key={category.kind}><summary>{category.label}</summary><p>{category.requirement}</p></details>)}</section>
    <div className="pedagogy-alert"><strong>Fonds original à relire : 8 modèles, 4 cycles, français et anglais.</strong><p>Ces textes ont été rédigés avec un assistant pour le projet. Ils ne sont ni des programmes officiels, ni des extraits de CEDUC, ni des contenus validés par les enseignants. Les rattachements au programme et l’adaptation à la classe restent à confirmer.</p></div>
    <section className="pedagogy-card"><h2>Registre hiérarchisé de provenance</h2><p>MINEDUB : éducation de base. MINESEC : secondaire. MINESUP : uniquement si pertinent. CEDUC : complémentaire, jamais autorité du curriculum.</p>{provenanceRegistry.map(record => <details key={record.id}><summary>{record.title} · {provenanceBadge(record)}</summary><p>Émetteur : {record.issuingOrganization || 'non identifié'}. Hébergeur : {record.hostingOrganization || 'non identifié'}.</p><p>{record.applicability} · {record.accessStatus} · droits {record.rightsStatus} · stockage {record.storagePolicy}</p><p>{record.missingReason}</p>{record.retrievalUrl && <a href={record.retrievalUrl} target="_blank" rel="noopener noreferrer">Consulter le lien externe</a>}<p>Édition : {record.edition || 'inconnue'} ; date d’effet : {record.effectiveDate || 'inconnue'} ; vérification : {record.verifiedAt || 'non établie'}.</p><p style={{ overflowWrap: 'anywhere' }}>SHA-256 : {record.checksumSha256 || 'non établi'}</p><p>{record.verificationMethod} Aucune adoption ou publication automatique.</p></details>)}</section>
    <section className="pedagogy-card"><h2>Extraits structurés pour la revue</h2><p>Quatre paraphrases analytiques localisées, pas un import exhaustif. Heures, leçons et équivalences inconnues restent vides. Correspondance classe et applicabilité actuelle à confirmer par l’enseignant.</p>{structuredReviewExcerpts.map(excerpt => <details key={excerpt.id}><summary>{excerpt.level} · {excerpt.subject} · {excerpt.language.toUpperCase()}</summary><p>{excerpt.sourceLocator} — PDF p. {excerpt.sourcePdfPage}, page imprimée {excerpt.sourcePrintedPage}.</p><p>{excerpt.objectiveParaphrase}</p><p>{excerpt.competencyParaphrase}</p><p>Leçon officielle : {excerpt.officialLesson || 'non précisée'} ; heures : {excerpt.recommendedHours ?? 'non précisées'}. {excerpt.status}</p></details>)}</section>
    <section className="pedagogy-card">
      <div className="pedagogy-filters"><label>Langue<select aria-label="Langue" value={language} onChange={event => setLanguage(event.target.value)}><option value="">Toutes</option><option value="fr">Français</option><option value="en">English</option></select></label><label>Cycle<select aria-label="Cycle" value={cycle} onChange={event => setCycle(event.target.value)}><option value="">Tous</option>{Object.entries(cycleLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label><label>Recherche<input aria-label="Recherche" value={search} onChange={event => setSearch(event.target.value)} placeholder="Titre ou objectif" /></label></div>
      <p role="status">{resources.length} modèle(s) affiché(s). Consultation locale, sans appel IA.</p>
      {resources.map(resource => <details key={resource.id} className="pedagogy-template-section" lang={resource.language}><summary><strong>{resource.title}</strong> · {cycleLabels[resource.cycle]} · {resource.language.toUpperCase()} · v{resource.version}</summary>
        <p><strong>{resource.language === 'en' ? 'DRAFT - TEACHER REVIEW REQUIRED' : 'BROUILLON - RELECTURE ENSEIGNANT REQUISE'}</strong></p>
        <p>{resource.objective}</p><p>{resource.materials}</p><ol>{resource.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
        <h3>{resource.language === 'en' ? 'Differentiation' : 'Différenciation'}</h3><p>{resource.differentiation}</p>
        <h3>{resource.language === 'en' ? 'Observation' : 'Observation'}</h3><p>{resource.observation}</p>
        <h3>{resource.language === 'en' ? 'Safety' : 'Sécurité'}</h3><p>{resource.safety}</p>
        <button onClick={() => download(resource)}>{resource.language === 'en' ? 'Download draft text' : 'Télécharger le modèle texte'}</button>
      </details>)}
      {!resources.length && <p>Aucun modèle pour ces filtres.</p>}
    </section>
    <section className="pedagogy-card"><h2>Sources externes et banque d’épreuves</h2><p><Link to="/pedagogy/exam-bank">Consulter la banque interne des évaluations validées de cet établissement</Link>. Ces créations internes ne sont pas des annales officielles ; leur nouvelle utilisation exige une nouvelle relecture.</p><p>Le fonds institutionnel et les annales externes authentifiées ne sont pas encore intégrés. Aucun corrigé authentique externe n’est annoncé disponible.</p><p>CEDUC : connexion et droits de réutilisation non vérifiés. Ces modèles restent disponibles indépendamment de ce service. Aucun contenu tiers n’a été copié dans ce fonds.</p></section>
    <section className="pedagogy-card"><h2>Références documentaires — liens uniquement</h2><p>Ces métadonnées ne sont pas des documents intégrés. Une page accessible, une copie ou un nom de domaine ne prouvent ni authenticité, ni version actuelle, ni droits de réutilisation. Aucun contenu de ces liens ne sert automatiquement aux cours.</p>
      {sourceReferences.map(source => <article key={source.id}><h3><a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a></h3><p>Émetteur : {source.publisher}. Hébergement : {source.host}.</p><p>{source.coverage}</p><p>Contrôle du {source.checkedOn} : {source.access}</p><p>{source.rights}</p></article>)}
    </section>
  </div>;
}

import { useState } from 'react';
import { PedagogyHeader, PedagogyNav } from '../components/PedagogyNav';
import { originalTemplates, templateText } from '../resources/originalTemplates';
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
  return <div className="pedagogy-page">
    <PedagogyHeader title="Ressources pédagogiques" description="Modèles intégrés consultables et exportables. Aucun téléchargement ne vaut adoption, cours enseigné ou validation par un enseignant." /><PedagogyNav />
    <div className="pedagogy-alert"><strong>Fonds original à relire : 8 modèles, 4 cycles, français et anglais.</strong><p>Ces textes ont été rédigés avec un assistant pour le projet. Ils ne sont ni des programmes officiels, ni des extraits de CEDUC, ni des contenus validés par les enseignants. Les rattachements au programme et l’adaptation à la classe restent à confirmer.</p></div>
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
    <section className="pedagogy-card"><h2>Sources externes et banque d’épreuves</h2><p>Le fonds institutionnel et la banque d’épreuves authentifiées ne sont pas encore intégrés. Aucun corrigé authentique n’est annoncé disponible.</p><p>CEDUC : connexion et droits de réutilisation non vérifiés. Ces modèles restent disponibles indépendamment de ce service. Aucun contenu tiers n’a été copié dans ce fonds.</p></section>
  </div>;
}

import { defaultPedagogyPolicy } from './pedagogyPolicy';
export function preparationFormatFor(classroom: Parameters<typeof defaultPedagogyPolicy>[0]) {
  const policy = defaultPedagogyPolicy(classroom), preschool = ['pre_nursery', 'preschool'].includes(policy.stage), en = policy.language === 'en';
  const titles = preschool ? en ? [
    'Level, learning domain and theme', 'Objective and observable learning', 'Prior experiences', 'Materials and safety', 'Planned duration — teacher choice',
    'Welcome and context', 'Discovery activity', 'Manipulation and play', 'Guided activity', 'Individual or group activity', 'Verbalisation', 'Child observation — no marks', 'Consolidation', 'Adaptation and support', 'Extension',
  ] : [
    'Niveau, domaine et thème', 'Objectif et acquis observable', 'Prérequis / expériences familières', 'Matériel et sécurité', 'Durée prévue — choix enseignant',
    'Accueil et mise en situation', 'Activité de découverte', 'Manipulation et jeu', 'Activité guidée', 'Activité individuelle ou en groupe', 'Verbalisation', 'Observation de l’enfant — sans note', 'Consolidation', 'Adaptation et remédiation', 'Prolongement',
  ] : ['Objectif et prérequis', 'Matériel et supports', 'Déroulement de la séance', 'Évaluation', 'Différenciation et remédiation'];
  return { preschool, language: policy.language, schemaVersion: preschool ? 'preschool-preparation-template-v2' : 'lesson-preparation-template-v1', titles };
}

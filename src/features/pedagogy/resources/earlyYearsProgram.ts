import { minedubDocuments } from './minedubVerified';
import { minedubSubjectIndex } from './minedubSubjectIndex';

/** Original ITALO proposals. Domain labels are referenced to MINEDUB; the local
 * stages, activities and progression below are NOT ministerial equivalences. */
export const earlyYearsLevels = [
  { id: 'fr-preschool-pre', language: 'fr', stage: 0, label: 'Pré-maternelle' },
  { id: 'fr-preschool-ps', language: 'fr', stage: 1, label: 'Petite Section' },
  { id: 'fr-preschool-ms', language: 'fr', stage: 2, label: 'Moyenne Section' },
  { id: 'fr-preschool-gs', language: 'fr', stage: 3, label: 'Grande Section' },
  { id: 'en-nursery-pre', language: 'en', stage: 0, label: 'Pre-Nursery' },
  { id: 'en-nursery-1', language: 'en', stage: 1, label: 'Nursery 1' },
  { id: 'en-nursery-2', language: 'en', stage: 2, label: 'Nursery 2' },
  { id: 'en-nursery-3', language: 'en', stage: 3, label: 'Nursery 3' },
] as const;
type ActivityRow = [title: string, objective: string, observable: string, activity: string, materials: string, support: string];
const fr: ActivityRow[][] = [
  [
    ['Le panier des mots', 'Entrer dans un échange autour d’un objet familier.', 'Montre, désigne ou nomme l’objet choisi, avec une aide notée.', 'Choisir une tasse ou un ballon, écouter le nom, demander par geste ou parole ; reprendre dans une courte comptine.', 'Gros objets familiers propres, panier stable.', 'Présenter deux objets seulement et accepter le geste.'],
    ['La marionnette écoute', 'Écouter une courte histoire et répondre à une question concrète.', 'Désigne un personnage et participe à un tour de parole.', 'Raconter une histoire originale très courte avec une marionnette ; laisser chaque enfant montrer puis dire ce qu’elle fait.', 'Marionnette lavable, album choisi par l’enseignant.', 'Rejouer une action et laisser un temps de réponse.'],
    ['Notre livre de la classe', 'Organiser oralement deux moments d’une expérience.', 'Raconte deux actions à l’aide de ses dessins.', 'Dessiner l’accueil et le jeu ; remettre les images en ordre ; dicter une phrase à l’adulte et feuilleter le livre commun.', 'Feuilles, gros crayons, reliure sécurisée.', 'L’adulte reformule sans exiger une lecture autonome.'],
    ['Raconter et faire comprendre', 'Construire un récit bref et écouter celui d’un camarade.', 'Relie début, action et fin, puis répond à une demande de précision.', 'Créer trois images d’une histoire vécue en classe ; raconter à un petit groupe ; jouer une réplique et repérer des mots qui se ressemblent à l’oral.', 'Trois cartes vierges, crayons adaptés, livre familier.', 'Choisir deux images et raconter d’abord avec l’adulte.'],
  ],
  [
    ['Toucher, regarder, retrouver', 'Explorer une propriété visible ou tactile.', 'Associe deux gros objets semblables après manipulation.', 'Manipuler des objets lisses et des tissus ; retrouver un objet semblable sans obligation de nommer la propriété.', 'Gros blocs et tissus propres, sans pièces détachables.', 'Réduire le choix et explorer ensemble, sans cacher les objets.'],
    ['Le marché des couleurs', 'Trier selon un critère concret annoncé.', 'Place un objet dans une famille de couleur et montre son choix.', 'Installer deux paniers ; jouer au marchand avec de gros objets ; changer le critère seulement après une reprise réussie.', 'Deux paniers, objets de deux couleurs.', 'Garder un modèle visible dans chaque panier.'],
    ['Observer une plante', 'Comparer un élément naturel à deux moments.', 'Décrit ou dessine une différence observée sans inventer sa cause.', 'Observer une plante non toxique avec l’adulte ; dessiner une feuille ; revoir la même plante et comparer ; ranger les contenants par taille.', 'Plante sûre, arrosoir léger manipulé avec l’adulte, papier.', 'Utiliser une observation guidée et un seul contraste.'],
    ['Organiser le coin des jeux', 'Choisir et expliquer une règle de classement.', 'Classe des objets puis vérifie si un nouvel objet suit la règle.', 'Trier par forme puis grandeur ; expliquer le changement ; distribuer un objet à chaque place et vérifier les places vides, sans imposer d’écriture numérique.', 'Gros blocs de formes variées, tapis et plateaux.', 'Revenir à un seul critère et à une petite collection.'],
  ],
  [
    ['Mes petits repères', 'Participer à une routine rassurante avec l’adulte.', 'Retrouve un repère personnel et accomplit une étape avec aide.', 'Accueillir, reconnaître le panier illustré, y poser un objet ; accompagner le lavage des mains et la demande d’aide sans pression sur la propreté.', 'Repères dessinés, matériel d’hygiène de l’établissement.', 'Même repère, même formulation, accompagnement bienveillant.'],
    ['Chacun son tour', 'Prendre part à un jeu partagé et à son rangement.', 'Attend brièvement avec soutien puis passe le matériel.', 'Faire circuler un gros objet pendant une chanson ; s’arrêter pour demander un tour ; ranger à deux dans le bac identifié.', 'Gros ballon souple, bac illustré.', 'Tour plus court, binôme avec adulte et consigne unique.'],
    ['Le chemin sûr dans la classe', 'Suivre une routine commune et demander de l’aide.', 'Explique une règle concrète et l’utilise dans une mise en situation.', 'Parcourir les coins de classe avec un camarade ; repérer où marcher et ranger ; jouer la demande d’aide lorsqu’un passage est encombré.', 'Images de routines, espace dégagé.', 'Répéter une seule situation avec modèle visuel.'],
    ['Préparer un atelier ensemble', 'Partager les responsabilités d’une petite tâche.', 'Choisit un rôle, organise le matériel et vérifie le rangement.', 'Préparer à plusieurs un atelier de dessin ; distribuer le matériel adapté, verbaliser les règles d’hygiène puis faire un bilan du travail commun.', 'Plateaux légers, crayons, pictogrammes de rôles.', 'Donner une responsabilité courte, guidée et valorisée.'],
  ],
  [
    ['Traces et sons doux', 'Explorer un geste créatif et un rythme bref.', 'Produit une trace ou reprend un geste rythmique sans modèle imposé.', 'Tracer au gros crayon sur une grande feuille ; écouter une comptine puis accompagner avec les mains ; laisser le choix de participer.', 'Gros crayons adaptés, grandes feuilles, voix de l’adulte.', 'Geste partagé si accepté ; aucune reproduction obligatoire.'],
    ['Couleurs en mouvement', 'Expérimenter des traces avec différents gestes.', 'Choisit un outil et décrit ou montre une trace.', 'Peindre avec un outil adapté puis modeler une forme libre ; présenter sa création au groupe avec un mot ou un geste.', 'Peinture non toxique, gros outils, pâte adaptée sous surveillance.', 'Une couleur, un outil et un temps bref au choix.'],
    ['Un paysage sonore', 'Associer création visuelle, musique et coopération.', 'Propose un rythme ou une forme et participe à une composition.', 'Dessiner la pluie puis inventer des sons avec les mains ; alterner les groupes et assembler les dessins en fresque.', 'Grand papier, crayons, espace calme.', 'Reprendre un rythme simple avec un pair.'],
    ['Notre petite scène', 'Combiner des moyens d’expression dans une création collective.', 'Explique un choix et adapte son geste à celui du groupe.', 'Créer un décor, modeler un personnage et jouer une courte scène originale ; raconter comment chacun a contribué.', 'Carton sans agrafes, outils adaptés, pâte sous surveillance.', 'Choisir un rôle non verbal ou une action simple.'],
  ],
  [
    ['Bouger à son rythme', 'Explorer un déplacement dans un espace sécurisé.', 'Se déplace vers un repère, s’arrête avec aide ou demande une pause.', 'Rejoindre un tapis, pousser un gros ballon, transporter un coussin ; l’adulte adapte chaque geste aux possibilités observées.', 'Tapis stable, coussins, gros ballon souple.', 'Raccourcir le parcours et proposer une aide acceptée.'],
    ['Le sentier des animaux', 'Coordonner déplacement et consigne simple.', 'Suit un trajet court et change de geste au signal.', 'Marcher sur une ligne large, s’accroupir pour saluer une image puis déposer un objet dans un panier ; recommencer en jouant.', 'Repères au sol non glissants, panier, gros objets.', 'Une seule action à la fois, sans course ni comparaison.'],
    ['Transporter et viser', 'Ajuster un geste à une cible accessible.', 'Change la direction ou la force de son geste après essai.', 'Transporter un objet léger, faire rouler un ballon vers une grande cible puis décrire une réussite ; alterner avec un jeu de pince à gros objets.', 'Ballon souple, grande cible au sol, objets adaptés.', 'Rapprocher la cible et élargir la prise.'],
    ['Inventer un parcours', 'Enchaîner des actions motrices et expliquer une règle.', 'Réalise une séquence choisie en respectant l’espace des autres.', 'Dessiner avec l’adulte un trajet simple ; marcher, contourner et lancer doucement ; tester puis adapter la règle avec le groupe.', 'Plots souples, cartes de gestes, ballon léger.', 'Réduire le nombre d’étapes, sans chronométrage compétitif.'],
  ],
];
const en: ActivityRow[][] = [
  [
    ['Hello, familiar voice', 'Join a short exchange through listening, gesture or words.', 'Responds to a familiar greeting or chooses an object to share.', 'Welcome a toy visitor; listen to a short repeated rhyme; offer a familiar object and wait for a gesture or word.', 'Washable toy, sturdy picture book, large familiar objects.', 'Use one familiar cue and accept non-verbal participation.'],
    ['The picture-book circle', 'Connect a spoken word with a picture and a shared action.', 'Points to a chosen picture and contributes a word or action.', 'Read a familiar illustrated story aloud; pause for children to choose a picture and act out one event.', 'Teacher-selected picture book and large picture cards.', 'Repeat a familiar page with an adult or partner.'],
    ['Messages for our visitors', 'Use oral language for a real classroom purpose.', 'Explains a classroom routine using pictures and a short spoken message.', 'Make a welcome sign with drawings; dictate words to the adult; practise explaining a routine to a toy visitor.', 'Paper, large crayons, a toy visitor.', 'Offer a picture sequence and model one short message.'],
    ['Tell, listen, retell', 'Organise an oral account and attend to another speaker.', 'Retells a short sequence and responds to a relevant question.', 'Share an original story with a beginning and an ending; arrange child-made pictures; retell in pairs and play with familiar rhyme sounds.', 'Child-made picture cards and a familiar book.', 'Retell two events together before adding detail.'],
  ],
  [
    ['Explore the object tray', 'Notice a visible difference during safe sensory play.', 'Chooses or pairs large objects with a shared feature.', 'Explore two textures and shapes with the adult; find another object that feels or looks similar; stop when the child needs a break.', 'Large washable objects, smooth cloth, shallow tray.', 'Offer two clear choices with an adult model.'],
    ['Finding matching homes', 'Group familiar items using one stated feature.', 'Places an item with a matching example and checks the choice.', 'Give toy objects a home in two labelled baskets; match colour or shape, not both at once; talk about what stays together.', 'Large blocks, baskets, visual examples.', 'Keep the matching example beside the child.'],
    ['Water for the class plant', 'Observe a living thing and describe a simple change.', 'Records a visible feature by drawing or speaking.', 'Observe a safe plant with an adult; compare drawings on another day; use empty containers to discuss larger and smaller.', 'Non-toxic plant, child-safe containers, paper.', 'Focus on one visible feature; adults handle water safely.'],
    ['Build, compare, explain', 'Test a simple arrangement and explain a sorting choice.', 'Changes a structure after an observation and explains a feature.', 'Build with large blocks; compare stable and unstable arrangements under supervision; organise the blocks for reuse and match one piece to each place.', 'Large stable blocks, floor mat, picture labels.', 'Use fewer blocks and invite shared construction.'],
  ],
  [
    ['My welcome routine', 'Participate in a familiar daily routine with support.', 'Finds a personal picture cue or asks for help.', 'Use a picture to find belongings, join supervised handwashing and practise asking for help; never pressure toilet independence.', 'Personal picture cues and school-approved hygiene materials.', 'Keep the same cue and offer calm individual support.'],
    ['Helping our classroom', 'Take turns and care for shared materials.', 'Carries out one shared task and passes an object to a peer.', 'Set up a pretend picnic with large play objects; take turns offering items and put them away together.', 'Large washable pretend-play objects, labelled basket.', 'Practise with one partner and a short turn.'],
    ['A safe choice', 'Use a familiar safety rule in a classroom situation.', 'Shows how to ask an adult for help rather than act unsafely.', 'Role-play a blocked walkway or a spill using a picture, not a real hazard; practise stopping, asking and keeping space for others.', 'Drawn situation cards and a clear classroom area.', 'Offer two illustrated actions and discuss the safe one.'],
    ['Working as a small team', 'Plan a short shared task and reflect on cooperation.', 'Explains a chosen role and checks the shared materials.', 'Prepare a story corner with a partner, decide who carries each safe item, invite another group and reflect on how the team helped.', 'Books, light cushions, role pictures.', 'Choose a smaller role with visible steps and adult support.'],
  ],
  [
    ['Marks, movement and sound', 'Explore self-expression through safe materials.', 'Makes a chosen mark, movement or sound.', 'Offer large crayons and paper; let the child explore a mark, then join a gentle clapping song if willing.', 'Age-appropriate large crayons, paper, adult voice.', 'Provide a stable surface and accept observation instead of participation.'],
    ['Make a rhythm picture', 'Connect a repeated sound with an expressive gesture.', 'Repeats or varies a simple gesture during a short song.', 'Clap a familiar rhythm, draw free marks to accompany it and talk about the picture without judging resemblance.', 'Large paper, safe drawing materials, familiar song.', 'Use a slower rhythm or a single repeated gesture.'],
    ['Our imaginary garden', 'Combine drawing, modelling and shared imaginative play.', 'Chooses a material and explains an imagined feature.', 'Draw or model a pretend garden, add a short song and invite a partner to describe a creation.', 'Non-toxic supervised modelling material, crayons, paper.', 'Offer one medium and a familiar starting object.'],
    ['A story through the arts', 'Cooperate in making and presenting an original scene.', 'Uses an artistic choice to communicate an idea to others.', 'Create simple props, decide on movements and sounds, then present an original scene to a small group and discuss the choices.', 'Safe cardboard, crayons, light props without loose parts.', 'Offer a non-speaking part or a single repeated movement.'],
  ],
  [
    ['Reach, carry, return', 'Explore whole-body and hand movements safely.', 'Reaches for or carries a large light object with suitable support.', 'Move between nearby floor markers, roll a soft ball and carry a cushion back; adapt the movement to the child, not a performance target.', 'Stable mat, large soft ball, light cushion.', 'Shorten the distance and offer supported or seated play.'],
    ['Follow the stepping story', 'Respond to a simple movement cue.', 'Starts, stops or changes a movement with a familiar signal.', 'Walk along a broad marked path, pause beside a story picture and gently roll a ball to a partner.', 'Non-slip floor markers, pictures, soft ball.', 'Practise one movement with an adult before joining a pair.'],
    ['Aiming together', 'Adjust hand-eye coordination through repeated play.', 'Adjusts a roll or placement after an attempt.', 'Roll a ball into a broad goal, place large objects in a tray, and discuss which position helped without ranking children.', 'Soft ball, wide floor target, large objects.', 'Bring the target closer and provide a wider opening.'],
    ['Plan a movement route', 'Link movements and respect shared space.', 'Follows a short chosen sequence and explains a rule.', 'Plan a safe route using gesture cards, travel around soft markers and deliver a ball to a partner; adapt the route together.', 'Soft markers, gesture cards, large lightweight ball.', 'Reduce the sequence and allow a different safe movement.'],
  ],
];

export function earlyYearsActivities(levelId: string) {
  const level = earlyYearsLevels.find(l => l.id === levelId);
  if (!level) return [];
  const sourceId = 'minedub-' + level.language + '-nursery', document = minedubDocuments.find(d => d.id === sourceId)!;
  const domains = minedubSubjectIndex.find(s => s.documentId === sourceId)!.names;
  return (level.language === 'fr' ? fr : en).map((domain, index) => {
    const [title, objective, observable, activity, materials, support] = domain[level.stage];
    return { id: 'italo-early-v1-' + level.id + '-d' + (index + 1), levelId, language: level.language, domain: domains[index], title, objective, observable, activity, materials, support,
      version: '1.0', programKind: 'ITALO_EARLY_YEARS_PROGRAM' as const, verificationStatus: 'ITALO_INTERNAL' as const,
      humanReviewStatus: 'PROPOSED_NOT_ADOPTED' as const, officialLevelEquivalent: null, durationMinutes: null,
      domainReference: { authority: 'MINEDUB', documentId: sourceId, version: '2018', checksum: document.sha, sourcePages: [5, 6],
        url: 'https://www.minedub.cm/download/350/archives/' + document.download, relationship: 'DOMAIN_REFERENCE_ONLY_NOT_OFFICIAL_ACTIVITY' as const },
      safety: level.language === 'fr' ? 'Surveillance adulte continue ; matériel adapté, non toxique, sans petits éléments, aimants ni piles accessibles. Respecter fatigue, choix et possibilités ; aucune inférence diagnostique.' : 'Continuous adult supervision; suitable non-toxic materials, no small parts, accessible magnets or batteries. Respect fatigue, choice and individual possibilities; no diagnostic inference.',
    };
  });
}
export function earlyYearsTemplate(activity: ReturnType<typeof earlyYearsActivities>[number]) {
  const en = activity.language === 'en';
  return [
    [en ? 'Program / status' : 'Programme / statut', 'ITALO_EARLY_YEARS_PROGRAM — PROPOSED_NOT_ADOPTED'],
    [en ? 'Local level' : 'Niveau local', activity.levelId], [en ? 'Learning domain' : 'Domaine d’apprentissage', activity.domain],
    [en ? 'Theme / activity' : 'Thème / activité', activity.title], [en ? 'Objective' : 'Objectif', activity.objective],
    [en ? 'Observable learning' : 'Acquis observable', activity.observable],
    [en ? 'Prior experience' : 'Prérequis', en ? 'Teacher records familiar experiences; no assumed mastery.' : 'L’enseignant précise les expériences familières ; aucun acquis supposé.'],
    [en ? 'Materials' : 'Matériel', activity.materials], [en ? 'Planned duration' : 'Durée prévue', en ? 'Teacher chooses and adapts; no imposed timetable.' : 'À choisir et adapter par l’enseignant ; aucun horaire imposé.'],
    [en ? 'Welcome / context' : 'Accueil / mise en situation', en ? 'Introduce the familiar context and listen to the children.' : 'Présenter la situation familière et écouter les enfants.'],
    [en ? 'Discovery / play / manipulation' : 'Découverte / jeu / manipulation', activity.activity],
    [en ? 'Guided activity' : 'Activité guidée', en ? 'Model only the selected task, then allow exploration.' : 'Montrer la tâche choisie puis laisser explorer.'],
    [en ? 'Individual or group work' : 'Activité individuelle ou en groupe', en ? 'Choose a small group or individual setting appropriate to the child.' : 'Choisir petit groupe ou situation individuelle adaptée.'],
    [en ? 'Verbalisation' : 'Verbalisation', en ? 'Invite a gesture, word or explanation; reformulate without pressure.' : 'Inviter geste, mot ou explication ; reformuler sans pression.'],
    [en ? 'Observation' : 'Observation', activity.observable + (en ? ' Record action/words, context and support, not a score.' : ' Consigner action/parole, contexte et aide, sans note.')],
    [en ? 'Consolidation / support' : 'Consolidation / adaptation', activity.support],
    [en ? 'Extension' : 'Prolongement', en ? 'Revisit the same learning in another familiar context only after teacher review.' : 'Reprendre le même objectif dans un autre contexte familier après revue enseignant.'],
    [en ? 'Safety' : 'Sécurité', activity.safety],
    [en ? 'Domain provenance (not local-level equivalence)' : 'Provenance du domaine (pas une équivalence de niveau local)', activity.domainReference.url + ' — PDF pp. 5–6 — 2018'],
  ];
}
export function proposeEarlyYearsProgression(levelId: string, weeks: Array<{ id: string; weekStartDate: string }>, workedActivityIds: string[] = []) {
  const activities = earlyYearsActivities(levelId);
  if (!activities.length || weeks.length > 60 || new Set(weeks.map(w => w.id)).size !== weeks.length) return [];
  return [...weeks].sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate)).map((week, index) => ({
    ...week, activity: activities[index % activities.length], status: 'PROPOSED_NOT_TAUGHT' as const,
    mode: index >= activities.length || workedActivityIds.includes(activities[index % activities.length].id) ? 'REPEAT_AND_CONSOLIDATE' : 'DISCOVER',
    teacherReviewRequired: true, timetableCreated: false,
  }));
}

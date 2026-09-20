/** Original, reversible ITALO workshop sequences. These are neither official
 * MINEDUB lessons nor a weekly calendar. Each domain keeps its original anchor
 * activity; the six extensions are revisited according to observation. */
export const localAnnualWorkshops = [
 [
  ['Échanger et écouter','Partager un objet familier, écouter la demande puis prendre un tour de parole.','Exchange and listen','Share a familiar object, listen to a request and take a speaking turn.'],
  ['Comprendre une histoire','Écouter une histoire originale, retrouver un personnage et rejouer une action.','Understand a story','Listen to an original story, find a character and act out an event.'],
  ['Raconter une expérience','Revenir sur un événement vécu avec des dessins et une dictée à l’adulte.','Tell about an experience','Recall a shared experience using drawings and adult scribing.'],
  ['Jouer avec les sons','Explorer voix, rythme et rimes dans une comptine, sans test de lecture.','Play with sounds','Explore voice, rhythm and rhyme in a song without a reading test.'],
  ['Découvrir les écrits','Manipuler un livre, choisir une image et fabriquer un message dessiné.','Explore print','Handle a book, select a picture and create a drawn message.'],
  ['Faire comprendre un message','Accueillir une marionnette et lui expliquer une routine en gestes ou en paroles.','Communicate a message','Welcome a puppet and explain a routine through gesture or speech.'],
 ],
 [
  ['Observer et comparer','Comparer de gros objets par couleur, forme ou texture en manipulant.','Observe and compare','Compare large objects by colour, shape or texture through handling.'],
  ['Classer et apparier','Trouver des objets semblables puis vérifier un classement avec un modèle.','Group and match','Find similar objects and check a grouping against an example.'],
  ['Collections et distribution','Distribuer un gros objet par place et repérer ensemble une place vide.','Collections and sharing','Put one large object at each place and notice an empty place together.'],
  ['Repères et constructions','Assembler des gros blocs et explorer dessus, dessous, près et loin.','Position and construction','Assemble large blocks and explore above, below, near and far.'],
  ['Le vivant au quotidien','Observer une plante sûre, comparer deux dessins et participer à son entretien avec l’adulte.','Living things','Observe a safe plant, compare two drawings and help an adult care for it.'],
  ['Essayer et vérifier','Faire varier la disposition de gros blocs pour stabiliser une construction au sol.','Try and check','Change the arrangement of large blocks to make a floor construction stable.'],
 ],
 [
  ['Accueil et repères','Retrouver ses affaires avec un repère visuel et demander de l’aide.','Welcome and belonging','Find belongings using a picture cue and ask for help.'],
  ['Prendre soin de soi','Participer au lavage des mains et reconnaître un besoin de repos, sans pression sur l’autonomie.','Care for oneself','Join handwashing and recognise a need for rest without pressure for independence.'],
  ['Coopérer et partager','Installer un jeu à deux, échanger les rôles puis ranger ensemble.','Cooperate and share','Set up a game together, exchange roles and put materials away.'],
  ['Émotions et communication','Utiliser une marionnette pour exprimer un désaccord et solliciter l’adulte.','Feelings and communication','Use a puppet to express disagreement and seek adult support.'],
  ['Sécurité dans la classe','Jouer une demande d’aide à partir d’une image de danger, sans créer de danger réel.','Classroom safety','Practise asking for help using a picture of a hazard without creating a real hazard.'],
  ['Responsabilités et environnement','Choisir une petite responsabilité de rangement et prendre soin du matériel commun.','Responsibility and environment','Choose a small tidying responsibility and care for shared materials.'],
 ],
 [
  ['Traces et couleurs','Explorer des traces sur une grande feuille avec des matériaux sûrs.','Marks and colours','Explore marks on large paper using safe materials.'],
  ['Formes et matières','Assembler ou modeler une création libre avec de gros éléments sûrs.','Shape and material','Assemble or model a free creation using large safe materials.'],
  ['Écoute et rythme','Écouter la voix de l’adulte puis proposer un son ou un rythme corporel.','Listening and rhythm','Listen to the adult voice then offer a sound or body rhythm.'],
  ['Gestes et espace','Accompagner une courte musique par un geste choisi dans un espace dégagé.','Gesture and space','Respond to a short piece of music with a chosen gesture in a clear space.'],
  ['Jeu dramatique','Donner une action à une marionnette et participer à une scène inventée.','Dramatic play','Give a puppet an action and join an invented scene.'],
  ['Création partagée','Réunir dessins, sons ou gestes dans une présentation libre sans classement des enfants.','Shared creation','Combine drawings, sounds or gestures in a free presentation without ranking children.'],
 ],
 [
  ['Bouger selon ses possibilités','Explorer un déplacement sûr, debout ou assis selon les possibilités observées.','Move within one’s abilities','Explore safe movement, standing or seated according to observed abilities.'],
  ['Équilibre et orientation','Suivre des repères larges au sol et s’arrêter à un signal familier.','Balance and direction','Follow broad floor markers and stop at a familiar signal.'],
  ['Transporter et placer','Déplacer de gros objets légers et les déposer dans un contenant stable.','Carry and place','Move large light objects and place them in a stable container.'],
  ['Coordination et précision','Faire rouler un ballon souple vers une cible large et ajuster la distance.','Coordination and accuracy','Roll a soft ball towards a wide target and adjust the distance.'],
  ['Gestes de la main','Manipuler de gros outils adaptés pour tracer, empiler et organiser.','Hand movements','Use suitable large tools for marking, stacking and arranging.'],
  ['Parcours partagé','Choisir une courte succession de mouvements sûrs puis respecter l’espace d’un partenaire.','Shared movement route','Choose a short sequence of safe movements and respect a partner’s space.'],
 ],
] as const;
export function annualLocalExtensions(domain:number,stage:number,language:string){
 const fr=language==='fr';
 const support=fr?[
 'Présenter un seul élément à la fois ; accepter regard, geste ou retrait ; l’adulte accompagne chaque manipulation.',
 'Proposer un modèle et un choix entre deux éléments ; consigne unique et tour bref.',
 'Relier deux actions, inviter une comparaison ou une courte explication ; maintenir un modèle disponible.',
 'Laisser choisir une petite séquence, expliquer un choix puis ajuster après observation ; aide toujours disponible.',
 ][stage]:[
 'Offer one item at a time; accept looking, gesture or withdrawal; support every manipulation.',
 'Offer a model and a choice between two items; use one instruction and a short turn.',
 'Link two actions and invite a comparison or brief explanation; keep a model available.',
 'Invite a short chosen sequence, an explanation and a revision after observation; support remains available.',
 ][stage];
 return localAnnualWorkshops[domain].map((r,index)=>({sequence:index+1,title:r[fr?0:2],activity:r[fr?1:3],objective:fr?'Explorer puis réinvestir : '+r[0].toLocaleLowerCase('fr'):'Explore and revisit: '+r[2].toLowerCase(),competency:fr?'Participer à la situation, exprimer un choix et réutiliser un geste ou une idée avec une aide adaptée.':'Participate, express a choice and reuse an action or idea with suitable support.',adaptation:support,assessment:fr?'Noter une action réellement observée, le contexte et l’aide apportée ; reprendre avec un autre support et comparer les observations, sans note ni diagnostic.':'Record an observed action, its context and the support provided; revisit with another material and compare observations without scores or diagnosis.',officialLesson:null,calendarPeriod:null}));
}

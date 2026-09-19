import { earlyYearsLevels, earlyYearsActivities } from './earlyYearsProgram';
// Local, reversible annual organisation; no calendar, compulsory hours or new activities.
export const earlyYearsAnnualPlans=earlyYearsLevels.flatMap(level=>earlyYearsActivities(level.id).map((a,index)=>({
 id:`annual-plan-v1-${level.id}-d${index+1}`,catalogLevelId:level.id,subjectName:a.domain,
 activityId:a.id,programKind:'ITALO_EARLY_YEARS_PROGRAM',decision:'ITALO_PEDAGOGICAL_CHOICE',
 progressionKind:'ECOSCOLAIRE_PROPOSED_PROGRESSION',officialLevelEquivalent:null,
 calendarPeriod:null,coverage:'PARTIAL',
 phases:[
 {label:level.language==='fr'?'Découvrir avec aide':'Explore with support',action:a.activity,observation:a.observable},
 {label:level.language==='fr'?'Reprendre dans un autre contexte familier':'Revisit in another familiar setting',action:level.language==='fr'?'Reprendre le même objectif en changeant un support familier ; observer avant de réduire l’aide.':'Keep the same objective, vary a familiar material, and observe before reducing support.',observation:a.observable},
 {label:level.language==='fr'?'Réinvestir et faire le bilan':'Transfer and review',action:level.language==='fr'?'Inviter une initiative adaptée aux possibilités observées, reprendre si nécessaire et consigner l’aide utile.':'Invite an initiative suited to observed abilities, revisit if necessary, and record useful support.',observation:a.observable}],
 adaptation:level.stage===0?'Participation brève, sensorielle ou gestuelle ; présence rapprochée de l’adulte, aucun résultat uniforme attendu.':'Adapter la complexité à l’observation individuelle ; aucune progression liée à une performance chronométrée.',
 followUp:['programme/domaines','progression','préparation','activité réalisée','bilan hebdomadaire','observation','acquis','difficulté','remédiation','nouvelle observation'],
 missingReason:'Un point de départ par domaine et ses reprises ne couvrent pas encore tous les sous-domaines annuels. Compléter à partir des observations et des besoins ; aucun score de complétude MINEDUB.',
 sourceReference:a.domainReference,safety:a.safety,
})));

import { annualLocalExtensions } from './localAnnualWorkshops';
import { earlyYearsLevels, earlyYearsActivities } from './earlyYearsProgram';
// Local, reversible annual organisation; no calendar or compulsory hours. Original anchor IDs are preserved.
export const earlyYearsAnnualPlans=earlyYearsLevels.flatMap(level=>earlyYearsActivities(level.id).map((a,index)=>({
 id:`annual-plan-v1-${level.id}-d${index+1}`,catalogLevelId:level.id,subjectName:a.domain,
 activityId:a.id,programKind:'ITALO_EARLY_YEARS_PROGRAM',decision:'ITALO_PEDAGOGICAL_CHOICE',
 progressionKind:'ECOSCOLAIRE_PROPOSED_PROGRESSION',officialLevelEquivalent:null,
 calendarPeriod:null,coverage:'ITALO_VALIDATED',
 annualExtensions:annualLocalExtensions(index,level.stage,level.language),
 validation:{kind:'ITALO_PEDAGOGICAL_CHOICE',version:'local-annual-2026-09-20-v1',schoolId:'school-italo-official',academicYearId:'ay_school-italo-official_2026-2027_er0p',authority:'Mission explicite de validation pédagogique déléguée',reversible:true,scope:'LOCAL_ANNUAL_CONTENT_NOT_CLASS_ADOPTION'},
 phases:[
 {label:level.language==='fr'?'Découvrir avec aide':'Explore with support',action:a.activity,observation:a.observable},
 {label:level.language==='fr'?'Reprendre dans un autre contexte familier':'Revisit in another familiar setting',action:level.language==='fr'?'Reprendre le même objectif en changeant un support familier ; observer avant de réduire l’aide.':'Keep the same objective, vary a familiar material, and observe before reducing support.',observation:a.observable},
 {label:level.language==='fr'?'Réinvestir et faire le bilan':'Transfer and review',action:level.language==='fr'?'Inviter une initiative adaptée aux possibilités observées, reprendre si nécessaire et consigner l’aide utile.':'Invite an initiative suited to observed abilities, revisit if necessary, and record useful support.',observation:a.observable}],
 adaptation:level.stage===0?'Participation brève, sensorielle ou gestuelle ; présence rapprochée de l’adulte, aucun résultat uniforme attendu.':'Adapter la complexité à l’observation individuelle ; aucune progression liée à une performance chronométrée.',
 followUp:['programme/domaines','progression','préparation','activité réalisée','bilan hebdomadaire','observation','acquis','difficulté','remédiation','nouvelle observation'],
 missingReason:'Programme local annuel : activité initiale et six ateliers complémentaires, reprises guidées par observation. Validation déléguée du contenu uniquement ; adoption de classe et calendrier non présumés. Aucun score de complétude MINEDUB.',
 sourceReference:a.domainReference,safety:a.safety,
})));

# Correction après audit global

Le bouton historique « Passer à la Nouvelle Année » dans Settings.tsx appelait safeMergeDB avec grades, attendance et staffAttendance vides. AppContext.safeMergeDB supprime les documents retirés des tableaux. Ce comportement contredit la conservation de l’historique demandée. Aucun clic destructif effectué et aucune donnée réelle supprimée.

Le bouton conduit désormais au calendrier académique existant /academic-periods. Son intitulé et son aide décrivent cette gestion, sans réinitialisation. Aucun changement des clés, des années, des périodes ni des données. Contrat de non-régression CI et clic réel dans le smoke global requis.

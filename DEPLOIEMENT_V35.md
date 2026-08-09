# GLOBAL EMPLOI V35

Modifications accueil :
- image Hero agrandie pour remplir entièrement toute la zone droite avec `object-fit: cover` ;
- suppression du texte « RECRUTEMENT • EMPLOI • MÉTIERS • MISSIONS » ;
- suppression de la barre de recherche principale du Hero ;
- suppression des recherches populaires du Hero ;
- suppression de la dépendance JavaScript à `#homeSearchBtn` pour éviter toute erreur après retrait du composant ;
- conservation des recherches détaillées sur les pages publiques Offres et Profils ;
- conservation des boutons « Je cherche un emploi » et « Je recrute ».

Tests : build, syntaxe JavaScript, contrats de routes et smoke tests réussis.

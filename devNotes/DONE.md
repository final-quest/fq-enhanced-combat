v3.0.1:
Feat :
- Un combattant mis à 0 point de vie par des dégâts est résolu sur-le-champ, sans attendre son tour : un PNJ ou un sbire quitte le combat, et un personnage qui jouait son tour le voit s'achever
- Les jets de sauvegarde contre la mort d'un personnage restent où la règle les met, au début de chacun de ses tours
- La main n'est passée qu'une fois par tour, quelle que soit celle des deux résolutions qui y arrive la première
- Réglage « Retirer de la scène le jeton des PNJ » : un PNJ qui quitte le combat à 0 point de vie voit aussi son jeton supprimé, là où un personnage joueur mort laisse toujours son corps et un sbire emporte toujours le sien
- Le réglage est désactivé par défaut et sans effet si les jets de sauvegarde contre la mort le sont : faire disparaître le corps d'un PNJ prive le MJ de sa mise en scène et de son butin

Chore :
- Support de la version Foundry 14.369 et DND5E 6.0.6
- La chute sous les dégâts passe par dnd5e.damageActor, seul point commun à toutes les sources de dégâts : l'application du système comme la mise à jour directe dont se servent les cartes de fq-card-engine

v3.0.0:
Feat :
- Timer de tour sur les tours des combattants appartenant à un joueur : à l'expiration, la main passe au combattant suivant
- Bandeau dans le combat tracker : le temps restant en m:ss, une barre qui se vide, une alerte dans les cinq dernières secondes
- Le même décompte pour tout le monde : le premier MJ actif inscrit l'échéance du tour dans un drapeau du combat, et chaque client en déduit le temps restant depuis l'horloge du serveur (game.time.serverTime) plutôt que depuis la sienne
- Un joueur qui recharge sa page en milieu de tour voit le temps qu'il lui reste vraiment
- La pause de Foundry gèle le décompte, et la reprise rend au joueur exactement le temps qu'il lui restait
- Les tours menés par le MJ ne sont pas chronométrés, pas plus que celui d'un combattant à 0 point de vie quand les jets de mort s'en occupent déjà
- Deux réglages de monde pour le timer : l'activation et la durée d'un tour (curseur de 10 à 300 secondes, 60 par défaut), une modification s'appliquant au tour en cours
- Jets de sauvegarde contre la mort au début du tour d'un combattant à 0 point de vie : jet de sauvegarde pour un personnage (trois succès le ramènent à 1 point de vie, trois échecs le tuent), dissipation pour un sbire, sortie de combat pour un PNJ
- Initiative lancée à l'entrée en combat, pour tout combattant qui n'en a pas encore
- API publique game.modules.get("fq-enhanced-combat").api, le point d'entrée par lequel fq-card-engine interroge ce module (deathSave.skipsTurn pour savoir si un début de tour y échappe, turnTimer.remainingMs pour le temps restant sur le tour en cours)

Chore :
- Première release : l'ossature, deux fonctionnalités reprises de fq-card-engine et une écrite ici, les trois désactivées par défaut
- Hôte des fonctionnalités de combat de fq-card-engine qui relèvent de dnd5e plutôt que de Final Quest, extraites une à une pour être utilisables sans le système de cartes
- Manifeste : dnd5e 6.x, Foundry 14, aucune dépendance de module, socket désactivé — chaque extraction ajoute ce qu'il lui faut
- Chaîne de chargement src/init-enhanced-combat.js (façade window.FqEnhancedCombatModule et espace de noms CONFIG.FqEnhancedCombat), puis les hooks init et setup
- Réglage « Debug logs », traduit en anglais et en français
- Outillage repris de fq-card-engine : ESLint (mêmes règles), Vitest, et une CI GitHub (lint + tests, release au tag)
- Version alignée sur fq-card-engine et fq-restrain-movement : les trois modules sont publiés ensemble

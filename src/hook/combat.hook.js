import DeathSave from "../domain/death-save.js";
import Initiative from "../domain/initiative.js";
import TurnTimer from "../domain/turn-timer.js";
import {isLocalUserFirstActiveGM} from "../core/utils/gm.utils.js";

/**
 * Les automatismes de combat du module.
 *
 * Deux gardes valent pour tous :
 *
 * 1. Ils ne s'exécutent que sur le client du PREMIER MJ ACTIF, car ils modifient
 *    des documents partagés (jet de sauvegarde, initiative de tous les
 *    combattants, échéance du tour) : sans cela chaque client connecté rejouerait
 *    l'opération.
 * 2. Ils sont désormais les SEULS à porter ces règles : fq-card-engine les a
 *    cédées et se contente d'interroger l'API publique pour savoir si un début de
 *    tour lui échappe.
 *
 * Le garde du compte à rebours est porté par `TurnTimer.rearmForGM` plutôt qu'ici :
 * il n'a à être consulté que lorsqu'il y a un drapeau à écrire, sans quoi un monde
 * sans chronomètre et sans MJ connecté verrait un avertissement à chaque tour.
 */

/**
 * Début de tour d'un combattant à 0 point de vie : jet de sauvegarde contre la
 * mort pour un personnage, dissipation pour un sbire, retrait du combat pour un
 * PNJ. Voir `domain/death-save.js` pour la règle appliquée.
 *
 * Un retour en arrière dans l'ordre du combat ne déclenche rien : le MJ qui
 * revient sur un tour déjà joué ne doit pas faire relancer son jet au combattant.
 */
Hooks.on("combatTurnChange", async function (combat, _prior, _current) {
    const goingBackwards = combat.round < combat.previous?.round
        || (combat.round === combat.previous?.round && combat.turn < combat.previous?.turn);
    if (goingBackwards) {
        return;
    }
    if (!DeathSave.isEnabled() || !isLocalUserFirstActiveGM()) {
        return;
    }
    await DeathSave.resolveTurnStart(combat);
});

/**
 * Chute à 0 point de vie sous les dégâts, sans attendre que le tour du combattant
 * revienne : un PNJ quitte le combat (et la scène si le MJ l'a demandé), un
 * personnage voit s'achever le tour qu'il jouait. Voir `domain/death-save.js`.
 *
 * `dnd5e.damageActor` est le seul point de passage commun à toutes les sources de
 * dégâts : le système l'appelle sur toute baisse de points de vie, qu'elle vienne
 * de sa propre application des dégâts ou d'une mise à jour directe de l'acteur —
 * celle dont se servent les cartes de fq-card-engine. Et seulement sur une baisse
 * réelle, ce qui dispense de comparer les points de vie d'avant et d'après.
 *
 * Le réglage est lu avant le garde du MJ, et non avec lui : sans cela, un monde
 * qui n'a pas activé la fonctionnalité verrait l'avertissement « aucun MJ
 * connecté » à chaque coup porté.
 */
Hooks.on("dnd5e.damageActor", function (actor, _changes, _update, _userId) {
    if (!DeathSave.isEnabled() || !DeathSave.isDown(actor)) {
        return;
    }
    if (!isLocalUserFirstActiveGM()) {
        return;
    }
    DeathSave.resolveDamage(actor);
});

/**
 * Compte à rebours du tour remis à zéro à chaque changement de tour : une échéance
 * pour le tour d'un joueur, rien pour celui d'une créature du MJ.
 *
 * Handler distinct de celui des jets de mort, et non une suite de celui-ci : le
 * retour en arrière dans l'ordre du combat, qui ne doit surtout pas faire relancer
 * un jet de sauvegarde, doit bel et bien REPARTIR le chronomètre — le combattant
 * sur lequel le MJ revient reprend son tour du début.
 *
 * Un tour à terre n'est pas chronométré, `TurnTimer.watchesTurnOf` le refuse :
 * les jets de mort tiennent déjà ce tour et passent la main en deux secondes.
 */
Hooks.on("combatTurnChange", async function (combat, _prior, _current) {
    await TurnTimer.rearmForGM(combat);
});

/**
 * La pause de Foundry gèle le compte à rebours, la reprise le relance : sans cela
 * une interruption de séance mangerait le tour du joueur.
 */
Hooks.on("pauseGame", async function (paused) {
    await TurnTimer.syncPauseForGM(paused);
});

/**
 * Fin du combat : le compte à rebours local du MJ est désarmé. Le drapeau qui
 * portait l'échéance part avec le combat supprimé.
 */
Hooks.on("deleteCombat", function (_combat, _options, _userId) {
    TurnTimer.cancel();
});

/**
 * Initiative lancée d'office à l'entrée en combat, pour tous les combattants qui
 * n'en ont pas encore.
 *
 * Branché sur `createCombatant` et non sur `createCombat` : les combattants sont
 * ajoutés un à un, souvent après la création du combat.
 *
 * Le handler ne fait que signaler l'arrivée : `Initiative` regroupe les
 * créations d'un même geste en un seul jet et sérialise les passages. Voir
 * `domain/initiative.js` pour la raison — un jet par création faisait parcourir
 * tous les combattants autant de fois qu'il y avait de jetons, et ces parcours
 * se chevauchaient jusqu'à jeter deux fois le dé du même combattant.
 */
Hooks.on("createCombatant", function (combatant, _data, _options) {
    Initiative.onCombatantCreated(combatant);
});

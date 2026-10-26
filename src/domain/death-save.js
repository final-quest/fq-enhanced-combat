import {createInfo, createStatus, createWarning} from "../core/utils/chat.utils.js";
import {FAIL_COLOR, I18N, MODULE_ID} from "../core/constants.js";
import {error} from "../core/utils/log.utils.js";

/**
 * Clé du réglage de monde qui active la résolution automatique du début de tour
 * à 0 point de vie. Exportée pour que `config/register-settings.js` et la lecture
 * ci-dessous partagent la même chaîne — comme `OPPORTUNITY_ATTACK_SETTING`.
 * @type {string}
 */
export const DEATH_SAVE_SETTING = "DeathSaveOnTurnStart";

/**
 * Clé du réglage de monde qui fait disparaître de la scène le jeton d'un PNJ
 * tombé à 0 point de vie, en plus de son retrait du combat.
 *
 * Réservé aux PNJ : un personnage joueur mort laisse toujours son corps, et un
 * sbire emporte le sien dans tous les cas. Le réglage n'a donc d'effet que sur la
 * branche intermédiaire, celle que le MJ pilote.
 *
 * @type {string}
 */
export const DELETE_NPC_TOKEN_SETTING = "DeleteNpcTokenOnDeath";

/**
 * Lit un réglage booléen du monde sans jamais lever. `game.settings.get` lève sur
 * un réglage pas encore enregistré (monde en cours de chargement, suite de tests)
 * et une règle de combat ne doit pas casser un tour pour autant : à défaut de
 * réponse, elle est tenue pour désactivée.
 *
 * @param {string} key - La clé du réglage, sous le nom de ce module.
 *
 * @returns {boolean} True si le réglage vaut explicitement vrai.
 */
function worldFlag(key) {
    try {
        return game.settings.get(MODULE_ID, key) === true;
    } catch {
        return false;
    }
}

/**
 * Ce que devient un combattant à 0 point de vie, aux deux moments où la question
 * se pose : quand des dégâts le mettent à terre, et au début de son tour.
 *
 * SOUS LES DÉGÂTS, un PNJ — sbire compris — quitte le combat sur-le-champ, sans
 * attendre un tour qui ne lui reviendrait que pour l'en sortir, et le personnage
 * qui tombe pendant son propre tour le voit s'achever là. Rien d'autre : ses jets
 * de sauvegarde appartiennent au début de ses tours.
 *
 * AU DÉBUT DU TOUR, un PERSONNAGE lance son jet de sauvegarde contre la mort —
 * celui du système dnd5e, avec ses bonus et sa carte de chat — puis le moteur en
 * tire les conséquences maison : trois réussites le remettent à 1 point de vie
 * (là où la règle du système le laisserait stabilisé à 0), trois échecs le tuent
 * et le retirent du combat, un jet non concluant lui fait passer son tour.
 *
 * Un SBIRE et un PNJ ordinaire ne lancent rien : leur tour ne revient pas. Le
 * sbire se dissipe toujours, jeton compris ; le PNJ quitte le combat et ne laisse
 * son corps sur la scène que si {@link DELETE_NPC_TOKEN_SETTING} est désactivé ;
 * le personnage mort laisse le sien en toutes circonstances.
 *
 * Tout se joue sur le client du premier MJ actif, seul appelant de
 * `resolveTurnStart` et de `resolveDamage` (voir `hook/combat.hook.js`) : le jet,
 * les mises à jour d'acteur et les suppressions de documents n'ont lieu qu'une
 * fois.
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class DeathSave {

    /**
     * Le temps de lecture, en millisecondes, laissé entre la résolution du début
     * de tour d'un combattant à terre et le passage de la main au suivant : sans
     * lui, le jet de sauvegarde et le tour suivant s'afficheraient d'un bloc.
     * @type {number}
     */
    static PASS_TURN_DELAY = 2000;

    /**
     * Le nombre de réussites ou d'échecs qui clôt une série de jets de sauvegarde
     * contre la mort.
     * @type {number}
     */
    static DEATH_SAVE_COUNT = 3;

    /**
     * Module dont l'estampille d'invocation (`summonerId`) designe un sbire.
     *
     * Integration OPTIONNELLE avec fq-card-engine : lui seul invoque des sbires,
     * et un sbire a terre se dissipe au lieu de lancer un jet. Quand ce module
     * tourne seul, aucun acteur ne porte ce drapeau et tous les combattants a
     * terre sont traites comme des personnages ou des PNJ — ce qui est le
     * comportement voulu hors de Final Quest.
     *
     * @type {string}
     */
    static MINION_FLAG_SCOPE = "fq-card-engine";

    /**
     * Le tour dont la main a déjà été passée, sous la forme `combat:round:tour`.
     *
     * Deux résolutions peuvent vouloir passer la main au même tour : le début de
     * tour d'un personnage à terre, et les dégâts qui le mettent à terre dans ce
     * même tour — un poison appliqué au début de son tour, ou deux sources de
     * dégâts coup sur coup. Sans cette marque, le combattant suivant verrait son
     * tour sauté lui aussi.
     *
     * @type {string|null}
     */
    static handedOverTurn = null;

    /**
     * Indique si la résolution automatique du début de tour à 0 point de vie est
     * activée dans le monde. Silencieuse en l'absence de réglage (tests,
     * chargement partiel) : la fonctionnalité est alors simplement inactive.
     *
     * @returns {boolean} True si la fonctionnalité est activée.
     */
    static isEnabled() {
        return worldFlag(DEATH_SAVE_SETTING);
    }

    /**
     * Indique si le jeton d'un PNJ à terre doit disparaître de la scène avec lui.
     * Réglage désactivé : son corps reste, et ce qu'il devient appartient au MJ.
     *
     * @returns {boolean} True si le jeton du PNJ doit être supprimé.
     */
    static deletesNpcToken() {
        return worldFlag(DELETE_NPC_TOKEN_SETTING);
    }

    /**
     * Indique si un acteur est à terre : ses points de vie sont tombés à 0 ou en
     * dessous. Un acteur sans points de vie chiffrés n'est jamais à terre.
     *
     * @param {Actor} [actor] - L'acteur inspecté.
     *
     * @returns {boolean} True si l'acteur est à 0 point de vie ou moins.
     */
    static isDown(actor) {
        const hp = Number(actor?.system?.attributes?.hp?.value);
        return Number.isFinite(hp) && hp <= 0;
    }

    /**
     * Indique si le tour d'un acteur sera pris en charge par cette résolution —
     * et donc si le reste du début de tour (pioche, cartes automatiques) doit
     * être court-circuité. Réglage désactivé : jamais.
     *
     * @param {Actor} [actor] - L'acteur du combattant dont le tour commence.
     *
     * @returns {boolean} True si le moteur va résoudre ce début de tour.
     */
    static skipsTurn(actor) {
        return DeathSave.isEnabled() && DeathSave.isDown(actor);
    }

    /**
     * Indique si un acteur est un sbire : seule l'estampille posée à l'invocation
     * (`summonerId`) fait foi — c'est elle qui relie un jeton à son invocateur,
     * comme pour le plafond d'invocations.
     *
     * @param {Actor} [actor] - L'acteur inspecté.
     *
     * @returns {boolean} True si l'acteur a été invoqué par une carte.
     */
    static isMinion(actor) {
        return Boolean(actor?.flags?.[DeathSave.MINION_FLAG_SCOPE]?.summonerId);
    }

    /**
     * Résout la chute à 0 point de vie de l'acteur qui vient d'encaisser des
     * dégâts, sans attendre que son tour revienne.
     *
     * Un PNJ, sbire compris, quitte le combat tout de suite : son jeton part selon
     * la règle du début de tour. Un PERSONNAGE garde ses jets de sauvegarde — ils
     * appartiennent au début de ses tours — mais perd celui qu'il jouait : tomber à
     * terre interrompt son tour, et seulement le sien.
     *
     * @param {Actor}  actor    - L'acteur qui vient d'encaisser les dégâts.
     * @param {Combat} [combat] - Le combat en cours.
     *
     * @returns {boolean} True si la chute a été prise en charge.
     */
    static resolveDamage(actor, combat = game.combat) {
        if (!DeathSave.isEnabled() || !DeathSave.isDown(actor)) {
            return false;
        }
        return actor.type === "character"
            ? DeathSave.passDownedTurn(combat, actor)
            : DeathSave.withdraw(combat, actor);
    }

    /**
     * Achève le tour du personnage que les dégâts viennent de mettre à terre — à
     * la condition que ce soit le sien. À terre pendant le tour d'un autre, il
     * attend le début du suivant, et son jet de sauvegarde avec.
     *
     * @param {Combat} combat - Le combat en cours.
     * @param {Actor}  actor  - Le personnage tombé à 0 point de vie.
     *
     * @returns {boolean} True si son tour a été rendu.
     */
    static passDownedTurn(combat, actor) {
        if (!DeathSave.isCurrentTurnOf(combat, actor) || !DeathSave.canPassTurn(combat)) {
            return false;
        }
        DeathSave.announce(`${I18N}.DownedTurnEnded`, actor, createInfo);
        DeathSave.resolveLater(combat);
        return true;
    }

    /**
     * Sort du combat le PNJ ou le sbire que les dégâts viennent de mettre à terre.
     *
     * Hors du combat, rien : ce module ne règle que le sort des combattants, et le
     * jeton d'un PNJ qui n'y figure pas appartient au MJ comme avant.
     *
     * @param {Combat} combat - Le combat en cours.
     * @param {Actor}  actor  - Le PNJ tombé à 0 point de vie.
     *
     * @returns {boolean} True s'il a été retiré du combat.
     */
    static withdraw(combat, actor) {
        const combatant = DeathSave.combatantOf(combat, actor);
        if (!combatant) {
            return false;
        }
        const minion = DeathSave.isMinion(actor);
        return DeathSave.dismiss(combat, combatant, actor, {
            messageKey: minion ? `${I18N}.MinionVanished` : `${I18N}.NpcOutOfCombat`,
            deleteToken: minion || DeathSave.deletesNpcToken(),
            // La main ne passe que si c'est bien le PNJ qui tombe qui tenait le
            // tour : autrement, le tour en cours n'est pas le sien et continue.
            passTurn: DeathSave.isCurrentTurnOf(combat, actor)});
    }

    /**
     * Résout le début de tour du combattant courant s'il est à terre.
     *
     * @param {Combat} combat - Le combat dont le tour vient de changer.
     *
     * @returns {Promise<boolean>} True si le tour est pris en charge par le moteur
     *          (sbire dissipé, personnage mort ou tour passé) et ne doit donc pas
     *          se dérouler normalement.
     */
    static async resolveTurnStart(combat) {
        const combatant = combat?.combatant;
        const actor = combatant?.actor;
        if (!DeathSave.skipsTurn(actor)) {
            return false;
        }
        if (DeathSave.isMinion(actor)) {
            return DeathSave.dismiss(combat, combatant, actor, {
                messageKey: `${I18N}.MinionVanished`, deleteToken: true});
        }
        // Un PNJ ordinaire ne lance pas de jet de sauvegarde — le système ne lui en
        // tient pas le compte — et quitte simplement le combat. Ce qu'il devient sur
        // la scène (corps, butin, retrait) appartient au MJ : c'est son réglage, et
        // non le type de l'acteur, qui décide du sort du jeton.
        if (actor.type !== "character") {
            return DeathSave.dismiss(combat, combatant, actor, {
                messageKey: `${I18N}.NpcOutOfCombat`,
                deleteToken: DeathSave.deletesNpcToken()});
        }
        return DeathSave.resolveDeathSave(combat, combatant, actor);
    }

    /**
     * Lance le jet de sauvegarde contre la mort du personnage et en applique les
     * conséquences.
     *
     * L'état d'après est lu sur l'acteur plutôt que sur le résultat du jet : c'est
     * le système qui tient les compteurs, et lui seul sait ce que vaut un jet
     * (bonus, avantage, valeur cible du monde). Les deux compteurs remis à zéro
     * alors que le personnage portait des marques signent la stabilisation — un
     * échec, lui, laisse toujours les réussites en place.
     *
     * @param {Combat}    combat    - Le combat en cours.
     * @param {Combatant} combatant - Le combattant dont le tour commence.
     * @param {Actor}     actor     - Le personnage à terre.
     *
     * @returns {Promise<boolean>} True si le tour est consommé.
     */
    static async resolveDeathSave(combat, combatant, actor) {
        const before = DeathSave.deathCounters(actor);
        if (!await DeathSave.rollDeathSave(actor)) {
            return false;
        }
        const after = DeathSave.deathCounters(actor);

        // Réussite critique : le système a déjà rendu son point de vie.
        if (!DeathSave.isDown(actor)) {
            DeathSave.announce(`${I18N}.DeathSaveRevived`, actor, createStatus);
            return false;
        }
        if (after.failure >= DeathSave.DEATH_SAVE_COUNT) {
            await DeathSave.die(combat, combatant, actor);
            return true;
        }
        if (after.success === 0 && after.failure === 0 && (before.success > 0 || before.failure > 0)) {
            await actor.update({"system.attributes.hp.value": 1});
            DeathSave.announce(`${I18N}.DeathSaveRevived`, actor, createStatus);
            return false;
        }
        DeathSave.announce(`${I18N}.DeathSaveTurnPassed`, actor, createInfo);
        DeathSave.resolveLater(combat);
        return true;
    }

    /**
     * Lance le jet de sauvegarde contre la mort du système, sans fenêtre de
     * configuration. `fastForward` (dnd5e 3.x) et `dialog.configure` (dnd5e 4.x et
     * suivants) désignent la même chose : lancer sans rien demander.
     *
     * @param {Actor} actor - Le personnage qui lance le jet.
     *
     * @returns {Promise<boolean>} True si le jet a bien eu lieu ; false si le
     *          système n'expose pas de jet de sauvegarde contre la mort.
     */
    static async rollDeathSave(actor) {
        if (typeof actor?.rollDeathSave !== "function") {
            return false;
        }
        await actor.rollDeathSave({fastForward: true}, {configure: false});
        return true;
    }

    /**
     * Fait mourir le personnage : statut « mort » posé sur son jeton, message de
     * chat, puis retrait du combat. Le jeton reste sur la scène — c'est un corps,
     * pas une invocation qui se dissipe. Aucun réglage ne le retire : le jeton d'un
     * personnage joueur appartient à son joueur, pas aux automatismes du combat.
     *
     * @param {Combat}    combat    - Le combat en cours.
     * @param {Combatant} combatant - Le combattant à retirer.
     * @param {Actor}     actor     - Le personnage mort.
     *
     * @returns {Promise<void>}
     */
    static async die(combat, combatant, actor) {
        DeathSave.announce(`${I18N}.DeathSaveDied`, actor, createWarning, {color: FAIL_COLOR});
        if (typeof actor.toggleStatusEffect === "function") {
            await actor.toggleStatusEffect("dead", {active: true, overlay: true});
        }
        DeathSave.resolveLater(combat, {combatant});
    }

    /**
     * Retire du combat un combattant tombé à 0 point de vie sans jet de sauvegarde
     * — un sbire ou un PNJ ordinaire. Le sbire emporte toujours son jeton, celui du
     * PNJ ne part que si le MJ l'a demandé : l'appelant tranche, pas cette méthode.
     *
     * @param {Combat}    combat                - Le combat en cours.
     * @param {Combatant} combatant             - Le combattant à retirer.
     * @param {Actor}     actor                 - L'acteur qui quitte le combat.
     * @param {object}    options               - Les options du retrait.
     * @param {string}    options.messageKey    - La clé i18n du message de chat.
     * @param {boolean}   [options.deleteToken] - Supprime aussi le jeton de la scène.
     * @param {boolean}   [options.passTurn]    - Passe la main au combattant suivant.
     *
     * @returns {boolean} Toujours true : le tour est consommé.
     */
    static dismiss(combat, combatant, actor, {messageKey, deleteToken = false, passTurn = true} = {}) {
        DeathSave.announce(messageKey, actor, createInfo);
        DeathSave.resolveLater(combat, {combatant, deleteToken, passTurn});
        return true;
    }

    /**
     * Règle l'issue d'une chute à 0 point de vie après le temps de lecture : la
     * main passée au combattant suivant, le retrait du combattant à terre, et la
     * suppression de son jeton.
     *
     * L'ordre n'est pas négociable : le tour passe AVANT le retrait. Supprimer le
     * combattant courant décale l'index de tour sans que Foundry n'annonce de
     * changement, et le combattant suivant serait alors privé de son début de tour
     * (pioche, effets expirés, cartes automatiques).
     *
     * Volontairement NON attendue par l'appelant : `nextTurn` relance
     * `combatTurnChange`, et l'invocation courante du hook doit s'achever avant que
     * le tour suivant ne commence.
     *
     * @param {Combat}    combat                - Le combat en cours.
     * @param {object}    [options]             - Options de retrait.
     * @param {Combatant} [options.combatant]   - Le combattant à retirer du combat.
     * @param {boolean}   [options.deleteToken] - Supprime aussi le jeton de la scène.
     * @param {boolean}   [options.passTurn]    - Passe la main au combattant suivant.
     *
     * @returns {void}
     */
    static resolveLater(combat, {combatant = null, deleteToken = false, passTurn = true} = {}) {
        // Le jeton est saisi maintenant : le combattant supprimé ne le désignera plus.
        const token = deleteToken ? combatant?.token : null;
        const handOver = passTurn && DeathSave.canPassTurn(combat);
        if (handOver) {
            DeathSave.handedOverTurn = DeathSave.turnKey(combat);
        }
        (async () => {
            await DeathSave.wait(DeathSave.PASS_TURN_DELAY);
            if (handOver) {
                await combat?.nextTurn?.();
            }
            await combatant?.delete?.();
            await token?.delete?.();
        })().catch(e => error("Fin du tour d'un combattant à terre", e));
    }

    /**
     * Le combattant de cet acteur dans ce combat, s'il y figure.
     *
     * @param {Combat} [combat] - Le combat en cours.
     * @param {Actor}  [actor]  - L'acteur cherché.
     *
     * @returns {Combatant|null} Son combattant, ou null.
     */
    static combatantOf(combat, actor) {
        const combatants = combat?.combatants ?? [];
        return [...combatants].find(combatant => DeathSave.sameActor(combatant, actor)) ?? null;
    }

    /**
     * Le tour en cours est-il celui de cet acteur ?
     *
     * @param {Combat} [combat] - Le combat en cours.
     * @param {Actor}  [actor]  - L'acteur inspecté.
     *
     * @returns {boolean} True si c'est son tour.
     */
    static isCurrentTurnOf(combat, actor) {
        return DeathSave.sameActor(combat?.combatant, actor);
    }

    /**
     * Ce combattant porte-t-il cet acteur ?
     *
     * Les `uuid` départagent ce que les identifiants d'acteur confondraient : deux
     * jetons non liés copiés du même acteur de base portent des acteurs
     * synthétiques distincts, et le même `id`.
     *
     * @param {Combatant} [combatant] - Le combattant inspecté.
     * @param {Actor}     [actor]     - L'acteur cherché.
     *
     * @returns {boolean} True si le combattant est celui de cet acteur.
     */
    static sameActor(combatant, actor) {
        if (!combatant?.actor || !actor) {
            return false;
        }
        return combatant.actor === actor
            || (Boolean(actor.uuid) && combatant.actor.uuid === actor.uuid);
    }

    /**
     * La main de ce tour est-elle encore à passer ?
     *
     * @param {Combat} [combat] - Le combat en cours.
     *
     * @returns {boolean} True si aucune résolution ne l'a déjà passée.
     */
    static canPassTurn(combat) {
        const key = DeathSave.turnKey(combat);
        return key !== null && key !== DeathSave.handedOverTurn;
    }

    /**
     * L'identité du tour en cours, pour reconnaître celui dont la main a déjà été
     * passée.
     *
     * @param {Combat} [combat] - Le combat en cours.
     *
     * @returns {string|null} La clé du tour, ou null faute de combat.
     */
    static turnKey(combat) {
        return combat ? `${combat.id}:${combat.round}:${combat.turn}` : null;
    }

    /**
     * Les compteurs de jets de sauvegarde contre la mort du personnage, toujours
     * chiffrés, pour que l'appelant compare sans garde.
     *
     * @param {Actor} [actor] - Le personnage inspecté.
     *
     * @returns {{success: number, failure: number}} Les réussites et les échecs.
     */
    static deathCounters(actor) {
        const death = actor?.system?.attributes?.death ?? {};
        return {
            success: Number(death.success) || 0,
            failure: Number(death.failure) || 0
        };
    }

    /**
     * Publie dans le chat, au nom de l'acteur, le message localisé d'une issue de
     * début de tour.
     *
     * @param {string}   key       - La clé i18n du message (attend `{name}`).
     * @param {Actor}    actor     - L'acteur concerné, speaker du message.
     * @param {Function} publish   - Le publieur de `chat.utils.js` à employer.
     * @param {object}   [options] - Les options passées au publieur.
     *
     * @returns {void}
     */
    static announce(key, actor, publish, options = {}) {
        publish(game.i18n.format(key, {name: actor?.name ?? ""}), {actor, ...options});
    }

    /**
     * Attend un délai. Isolée pour que les tests pilotent le temps.
     *
     * @param {number} ms - Le délai en millisecondes.
     *
     * @returns {Promise<void>}
     */
    static wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

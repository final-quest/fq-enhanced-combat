import {MODULE_ID} from "../core/constants.js";
import {isLocalUserFirstActiveGM} from "../core/utils/gm.utils.js";
import {debug, error} from "../core/utils/log.utils.js";

/**
 * Clé du réglage de monde qui fait lancer l'initiative d'office à l'entrée en
 * combat.
 * @type {string}
 */
export const ROLL_INITIATIVE_SETTING = "RollInitiative";

/**
 * Délai de regroupement des entrées en combat, en millisecondes.
 *
 * Assez long pour qu'un ajout de plusieurs dizaines de jetons tienne dans un
 * seul lot, assez court pour que le jet suive le geste du MJ.
 * @type {number}
 */
export const BATCH_DELAY_MS = 150;

/**
 * Initiative lancée d'office pour les combattants qui n'en ont pas encore.
 *
 * TOUT EST DANS LE REGROUPEMENT. Foundry crée les combattants UN À UN, même
 * quand le MJ ajoute trente jetons d'un seul geste : un jet lancé à chaque
 * création parcourt les trente combattants trente fois. Et comme un hook
 * n'attend pas son handler, ces parcours se chevauchent — chacun relève les
 * combattants encore sans initiative, c'est-à-dire tous tant que la première
 * mise à jour n'est pas revenue de la base, et leur jette un dé de plus. D'où
 * les jets en double, les messages de chat en rafale et la table figée.
 *
 * Deux garde-fous :
 *
 * 1. Un DÉBOUNCE : les créations d'un même geste se fondent en un seul passage,
 *    qui jette l'initiative de tout le monde en une fois. `rollAll` regroupe
 *    déjà les dés, les messages de chat et la mise à jour des combattants.
 * 2. Une SÉRIALISATION : tant qu'un passage est en cours, aucun autre ne part.
 *    Les combats arrivés entre-temps sont repris par le passage courant avant
 *    qu'il ne rende la main — sans quoi deux lots qui se recouvrent rejoueraient
 *    le même combattant.
 *
 * Le garde du premier MJ actif est posé au passage et non à la création du
 * combattant : il avertit quand aucun MJ n'est connecté, et l'avertissement
 * doit se dire une fois par lot, pas une fois par jeton.
 *
 * Toutes les méthodes sont statiques : la classe sert de namespace.
 */
export default class Initiative {

    /**
     * Les combats dont au moins un combattant vient d'entrer en scène, en
     * attente du prochain passage. Un `Set` : le même combat ajouté trente fois
     * n'y figure qu'une.
     * @type {Set<Combat>}
     */
    static #pending = new Set();

    /**
     * Un passage est-il en cours ? Le drapeau de sérialisation.
     * @type {boolean}
     */
    static #rolling = false;

    /**
     * Le déclenchement différé du passage, partagé par toutes les créations.
     * @type {Function}
     */
    static #schedule = foundry.utils.debounce(() => Initiative.rollPending(), BATCH_DELAY_MS);

    /**
     * Le réglage est-il actif dans ce monde ?
     *
     * @returns {boolean} True si l'initiative doit être lancée d'office.
     */
    static isEnabled() {
        return game.settings.get(MODULE_ID, ROLL_INITIATIVE_SETTING) === true;
    }

    /**
     * Un combattant vient d'entrer en combat : son combat rejoint le lot en
     * attente.
     *
     * Le combat est lu sur le combattant (`parent`) plutôt que sur `game.combat`
     * : un combattant ajouté à un combat qui n'est pas celui de la scène active
     * verrait sinon l'initiative jetée dans le mauvais combat.
     *
     * @param {Combatant} combatant - Le combattant qui vient d'être créé.
     *
     * @returns {void}
     */
    static onCombatantCreated(combatant) {
        if (!Initiative.isEnabled()) {
            return;
        }
        const combat = combatant?.parent;
        if (!combat) {
            return;
        }
        Initiative.#pending.add(combat);
        Initiative.#schedule();
    }

    /**
     * Jette l'initiative des combats en attente, un seul passage à la fois.
     *
     * La boucle ne rend la main qu'une fois le lot vide : un combattant ajouté
     * pendant que les dés roulent est servi par le passage en cours. Et si le
     * dernier arrivé s'est glissé juste après la dernière vérification, un
     * nouveau passage est programmé plutôt que perdu.
     *
     * @returns {Promise<void>}
     */
    static async rollPending() {
        if (Initiative.#rolling || Initiative.#pending.size === 0) {
            return;
        }
        if (!isLocalUserFirstActiveGM()) {
            Initiative.#pending.clear();
            return;
        }
        Initiative.#rolling = true;
        try {
            while (Initiative.#pending.size > 0) {
                const combats = [...Initiative.#pending];
                Initiative.#pending.clear();
                for (const combat of combats) {
                    await Initiative.rollMissing(combat);
                }
            }
        } finally {
            Initiative.#rolling = false;
        }
        if (Initiative.#pending.size > 0) {
            Initiative.#schedule();
        }
    }

    /**
     * Jette l'initiative de tous les combattants d'un combat qui n'en ont pas.
     *
     * Le combat est interrogé avant d'appeler `rollAll` : le lot peut arriver
     * alors que tout le monde a déjà son initiative — un combattant invoqué naît
     * avec la sienne, posée par fq-card-engine — et il n'y a alors rien à faire.
     *
     * Un échec est journalisé sans être propagé : il ne doit pas emporter la
     * boucle et laisser les combats suivants sans initiative.
     *
     * @param {Combat} combat - Le combat à servir.
     *
     * @returns {Promise<void>}
     */
    static async rollMissing(combat) {
        const missing = combat?.combatants?.filter(c => c.initiative === null) ?? [];
        if (missing.length === 0) {
            return;
        }
        debug(`initiative : ${missing.length} combattant(s) à servir`);
        try {
            await combat.rollAll();
        } catch (e) {
            error("initiative : le jet d'office a échoué", e);
        }
    }
}

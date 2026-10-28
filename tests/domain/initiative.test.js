import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {MODULE_ID} from "../../src/core/constants.js";

/**
 * L'initiative lancée d'office à l'entrée en combat.
 *
 * Ce qui est vérifié ici, c'est le REGROUPEMENT : un geste du MJ qui pousse
 * trente jetons dans le combat ne doit donner qu'un seul jet, et aucun
 * combattant ne doit voir son dé jeté deux fois — c'est précisément ce que
 * faisait un jet lancé à chaque création de combattant.
 *
 * Le module garde son lot d'attente dans des champs statiques : chaque test le
 * réimporte à neuf (`resetModules`) pour ne pas hériter du lot du précédent. Le
 * débounce passe par les faux timers de vitest.
 */

/**
 * Le module sous test, réimporté avant chaque test.
 * @type {object}
 */
let Initiative;

/**
 * Le délai de regroupement, relu du module plutôt que recopié.
 * @type {number}
 */
let delay;

/**
 * Un combat et ses combattants, tel que le module le lira.
 *
 * `rollAll` fait ce que fait celui de dnd5e : il sert les combattants qui n'ont
 * pas d'initiative, et laisse les autres tranquilles.
 *
 * @param {object} [options] - Ce qui distingue ce combat.
 * @param {string} [options.id] - L'identifiant du combat.
 * @param {number} [options.missing] - Combien de combattants attendent leur initiative.
 * @param {number} [options.served] - Combien de combattants ont déjà la leur.
 *
 * @returns {object} Le combat simulé.
 */
function makeCombat({id = "combat1", missing = 1, served = 0} = {}) {
    const combatants = [];
    for (let i = 0; i < missing; i++) {
        combatants.push({id: `${id}-m${i}`, initiative: null});
    }
    for (let i = 0; i < served; i++) {
        combatants.push({id: `${id}-s${i}`, initiative: 12});
    }
    const combat = {
        id,
        combatants,
        rollAll: vi.fn(async () => {
            combat.combatants.forEach(c => {
                if (c.initiative === null) {
                    c.initiative = 10;
                }
            });
        })
    };
    return combat;
}

/**
 * Laisse se dérouler la chaîne de promesses du passage en cours : le jet qui
 * reprend, la boucle qui reprend la main, le lot resté en attente. Rien à
 * avancer du côté des timers ici, tout se joue en micro-tâches.
 *
 * @returns {Promise<void>}
 */
async function settle() {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

/**
 * L'entrée en combat de tous les combattants d'un combat, un à un, comme Foundry
 * les crée.
 *
 * @param {object} combat - Le combat qui les accueille.
 *
 * @returns {void}
 */
function enterCombat(combat) {
    for (const _combatant of combat.combatants) {
        Initiative.onCombatantCreated({parent: combat});
    }
}

describe("initiative d'office", () => {
    beforeEach(async () => {
        vi.useFakeTimers();
        vi.resetModules();

        game.settings.get = vi.fn((scope, key) =>
            scope === MODULE_ID && key === "RollInitiative" ? true : undefined);
        game.user = {id: "gm1", isGM: true};
        game.userId = "gm1";
        game.users = {activeGM: {id: "gm1"}};
        game.combat = null;

        const module = await import("../../src/domain/initiative.js");
        Initiative = module.default;
        delay = module.BATCH_DELAY_MS;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("ne jette qu'une fois l'initiative pour trente jetons ajoutés d'un geste", async () => {
        // La régression visée : un jet par création faisait parcourir les trente
        // combattants trente fois, et les parcours concurrents jetaient plusieurs
        // dés au même combattant.
        const combat = makeCombat({missing: 30});

        enterCombat(combat);
        await vi.advanceTimersByTimeAsync(delay);

        expect(combat.rollAll).toHaveBeenCalledTimes(1);
    });

    it("ne jette rien avant la fin du regroupement", async () => {
        const combat = makeCombat({missing: 3});

        enterCombat(combat);

        expect(combat.rollAll).not.toHaveBeenCalled();
    });

    it("sert le combat du combattant, pas celui de la scène active", async () => {
        // Un combattant peut rejoindre un combat qui n'est pas `game.combat` :
        // l'initiative doit partir dans le bon.
        const active = makeCombat({id: "active"});
        const other = makeCombat({id: "other"});
        game.combat = active;

        Initiative.onCombatantCreated({parent: other});
        await vi.advanceTimersByTimeAsync(delay);

        expect(other.rollAll).toHaveBeenCalledTimes(1);
        expect(active.rollAll).not.toHaveBeenCalled();
    });

    it("jette l'initiative de chaque combat servi dans le même lot", async () => {
        const first = makeCombat({id: "first"});
        const second = makeCombat({id: "second"});

        Initiative.onCombatantCreated({parent: first});
        Initiative.onCombatantCreated({parent: second});
        await vi.advanceTimersByTimeAsync(delay);

        expect(first.rollAll).toHaveBeenCalledTimes(1);
        expect(second.rollAll).toHaveBeenCalledTimes(1);
    });

    it("ne jette rien quand tout le monde a déjà son initiative", async () => {
        // Le cas d'une créature invoquée : elle naît avec l'initiative que son
        // invocateur lui a laissée.
        const combat = makeCombat({missing: 0, served: 4});

        Initiative.onCombatantCreated({parent: combat});
        await vi.advanceTimersByTimeAsync(delay);

        expect(combat.rollAll).not.toHaveBeenCalled();
    });

    it("ne jette rien quand le réglage est éteint", async () => {
        game.settings.get = vi.fn(() => false);
        const combat = makeCombat({missing: 3});

        enterCombat(combat);
        await vi.advanceTimersByTimeAsync(delay);

        expect(combat.rollAll).not.toHaveBeenCalled();
    });

    it("ne jette rien sur le client qui n'est pas le premier MJ actif", async () => {
        // Sans ce garde, chaque client connecté jetterait les mêmes dés.
        game.users = {activeGM: {id: "gm2"}};
        const combat = makeCombat({missing: 3});

        enterCombat(combat);
        await vi.advanceTimersByTimeAsync(delay);

        expect(combat.rollAll).not.toHaveBeenCalled();
    });

    it("n'avertit qu'une fois par lot quand aucun MJ n'est connecté", async () => {
        // L'avertissement est dans le passage et non dans le hook : trente jetons
        // ne doivent pas donner trente notifications.
        game.users = {activeGM: null};
        const combat = makeCombat({missing: 30});

        enterCombat(combat);
        await vi.advanceTimersByTimeAsync(delay);

        expect(ui.notifications.warn).toHaveBeenCalledTimes(1);
        expect(combat.rollAll).not.toHaveBeenCalled();
    });

    it("sert le renfort arrivé pendant que les dés roulent, sans jet concurrent", async () => {
        let release;
        const rolling = new Promise(resolve => {
            release = resolve;
        });
        const combat = makeCombat({missing: 2});
        // Comme celui de dnd5e : il relève les combattants à servir tout de suite,
        // puis fait rouler les dés. Un combattant arrivé après ce relevé n'est donc
        // pas servi par ce jet-là.
        combat.rollAll = vi.fn(async () => {
            const served = combat.combatants.filter(c => c.initiative === null);
            await rolling;
            served.forEach(c => {
                c.initiative = 10;
            });
        });

        enterCombat(combat);
        await vi.advanceTimersByTimeAsync(delay);
        expect(combat.rollAll).toHaveBeenCalledTimes(1);

        // Un combattant de plus alors que le premier jet n'est pas revenu : c'est
        // le chevauchement qui jetait deux dés au même combattant.
        combat.combatants.push({id: "late", initiative: null});
        Initiative.onCombatantCreated({parent: combat});
        await vi.advanceTimersByTimeAsync(delay);
        expect(combat.rollAll).toHaveBeenCalledTimes(1);

        release();
        await settle();
        expect(combat.rollAll).toHaveBeenCalledTimes(2);
    });

    it("journalise un jet manqué sans laisser tomber les combats suivants", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
        const broken = makeCombat({id: "broken"});
        broken.rollAll = vi.fn(async () => {
            throw new Error("jet impossible");
        });
        const sound = makeCombat({id: "sound"});

        Initiative.onCombatantCreated({parent: broken});
        Initiative.onCombatantCreated({parent: sound});
        await vi.advanceTimersByTimeAsync(delay);

        expect(consoleError).toHaveBeenCalled();
        expect(sound.rollAll).toHaveBeenCalledTimes(1);
        consoleError.mockRestore();
    });

    it("ignore un combattant sans combat", async () => {
        Initiative.onCombatantCreated({parent: null});
        Initiative.onCombatantCreated(undefined);
        await vi.advanceTimersByTimeAsync(delay);

        expect(ui.notifications.warn).not.toHaveBeenCalled();
    });
});

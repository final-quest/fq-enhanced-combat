import {beforeEach, describe, expect, it, vi} from "vitest";
import DeathSave, {DEATH_SAVE_SETTING, DELETE_NPC_TOKEN_SETTING} from "../../src/domain/death-save.js";
import {MODULE_ID} from "../../src/core/constants.js";

/**
 * Le début de tour d'un combattant à 0 point de vie.
 *
 * Ce qui est vérifié ici, c'est la RÈGLE : qui lance un jet, qui se dissipe, qui
 * quitte le combat, et ce que devient un personnage selon ses compteurs. Le jet
 * lui-même appartient à dnd5e — on vérifie qu'il est demandé, pas ce qu'il rend.
 *
 * `DeathSave.wait` est neutralisée dans chaque test : `endTurnLater` diffère le
 * passage de main de deux secondes, que personne n'a envie d'attendre. Elle est
 * isolée dans le code précisément pour cela.
 */

/**
 * Un acteur à 0 point de vie, tel que le hook le trouve.
 *
 * @param {object} [options] - Ce qui distingue cet acteur.
 * @param {number} [options.hp] - Ses points de vie courants.
 * @param {string} [options.type] - Son type dnd5e (`character`, `npc`).
 * @param {number} [options.success] - Ses réussites de sauvegarde déjà acquises.
 * @param {number} [options.failure] - Ses échecs déjà encaissés.
 * @param {boolean} [options.minion] - Porte l'estampille d'invocation de fq-card-engine.
 * @param {boolean} [options.rolls] - Le système lui expose un jet de sauvegarde.
 *
 * @returns {object} L'acteur simulé.
 */
function makeActor({hp = 0, type = "character", success = 0, failure = 0,
    minion = false, rolls = true} = {}) {
    const actor = {
        id: "actor1",
        name: "Ilda",
        type,
        system: {attributes: {hp: {value: hp}, death: {success, failure}}},
        flags: minion ? {"fq-card-engine": {summonerId: "witch1"}} : {},
        update: vi.fn(async patch => {
            const value = patch?.["system.attributes.hp.value"];
            if (value !== undefined) {
                actor.system.attributes.hp.value = value;
            }
        }),
        toggleStatusEffect: vi.fn(async () => undefined)
    };
    if (rolls) {
        actor.rollDeathSave = vi.fn(async () => undefined);
    }
    return actor;
}

/**
 * Un combat dont c'est le tour de cet acteur.
 *
 * @param {object} actor - L'acteur du combattant courant.
 *
 * @returns {object} Le combat simulé, avec son combattant et son jeton.
 */
function makeCombat(actor) {
    const token = {delete: vi.fn(async () => undefined)};
    const combatant = {actor, token, delete: vi.fn(async () => undefined)};
    return {combatant, token, nextTurn: vi.fn(async () => undefined)};
}

/**
 * Active (ou non) la fonctionnalité dans les réglages du monde, et règle le sort
 * du jeton des PNJ.
 *
 * @param {boolean} enabled                     - L'état du réglage des jets de mort.
 * @param {object}  [options]                   - Les réglages qui affinent celui-ci.
 * @param {boolean} [options.deleteNpcToken]    - Retire de la scène le jeton des PNJ.
 *
 * @returns {void}
 */
function setEnabled(enabled, {deleteNpcToken = false} = {}) {
    game.settings.get = vi.fn((namespace, key) => {
        if (namespace !== MODULE_ID) {
            return undefined;
        }
        if (key === DEATH_SAVE_SETTING) {
            return enabled;
        }
        return key === DELETE_NPC_TOKEN_SETTING ? deleteNpcToken : undefined;
    });
}

beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(DeathSave, "wait").mockResolvedValue(undefined);
    setEnabled(true);
});

describe("DeathSave — à qui la résolution s'applique", () => {

    it("tient pour à terre un acteur à 0 point de vie ou moins, et lui seul", () => {
        expect(DeathSave.isDown(makeActor({hp: 0}))).toBe(true);
        expect(DeathSave.isDown(makeActor({hp: -5}))).toBe(true);
        expect(DeathSave.isDown(makeActor({hp: 1}))).toBe(false);
    });

    it("ne tient pas pour à terre un acteur sans points de vie chiffrés", () => {
        // Un acteur sans hp exploitable ne doit pas être traité comme mourant : la
        // conséquence serait de le tuer sur un défaut de données.
        expect(DeathSave.isDown({system: {attributes: {}}})).toBe(false);
        expect(DeathSave.isDown(undefined)).toBe(false);
    });

    it("reste inerte quand le réglage du monde est désactivé", () => {
        setEnabled(false);

        expect(DeathSave.isEnabled()).toBe(false);
        expect(DeathSave.skipsTurn(makeActor({hp: 0}))).toBe(false);
    });

    it("reste inerte plutôt que de lever si les réglages ne répondent pas", () => {
        // Chargement partiel du monde : `game.settings.get` lève sur un réglage
        // pas encore enregistré. La fonctionnalité doit se taire, pas casser le tour.
        game.settings.get = vi.fn(() => {
            throw new Error("réglage non enregistré");
        });

        expect(DeathSave.isEnabled()).toBe(false);
        expect(DeathSave.deletesNpcToken()).toBe(false);
    });

    it("ne retire le jeton des PNJ que si le MJ l'a demandé", () => {
        expect(DeathSave.deletesNpcToken()).toBe(false);

        setEnabled(true, {deleteNpcToken: true});

        expect(DeathSave.deletesNpcToken()).toBe(true);
    });

    it("ne prend en charge le tour que d'un acteur à terre, réglage activé", () => {
        expect(DeathSave.skipsTurn(makeActor({hp: 0}))).toBe(true);
        expect(DeathSave.skipsTurn(makeActor({hp: 3}))).toBe(false);
    });

    it("reconnaît un sbire par l'estampille d'invocation de fq-card-engine", () => {
        expect(DeathSave.isMinion(makeActor({minion: true}))).toBe(true);
        expect(DeathSave.isMinion(makeActor())).toBe(false);
        // Estampille d'un autre module : ce n'est pas un sbire de Final Quest.
        expect(DeathSave.isMinion({flags: {"autre-module": {summonerId: "x"}}})).toBe(false);
    });
});

describe("DeathSave.resolveTurnStart — qui lance, qui se dissipe, qui quitte", () => {

    it("laisse son tour à un combattant debout", async () => {
        const actor = makeActor({hp: 12});
        const combat = makeCombat(actor);

        expect(await DeathSave.resolveTurnStart(combat)).toBe(false);
        expect(actor.rollDeathSave).not.toHaveBeenCalled();
        expect(combat.nextTurn).not.toHaveBeenCalled();
    });

    it("ne touche à rien quand le réglage est désactivé", async () => {
        setEnabled(false);
        const actor = makeActor({hp: 0});
        const combat = makeCombat(actor);

        expect(await DeathSave.resolveTurnStart(combat)).toBe(false);
        expect(actor.rollDeathSave).not.toHaveBeenCalled();
    });

    it("dissipe un sbire à terre : aucun jet, et son jeton part avec lui", async () => {
        const actor = makeActor({hp: 0, minion: true});
        const combat = makeCombat(actor);

        expect(await DeathSave.resolveTurnStart(combat)).toBe(true);
        expect(actor.rollDeathSave).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(combat.token.delete).toHaveBeenCalled());
        expect(combat.nextTurn).toHaveBeenCalled();
        expect(combat.combatant.delete).toHaveBeenCalled();
    });

    it("sort un PNJ du combat sans jet, mais LAISSE son jeton sur la scène", async () => {
        // Réglage par défaut : ce que devient le corps d'un PNJ appartient au MJ —
        // butin, mise en scène, retrait. Le module ne décide pas à sa place.
        const actor = makeActor({hp: 0, type: "npc"});
        const combat = makeCombat(actor);

        expect(await DeathSave.resolveTurnStart(combat)).toBe(true);
        expect(actor.rollDeathSave).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(combat.combatant.delete).toHaveBeenCalled());
        expect(combat.token.delete).not.toHaveBeenCalled();
    });

    it("retire aussi le jeton du PNJ de la scène quand le MJ l'a demandé", async () => {
        setEnabled(true, {deleteNpcToken: true});
        const actor = makeActor({hp: 0, type: "npc"});
        const combat = makeCombat(actor);

        expect(await DeathSave.resolveTurnStart(combat)).toBe(true);
        await vi.waitFor(() => expect(combat.token.delete).toHaveBeenCalled());
        expect(combat.combatant.delete).toHaveBeenCalled();
    });

    it("laisse le corps d'un personnage joueur même réglage activé", async () => {
        // Le réglage ne vise que les PNJ : le jeton d'un personnage appartient à son
        // joueur, et un personnage à terre a encore ses jets de sauvegarde à lancer.
        setEnabled(true, {deleteNpcToken: true});
        const actor = makeActor({hp: 0, failure: 2});
        actor.rollDeathSave = vi.fn(async () => {
            actor.system.attributes.death.failure = 3;
        });
        const combat = makeCombat(actor);

        expect(await DeathSave.resolveTurnStart(combat)).toBe(true);
        await vi.waitFor(() => expect(combat.combatant.delete).toHaveBeenCalled());
        expect(combat.token.delete).not.toHaveBeenCalled();
    });

    it("fait lancer son jet de sauvegarde à un personnage à terre, sans fenêtre", async () => {
        const actor = makeActor({hp: 0});
        const combat = makeCombat(actor);

        await DeathSave.resolveTurnStart(combat);

        expect(actor.rollDeathSave).toHaveBeenCalledWith({fastForward: true}, {configure: false});
    });

    it("passe la main sans rien consommer si le système n'expose pas de jet", async () => {
        // dnd5e absent ou trop ancien : le tour se déroule normalement plutôt que
        // de rester bloqué sur un personnage qui ne peut pas lancer.
        const actor = makeActor({hp: 0, rolls: false});
        const combat = makeCombat(actor);

        expect(await DeathSave.resolveTurnStart(combat)).toBe(false);
        expect(combat.nextTurn).not.toHaveBeenCalled();
    });
});

describe("DeathSave — les conséquences du jet d'un personnage", () => {

    it("rend son tour au personnage que le jet a remis debout", async () => {
        // Réussite critique : le système a déjà rendu le point de vie.
        const actor = makeActor({hp: 0});
        actor.rollDeathSave = vi.fn(async () => {
            actor.system.attributes.hp.value = 1;
        });
        const combat = makeCombat(actor);

        expect(await DeathSave.resolveTurnStart(combat)).toBe(false);
        expect(combat.nextTurn).not.toHaveBeenCalled();
    });

    it("tue le personnage au troisième échec, pose le statut, et laisse le corps", async () => {
        const actor = makeActor({hp: 0, failure: 2});
        actor.rollDeathSave = vi.fn(async () => {
            actor.system.attributes.death.failure = 3;
        });
        const combat = makeCombat(actor);

        expect(await DeathSave.resolveTurnStart(combat)).toBe(true);
        expect(actor.toggleStatusEffect).toHaveBeenCalledWith("dead", {active: true, overlay: true});
        await vi.waitFor(() => expect(combat.combatant.delete).toHaveBeenCalled());
        // Le jeton reste : un personnage mort laisse un corps.
        expect(combat.token.delete).not.toHaveBeenCalled();
    });

    it("remet à 1 point de vie le personnage dont les compteurs viennent d'être soldés", async () => {
        // Trois réussites : le système remet les compteurs à zéro et laisserait le
        // personnage stabilisé à 0. La règle du module le relève à 1.
        const actor = makeActor({hp: 0, success: 2});
        actor.rollDeathSave = vi.fn(async () => {
            actor.system.attributes.death.success = 0;
            actor.system.attributes.death.failure = 0;
        });
        const combat = makeCombat(actor);

        expect(await DeathSave.resolveTurnStart(combat)).toBe(false);
        expect(actor.update).toHaveBeenCalledWith({"system.attributes.hp.value": 1});
    });

    it("ne relève pas un personnage dont les compteurs étaient déjà vierges", async () => {
        // Premier jet de la série : compteurs à zéro avant comme après, ce n'est
        // pas une stabilisation. Sans cette distinction, un simple échec relèverait
        // le personnage.
        const actor = makeActor({hp: 0, success: 0, failure: 0});
        const combat = makeCombat(actor);

        expect(await DeathSave.resolveTurnStart(combat)).toBe(true);
        expect(actor.update).not.toHaveBeenCalled();
    });

    it("fait passer son tour au personnage sur un jet non concluant", async () => {
        const actor = makeActor({hp: 0, failure: 1});
        actor.rollDeathSave = vi.fn(async () => {
            actor.system.attributes.death.failure = 2;
        });
        const combat = makeCombat(actor);

        expect(await DeathSave.resolveTurnStart(combat)).toBe(true);
        expect(actor.toggleStatusEffect).not.toHaveBeenCalled();
        await vi.waitFor(() => expect(combat.nextTurn).toHaveBeenCalled());
        // Son tour passe, mais il reste dans le combat : le suivant reviendra.
        expect(combat.combatant.delete).not.toHaveBeenCalled();
    });
});

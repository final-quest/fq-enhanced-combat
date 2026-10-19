import {I18N, MODULE_ID} from "../core/constants.js";
import {DEATH_SAVE_SETTING, DELETE_NPC_TOKEN_SETTING} from "../domain/death-save.js";
import TurnTimer, {TURN_TIMER_DURATION_SETTING, TURN_TIMER_SETTING} from "../domain/turn-timer.js";

/**
 * Enregistrement des réglages du module (`game.settings.register`), appelé par
 * `src/hook/init.hook.js`.
 *
 * Chaque fonctionnalité extraite de fq-card-engine ajoute ici son propre
 * réglage, avec ses clés de libellé dans `lang/en.json` et `lang/fr.json`.
 *
 * @returns {void}
 */
export function registerSettings() {
    game.settings.register(MODULE_ID, DEATH_SAVE_SETTING, {
        name: game.i18n.localize(`${I18N}.DeathSaveSetting`),
        hint: game.i18n.localize(`${I18N}.DeathSaveSettingHint`),
        scope: "world",     // la règle vaut pour la table entière, pas par client
        config: true,
        type: Boolean,
        // Désactivée par défaut : elle confie au module la mort des personnages et
        // la disparition des sbires, ce doit être un choix explicite du MJ.
        default: false
    });

    // Affine le réglage précédent, dont il dépend : sans jets de sauvegarde, aucun
    // PNJ ne quitte le combat et il n'y a pas de jeton à retirer.
    game.settings.register(MODULE_ID, DELETE_NPC_TOKEN_SETTING, {
        name: game.i18n.localize(`${I18N}.DeleteNpcTokenSetting`),
        hint: game.i18n.localize(`${I18N}.DeleteNpcTokenSettingHint`),
        scope: "world",
        config: true,
        type: Boolean,
        // Désactivé par défaut : faire disparaître le corps d'un PNJ prive le MJ de
        // sa mise en scène et de son butin, et c'est le comportement d'avant ce
        // réglage — le jeton reste.
        default: false
    });

    game.settings.register(MODULE_ID, "RollInitiative", {
        name: game.i18n.localize(`${I18N}.RollInitiativeSetting`),
        hint: game.i18n.localize(`${I18N}.RollInitiativeSettingHint`),
        scope: "world",
        config: true,
        type: Boolean,
        // Désactivée par défaut : lancer l'initiative d'office change la façon de
        // démarrer un combat, le MJ doit le demander.
        default: false
    });

    game.settings.register(MODULE_ID, TURN_TIMER_SETTING, {
        name: game.i18n.localize(`${I18N}.TurnTimerSetting`),
        hint: game.i18n.localize(`${I18N}.TurnTimerSettingHint`),
        scope: "world",
        config: true,
        type: Boolean,
        // Désactivé par défaut : passer la main d'office peut couper un joueur au
        // milieu d'une action, ce doit être un choix explicite du MJ.
        default: false,
        // Le chronomètre se remet à zéro sans attendre le tour suivant : un MJ qui
        // l'allume en pleine bataille doit le voir tout de suite.
        onChange: () => TurnTimer.rearmForGM()
    });

    game.settings.register(MODULE_ID, TURN_TIMER_DURATION_SETTING, {
        name: game.i18n.localize(`${I18N}.TurnTimerDurationSetting`),
        hint: game.i18n.localize(`${I18N}.TurnTimerDurationSettingHint`),
        scope: "world",
        config: true,
        type: Number,
        range: {min: TurnTimer.MIN_DURATION, max: TurnTimer.MAX_DURATION, step: 5},
        default: TurnTimer.DEFAULT_DURATION,
        // La nouvelle durée vaut pour le tour en cours, et non pour le suivant :
        // le MJ qui rallonge les tours le fait pour celui qui s'étire sous ses yeux.
        onChange: () => TurnTimer.rearmForGM()
    });

    game.settings.register(MODULE_ID, "Debug", {
        name: game.i18n.localize(`${I18N}.DebugSetting`),
        hint: game.i18n.localize(`${I18N}.DebugSettingHint`),
        scope: "client",    // "world" = synchronisé en base, "client" = stockage local
        config: true,       // false pour un réglage caché de la fenêtre de configuration
        type: Boolean,
        default: false,
        onChange: value => {
            CONFIG.FqEnhancedCombat.options.debug = value;
        }
    });
}

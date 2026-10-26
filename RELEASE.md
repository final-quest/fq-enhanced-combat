Update 3.0.1:
    Feat:
        - A combatant brought to 0 hit points by damage is now resolved on the spot, without waiting for a turn: an NPC or a minion leaves the fight (and the scene, by the same token rules as before), and a character who was playing their turn sees it end
        - A character's death saving throws stay where the rules put them, at the start of each of their turns; the hand is passed only once per turn, whichever of the two resolutions gets there first
        - "Remove NPC tokens from the scene" setting: an NPC leaving the fight at 0 hit points also has its token deleted, where a dead player character always leaves a body and a minion always takes its own away
        - That setting is off by default and has no effect while death saving throws are off: making an NPC body disappear takes its staging and its loot away from the GM, so it stays the GM's own call
    Chore:
        - Version bump: Foundry 14.369 and dnd5e 6.0.6 verified, two patch releases that needed no change on our side
        - The fall to 0 hit points is caught on dnd5e.damageActor, the only point every damage source goes through: the system's own damage application as much as the direct actor update the FQ Card Engine cards use, and only on a real drop
        - Version following FQ Card Engine and FQ Restrain Movement: the three modules are published together

Update 3.0.0:
    Feat:
        - Turn timer on the turn of combatants owned by a player, passing the hand to the next combatant when it expires
        - Banner in the combat tracker: the remaining time in m:ss, a bar that empties, an alert in the last five seconds
        - The same countdown for everyone: the first active GM writes the turn deadline in a combat flag, and each client derives the remaining time from the server clock (game.time.serverTime) instead of its own
        - A player reloading their page mid-turn sees the time they really have left
        - Foundry's pause freezes the countdown, and resuming gives the player back exactly the time they had left
        - GM-led turns are not timed, and neither is the turn of a combatant at 0 hit points when death saving throws already handle it
        - Two world settings for the timer: activation, and the duration of a turn (slider from 10 to 300 seconds, 60 by default), a change applying to the current turn
        - Death saving throws at the start of the turn of a combatant at 0 hit points: a saving throw for a character (three successes bring them back to 1 hit point, three failures kill them), dispel for a minion, exit from combat for an NPC
        - Initiative rolled on joining combat, for every combatant that does not have one yet
        - Public API game.modules.get("fq-enhanced-combat").api, the entry point through which FQ Card Engine queries this module (deathSave.skipsTurn to know whether a turn start escapes it, turnTimer.remainingMs for the time left on the current turn)
    Chore:
        - First release: the scaffolding, two features taken over from FQ Card Engine and one written here, all three off by default
        - Host of the FQ Card Engine combat features that belong to dnd5e rather than to Final Quest, extracted one at a time so they can be used without the card system
        - Manifest: dnd5e 6.x, Foundry 14, no module dependency, socket disabled - each extraction adds what it needs
        - Loading chain src/init-enhanced-combat.js (window.FqEnhancedCombatModule facade and CONFIG.FqEnhancedCombat namespace), then the init and setup hooks
        - "Debug logs" setting, translated into English and French
        - Toolchain taken from FQ Card Engine: ESLint (same rules), Vitest, and a GitHub CI (lint + tests, release on tag)
        - Version following FQ Card Engine and FQ Restrain Movement: the three modules are published together

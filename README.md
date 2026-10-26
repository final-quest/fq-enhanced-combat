# FQ Enhanced Combat for FoundryVTT

Generic combat enhancements for the **dnd5e** system.

This module is the home of the combat features that grew inside the
[FQ Card Engine](https://github.com/final-quest/fq-card-engine) but belong to
dnd5e rather than to Final Quest. Moved here, they can be used at any dnd5e
table, without the Final Quest card battle system.

> **Status: three features, all off by default.** Death saving throws and
> automatic initiative came over from the FQ Card Engine; the turn timer was
> written here. Features land one at a time — see [RELEASE.md](RELEASE.md) for
> what each version adds.

## Requirements

- Foundry VTT 14+
- dnd5e system 6.x

No module dependency, and no socket: each extracted feature declares what it
needs in `module.json` when it lands.

## Installation

Paste this manifest URL in Foundry's *Install Module* dialog:

```
https://github.com/final-quest/fq-enhanced-combat/releases/latest/download/module.json
```

## Settings

All rule settings are world settings and all are off by default: each one
changes how a fight is run, so it has to be the GM's explicit choice.

| Setting | Scope | Default | Effect |
| --- | --- | --- | --- |
| Death saving throws | world | off | Damage that brings a combatant to 0 hit points takes an NPC out of the fight and a minion off the scene at once, and ends the turn of a character who was playing it; a character at 0 hit points rolls their death save at the start of their turn. |
| Remove NPC tokens from the scene | world | off | An NPC leaving the fight at 0 hit points also has its token deleted. Player characters are never affected. Needs death saving throws. |
| Roll Initiative | world | off | Rolls initiative for every combatant that still lacks it when one joins the fight. |
| Turn timer | world | off | Counts down the turn of every combatant owned by a player and hands over to the next combatant when the time runs out. |
| Turn duration (seconds) | world | 60 | How long a player's turn lasts. A new duration applies to the turn under way. |
| Debug logs | client | off | Writes the module's debug messages to the browser console. |

The turn timer shows its countdown in the combat tracker, the same for everyone:
the first active GM writes the turn's deadline to a combat flag, and every client
reads it — so a player who reloads mid-turn sees the real time left, not a fresh
turn. Foundry's pause freezes it.

## For other modules

The module exposes its public entry points on the standard Foundry slot, and a
global façade on the FQ Card Engine model:

```js
game.modules.get("fq-enhanced-combat").api   // per-feature entry points
FqEnhancedCombatModule.moduleName            // "fq-enhanced-combat"
```

The façade carries the module's identity; `api` carries one entry per feature —
`deathSave.skipsTurn(actor)` tells whether a turn start is handled here, and
`turnTimer.remainingMs()` gives the time left on the current turn, or `null` when
it is not timed.

## Development

```bash
npm install
npm run lint
npm test
```

- `src/` — sources, loaded in the order declared by `module.json`
  (`init-enhanced-combat.js` first: it opens `CONFIG.FqEnhancedCombat`, which the
  hooks then read).
  - `src/config/` — `game.settings` registrations.
  - `src/core/` — layer without any dependency on the rest of the module.
  - `src/domain/` — one file per feature, holding the rule and nothing else.
  - `src/ui/` — what the features add to Foundry's own windows.
  - `src/hook/` — one file per Foundry hook.
- `lang/` — `en.json` and `fr.json`, keys prefixed `FQCOMBAT.`.
- `tests/` — Vitest, with the Foundry globals mocked in `tests/setup.js`.
- `devNotes/` — working notes, including the extraction checklist.

ESLint rules are those of the FQ Card Engine, so code extracted from it stays
lint-clean: 4-space indent, double quotes, semicolons, and `game.actors` access
banned.

Releases are cut by tagging: the GitHub workflow refuses a tag that does not
match the `version` in `module.json`, and takes the release notes from the
matching `Update <version>:` block of [RELEASE.md](RELEASE.md).

## License

MIT — see [LICENSE](LICENSE). See [CREDITS](CREDITS) for what this module builds
on.

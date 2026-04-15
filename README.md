# DeadVector

DeadVector is a browser-based top-down zombie survival arena built with HTML5 Canvas and vanilla JavaScript. Survive endless waves of FSM-driven zombies, unlock weapons and upgrades, and fight through escalating boss encounters.

![DeadVector preview](./docs/deadvector-preview.png)

## Controls

| Action | Input |
|--------|-------|
| Move | `W` `A` `S` `D` or Arrow Keys |
| Aim | Mouse |
| Shoot | Left Click (hold for auto-fire) |
| Dash | Right Click |
| Switch Weapon | Scroll Wheel or `1` `2` `3` |
| Loadout / Stats | `TAB` or `E` |
| Pause | `Escape` |
| Mute | `M` |
| Restart (from menu / game over) | `R` |

## Core Systems

### Weapons

Three unlockable weapons, each with a distinct role:

| Weapon | Type | Pellets | Notes |
|--------|------|---------|-------|
| Service Pistol | Semi-auto | 1 | Available from the start |
| Scatter Cannon | Semi-auto | 7 | Unlocked at level 2 (25 scrap) |
| Vector SMG | Full-auto | 1 | Unlocked at level 4 (75 scrap) |

### Progression

- Killing enemies earns **XP**. Each level-up offers a choice of 3 upgrade cards.
- Enemies can drop **scrap**, a currency spent on premium upgrades and weapon unlocks.
- **Combo system**: chaining kills without a gap grants bonus XP and damage at higher streaks.
- **31 normal upgrades** across pistol, shotgun, SMG, and global categories plus 3 rare upgrades.
- **6 boss-exclusive upgrades** only available from boss reward cards.

### Enemies

Five zombie types, all driven by the shared FSM in `js/ai/fsm.js`:

| Type | Role |
|------|------|
| Shambler | Slow melee, high durability |
| Sprinter | Fast glass-cannon melee |
| Spitter | Ranged acid kiter |
| Brute | Heavy melee tank |
| Screamer | Ranged support, speed-buffs nearby allies |

Enemy stats scale with wave number (health, speed, notice range).

### Bosses

A boss spawns every 5 waves. Three base archetypes evolve into named variants across 8 scheduled encounters, then continue to scale infinitely:

| Wave | Boss | Archetype |
|------|------|-----------|
| 5 | Juggernaut | Melee slam |
| 10 | Brood Mother | Ranged burst |
| 15 | Titan | AoE shockwave |
| 20 | Warlord Grim | Evolved Juggernaut |
| 25 | Queen Vespera | Evolved Brood Mother |
| 30 | The Monolith | Evolved Titan |
| 35 | The Amalgam | Hybrid (burst + slam) |
| 40 | Omega | Ultimate Titan |

Defeating a boss grants scrap and a boss reward card with exclusive upgrades.

### Waves

- Wave-based spawning with increasing enemy count and composition.
- New enemy types unlock at higher waves (Spitter wave 2, Brute wave 4, Screamer wave 6).
- Beyond wave 40, bosses continue to scale in health, damage, and speed.

## FSM AI

Every zombie and boss instance uses the reusable `FiniteStateMachine` class from `js/ai/fsm.js`.

**States:** `SPAWN` → `WANDER` → `CHASE` → `ATTACK` → `RETREAT` → `DEAD`

Any zombie transitions to `DEAD` when health reaches zero (global `anyTransition`). Transition conditions, speeds, retreat thresholds, and attack patterns vary per enemy type.

![DeadVector FSM](./docs/fsm-diagram.svg)

- [Interactable version](https://mermaid.ai/d/7c2c18e1-5aec-4f25-972f-532795846046)

- Full diagram with Mermaid source: [docs/fsm-diagram.md](./docs/fsm-diagram.md)
- Transition table: [docs/fsm-table.md](./docs/fsm-table.md)

## Implemented Event Types

`load`, `keydown`, `keyup`, `keypress`, `mousemove`, `mousedown`, `mouseup`, `click`, `contextmenu`, `wheel`, `resize`, `focus`, `blur`, `visibilitychange`, custom events (`gameStart`, `waveComplete`, `levelUp`, `gameOver`), `requestAnimationFrame`, `setTimeout`, `setInterval` — 21 total.

## UI & Menus

- **Main menu** with Play, Guide, and Settings buttons.
- **Pause menu** with resume, settings, and quit-to-menu options (with confirmation dialog).
- **Game over screen** showing score, wave, kills, and max combo.
- **Level-up screen** presenting 3 upgrade cards (select with `1` `2` `3` or click).
- **Boss reward screen** after each boss kill.
- **Loadout panel** (`TAB`/`E`) displaying weapon stats and acquired upgrades.
- **In-game Guide** with tabs covering all enemies, bosses, weapons, items, and controls with animated canvas previews.
- **Settings panel**: master / music / SFX volume, screen shake, damage numbers, blood, FPS counter, UI scale, dev mode toggle.
- **Canvas-rendered HUD** with health, energy, weapon, wave, score, combo, and XP bar.

## Technologies

- HTML5 Canvas 2D
- JavaScript ES6 modules
- CSS3 (custom properties, grid, flexbox)
- Web Audio API
- Google Fonts (Orbitron, Inter, Share Tech Mono)

## Documentation

- [rules.md](./rules.md) — assignment brief
- [docs/fsm-diagram.md](./docs/fsm-diagram.md) — FSM diagram with Mermaid source
- [docs/fsm-table.md](./docs/fsm-table.md) — FSM transition table
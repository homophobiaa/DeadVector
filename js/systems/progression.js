/**
 * progression.js — XP, leveling, upgrades, scrap, and weapon unlocks.
 *
 * Design:
 *   - XP bar fills 0→100, overflow carries over.
 *   - Level-up slows game to ~25% and shows 3 upgrade cards.
 *   - Scrap drops from enemies and is spent on premium upgrades.
 *   - Weapons unlock via upgrade cards (Shotgun after lvl 2, SMG after lvl 4).
 *   - Combo bonuses: XP gain at x10+, damage at x25+.
 */

// ── Upgrade definitions ───────────────────────────────────────────

const UPGRADES = [
  // PISTOL (9)
  { id: "precision_core",  name: "Precision Core",  desc: "+15% crit chance",            category: "Pistol",  weapon: "pistol",  scrapCost: 0 },
  { id: "double_tap",      name: "Double Tap",      desc: "Fires 2 bullets quickly",     category: "Pistol",  weapon: "pistol",  scrapCost: 0 },
  { id: "ricochet",        name: "Ricochet I",      desc: "Bullets bounce once",          category: "Pistol",  weapon: "pistol",  scrapCost: 0 },
  { id: "high_caliber",    name: "High Caliber",    desc: "+20% damage",                  category: "Pistol",  weapon: "pistol",  scrapCost: 3 },
  { id: "rapid_trigger",   name: "Rapid Trigger",   desc: "+15% fire rate",               category: "Pistol",  weapon: "pistol",  scrapCost: 0 },
  { id: "deadeye",         name: "Deadeye",         desc: "Crits deal +40% damage",       category: "Pistol",  weapon: "pistol",  scrapCost: 5 },
  { id: "piercing_shot",   name: "Piercing Shot",   desc: "Bullets pass through 1 enemy", category: "Pistol",  weapon: "pistol",  scrapCost: 3 },
  { id: "fast_hands",      name: "Fast Hands",      desc: "+20% fire rate",               category: "Pistol",  weapon: "pistol",  scrapCost: 3 },
  { id: "mark_target",     name: "Mark Target",     desc: "Hit enemies take +15% dmg for 2s", category: "Pistol", weapon: "pistol", scrapCost: 8 },

  // SHOTGUN (8)
  { id: "unlock_shotgun",  name: "Unlock Shotgun",  desc: "Adds Scatter Cannon to loadout", category: "Shotgun", weapon: "shotgun", scrapCost: 25, isUnlock: true },
  { id: "dense_shells",    name: "Dense Shells",    desc: "+2 pellets per shot",          category: "Shotgun", weapon: "shotgun", scrapCost: 3 },
  { id: "knockback_core",  name: "Knockback Core",  desc: "Pushes enemies on hit",        category: "Shotgun", weapon: "shotgun", scrapCost: 0 },
  { id: "tight_spread",    name: "Tight Spread",    desc: "More focused cone",            category: "Shotgun", weapon: "shotgun", scrapCost: 0 },
  { id: "blast_core",      name: "Blast Core",      desc: "Small explosion on hit",       category: "Shotgun", weapon: "shotgun", scrapCost: 15 },
  { id: "wide_blast",      name: "Wide Blast",      desc: "+35% spread, +2 pellets",      category: "Shotgun", weapon: "shotgun", scrapCost: 3 },
  { id: "heavy_shells",    name: "Heavy Shells",    desc: "+30% damage, -25% fire rate",  category: "Shotgun", weapon: "shotgun", scrapCost: 8 },
  { id: "shockwave",       name: "Shockwave",       desc: "Kills push nearby enemies back", category: "Shotgun", weapon: "shotgun", scrapCost: 12 },

  // SMG (8)
  { id: "unlock_smg",      name: "Unlock Vector SMG", desc: "Adds Vector SMG to loadout",   category: "SMG",   weapon: "smg",     scrapCost: 75, isUnlock: true },
  { id: "overdrive",       name: "Overdrive",       desc: "Fire rate ramps while shooting", category: "SMG",   weapon: "smg",     scrapCost: 0 },
  { id: "stabilizer",      name: "Stabilizer",      desc: "Reduce spread by 25%",         category: "SMG",    weapon: "smg",     scrapCost: 0 },
  { id: "shredder",        name: "Shredder",        desc: "Damage increases per hit on same target", category: "SMG", weapon: "smg", scrapCost: 3 },
  { id: "spray_boost",     name: "Spray Boost",     desc: "Wider spread but more bullets", category: "SMG",   weapon: "smg",     scrapCost: 3 },
  { id: "bullet_storm",    name: "Bullet Storm",    desc: "+3 pellets, +50% spread",      category: "SMG",    weapon: "smg",     scrapCost: 10 },
  { id: "heat_buildup",    name: "Heat Build",      desc: "Continuous fire ramps damage +20%", category: "SMG", weapon: "smg",    scrapCost: 5 },
  { id: "tracking_spray",  name: "Tracking Spray",  desc: "-15% spread while moving",     category: "SMG",    weapon: "smg",     scrapCost: 0 },

  // GLOBAL (6)
  { id: "speed_boost",     name: "Speed Boost",     desc: "+12% movement speed",          category: "Global", weapon: null,      scrapCost: 0 },
  { id: "magnet_core",     name: "Magnet Core",     desc: "Increased pickup radius",      category: "Global", weapon: null,      scrapCost: 0 },
  { id: "vital_surge",     name: "Vital Surge",     desc: "Small heal on kill",           category: "Global", weapon: null,      scrapCost: 0 },
  { id: "adrenaline",      name: "Adrenaline",      desc: "Below 40% HP: +20% damage",    category: "Global", weapon: null,      scrapCost: 3 },
  { id: "scavenger",       name: "Scavenger",       desc: "Double scrap drop chance",     category: "Global", weapon: null,      scrapCost: 0 },
  { id: "efficiency",      name: "Efficiency",      desc: "+8% damage, +8% fire rate",    category: "Global", weapon: null,      scrapCost: 8 },

  // RARE (3)
  { id: "chain_reaction",  name: "Chain Reaction",  desc: "Enemies explode on death",     category: "Rare",   weapon: null,      scrapCost: 25 },
  { id: "lightning_chain", name: "Lightning Chain",  desc: "Bullets chain to 2 nearby enemies", category: "Rare", weapon: null,   scrapCost: 30 },
  { id: "freeze_field",    name: "Freeze Field",    desc: "Kills slow nearby enemies for 1.5s", category: "Rare", weapon: null,  scrapCost: 25 },
];

// ── Boss-only upgrades (never appear in normal level-ups) ─────

const BOSS_UPGRADES = [
  { id: "twin_shot",       name: "Twin Shot",       desc: "All weapons fire an extra projectile",       category: "Boss",  weapon: null, scrapCost: 0 },
  { id: "blood_surge",     name: "Blood Surge",     desc: "Kills heal 8 HP and boost damage 15% for 3s", category: "Boss", weapon: null, scrapCost: 0 },
  { id: "arc_discharge",   name: "Arc Discharge",   desc: "Every 4s, a shockwave damages nearby enemies", category: "Boss", weapon: null, scrapCost: 0 },
  { id: "predator_instinct", name: "Predator Instinct", desc: "Kills grant +25% speed and +10% damage for 4s", category: "Boss", weapon: null, scrapCost: 0 },
  { id: "overcharged_rounds", name: "Overcharged Rounds", desc: "Every 8th shot deals 3x damage",       category: "Boss",  weapon: null, scrapCost: 0 },
  { id: "iron_shell",      name: "Iron Shell",      desc: "+30 max HP and +15% damage reduction",       category: "Boss",  weapon: null, scrapCost: 0 },
];

export function getUpgradePool() { return UPGRADES; }

// ── Progression System ────────────────────────────────────────────

export class Progression {
  constructor() {
    this.reset();
  }

  reset() {
    this.xp = 0;
    this.xpMax = 100;
    this.level = 0;
    this.scrap = 0;
    this.acquired = [];            // ids of acquired upgrades
    this.weaponsUnlocked = {       // which weapons the player has
      pistol: true,
      shotgun: false,
      smg: false,
    };

    // Level-up state
    this.levelUpActive = false;
    this.levelUpCards = [];        // 3 upgrade objects currently offered
    this.bossRewardActive = false;
    this.bossRewardCards = [];

    // Overdrive ramp state (SMG upgrade)
    this.overdriveRamp = 0;        // 0-1, builds while firing SMG

    // Shredder tracking (per-enemy hit stacks)
    this.shredderStacks = new Map(); // enemyId → hitCount

    // Mark Target tracking
    this.markedEnemies = new Map();  // enemyId → remaining seconds

    // Combo-based bonuses (recalculated each frame)
    this.comboXpBonus = 0;         // multiplier: 0, 0.1, or 0.2
    this.comboDmgBonus = 0;        // multiplier: 0 or 0.1

    // Boss upgrade state
    this.bloodSurgeTimer = 0;      // remaining seconds of Blood Surge damage boost
    this.predatorTimer = 0;        // remaining seconds of Predator Instinct buff
    this.arcDischargeTimer = 0;    // seconds until next Arc Discharge
    this.shotCounter = 0;          // tracks shots for Overcharged Rounds

    // Early-game Combat Rush: temporary buff that fades
    this.combatRushTimer = 45;     // seconds remaining (active at run start)
  }

  // ── XP & Leveling ────────────────────────────────────────────

  /** XP required for the current level. Scales with level for pacing. */
  xpToNextLevel() {
    // Levels 0-1: fast early hook, 2-3: moderate ramp, 4-7: mid-game, 8+: steep
    if (this.level === 0) return 40;
    if (this.level === 1) return 50;
    if (this.level === 2) return 65;
    if (this.level <= 7) return 80 + this.level * 25;
    return 80 + this.level * 40;
  }

  /** Add XP. Returns the number of NEW level-ups triggered (0, 1, or more).
   *  XP always accumulates. Level-ups that occur during an active upgrade menu
   *  are counted but returned as 0 — the caller must queue them separately. */
  addXp(amount) {
    this.xp += amount;
    let levels = 0;
    while (this.xp >= this.xpToNextLevel()) {
      this.xp -= this.xpToNextLevel();
      this.level += 1;
      levels += 1;
    }
    return levels;
  }

  /** Calculate XP earned from an enemy kill. */
  getXpFromKill(enemy) {
    let base = enemy.isBoss ? 30 : Math.ceil(enemy.config.score / 4);
    base = Math.max(2, Math.min(base, 20));
    return Math.round(base * (1 + this.comboXpBonus));
  }

  // ── Combo Bonuses ────────────────────────────────────────────

  updateComboBonuses(combo) {
    this.comboXpBonus = combo >= 25 ? 0.2 : combo >= 10 ? 0.1 : 0;
    this.comboDmgBonus = combo >= 25 ? 0.1 : 0;
  }

  // ── Scrap ────────────────────────────────────────────────────

  getScrapFromKill(enemy) {
    if (enemy.isBoss) return 18 + Math.floor(Math.random() * 10); // 18-27
    const chance = this.has("scavenger") ? 0.12 : 0.06;
    return Math.random() < chance ? 1 : 0;
  }

  // ── Upgrade Selection Logic ──────────────────────────────────

  /** Build 3 upgrade cards for a level-up. */
  buildLevelUpCards() {
    return this._pickCards(false);
  }

  /** Build 3 upgrade cards for a boss reward (higher rare chance). */
  buildBossRewardCards() {
    return this._pickBossCards();
  }

  /** Boss reward card selection — guarantees 1 boss-exclusive + fills from enhanced normal pool. */
  _pickBossCards() {
    const cards = [];
    const usedIds = new Set();

    // 1. Pick at least 1 boss-exclusive upgrade (if any available)
    const bossPool = BOSS_UPGRADES.filter(u => !this.acquired.includes(u.id));
    if (bossPool.length > 0) {
      this._shuffle(bossPool);
      cards.push(bossPool[0]);
      usedIds.add(bossPool[0].id);
      // Possibly add a second boss-exclusive
      if (bossPool.length > 1 && Math.random() < 0.35) {
        cards.push(bossPool[1]);
        usedIds.add(bossPool[1].id);
      }
    }

    // 2. Fill remaining slots from enhanced normal pool (high rare chance)
    const normalPool = this._getAvailableUpgrades().filter(u => !usedIds.has(u.id));
    const rarePool = normalPool.filter(u => u.category === "Rare");
    const otherPool = normalPool.filter(u => u.category !== "Rare");

    // Try to include a rare card
    if (cards.length < 3 && rarePool.length > 0 && Math.random() < 0.6) {
      const pick = rarePool[Math.floor(Math.random() * rarePool.length)];
      cards.push(pick);
      usedIds.add(pick.id);
    }

    // Fill remaining with normal upgrades
    this._shuffle(otherPool);
    for (const u of otherPool) {
      if (cards.length >= 3) break;
      if (usedIds.has(u.id)) continue;
      cards.push(u);
      usedIds.add(u.id);
    }

    // If still not full, try remaining rare
    if (cards.length < 3) {
      const leftover = rarePool.filter(u => !usedIds.has(u.id));
      for (const u of leftover) {
        if (cards.length >= 3) break;
        cards.push(u);
      }
    }

    // If still not full, try remaining boss pool
    if (cards.length < 3) {
      for (const u of bossPool) {
        if (cards.length >= 3) break;
        if (usedIds.has(u.id)) continue;
        cards.push(u);
      }
    }

    this._shuffle(cards);
    return cards;
  }

  _pickCards(isBossReward) {
    const pool = this._getAvailableUpgrades();
    if (pool.length === 0) return [];

    const rarePool = pool.filter(u => u.category === "Rare");
    const normalPool = pool.filter(u => u.category !== "Rare");
    const cards = [];
    const usedIds = new Set();

    // Rare chance scales with level tier
    let rareChance = 0;
    if (this.level >= 10) {
      rareChance = 0.1;
    } else if (this.level >= 5) {
      rareChance = 0.05;
    }
    if (rarePool.length > 0 && Math.random() < rareChance) {
      const pick = rarePool[Math.floor(Math.random() * rarePool.length)];
      cards.push(pick);
      usedIds.add(pick.id);
    }

    // Fill remaining slots from normal pool
    const remaining = normalPool.filter(u => !usedIds.has(u.id));
    this._shuffle(remaining);
    for (const u of remaining) {
      if (cards.length >= 3) break;
      cards.push(u);
      usedIds.add(u.id);
    }

    // If we still need more, pull from rare
    if (cards.length < 3) {
      const leftover = rarePool.filter(u => !usedIds.has(u.id));
      for (const u of leftover) {
        if (cards.length >= 3) break;
        cards.push(u);
      }
    }

    // Shuffle final order so rare isn't always last
    this._shuffle(cards);
    return cards;
  }

  // Upgrade level-tier restrictions
  // Early (1-4): basic stat upgrades only (precision_core, rapid_trigger, speed_boost, etc.)
  // Mid (5-9): stronger mechanics and weapon specializations
  // Late (10+): full pool including all rare
  static UPGRADE_MIN_LEVEL = {
    // Early unlocks (level 2-3): fun-feeling, controlled power
    knockback_core: 2,     // pushback is satisfying, not raw DPS
    double_tap:     3,     // 2 bullets feels exciting, moderate power
    ricochet:       3,     // bouncing bullets are visually fun
    // Mid-game (level 5+): stronger mechanics
    piercing_shot:  5,     // pass-through is powerful
    fast_hands:     5,     // +20% fire rate stacks hard
    high_caliber:   5,     // +20% damage is a big flat boost
    dense_shells:   5,     // +2 pellets is significant
    wide_blast:     5,
    spray_boost:    5,
    blast_core:     6,
    heavy_shells:   6,
    bullet_storm:   6,
    efficiency:     6,
    heat_buildup:   6,
    adrenaline:     6,
    shockwave:      7,
    mark_target:    7,
    deadeye:        7,
    // Late-game (level 10+): high-impact / rare
    chain_reaction: 10,
    lightning_chain: 10,
    freeze_field:   10,
  };

  _getAvailableUpgrades() {
    const minLevels = Progression.UPGRADE_MIN_LEVEL;
    return UPGRADES.filter(u => {
      // Already acquired?
      if (this.acquired.includes(u.id)) return false;
      // Level-tier restriction
      if (minLevels[u.id] && this.level < minLevels[u.id]) return false;
      // Weapon unlock card: only show if weapon is still locked
      if (u.isUnlock) {
        if (u.weapon === "shotgun" && this.weaponsUnlocked.shotgun) return false;
        if (u.weapon === "smg" && this.weaponsUnlocked.smg) return false;
        // Shotgun unlock available after level 2, SMG after level 4 AND shotgun must be unlocked first
        if (u.weapon === "shotgun" && this.level < 2) return false;
        if (u.weapon === "smg" && (this.level < 4 || !this.weaponsUnlocked.shotgun)) return false;
        return true;
      }
      // Upgrades for locked weapons are hidden
      if (u.weapon === "shotgun" && !this.weaponsUnlocked.shotgun) return false;
      if (u.weapon === "smg" && !this.weaponsUnlocked.smg) return false;
      return true;
    });
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  // ── Upgrade Application ──────────────────────────────────────

  has(upgradeId) {
    return this.acquired.includes(upgradeId);
  }

  acquire(upgradeId) {
    if (this.acquired.includes(upgradeId)) return;
    this.acquired.push(upgradeId);
    // Handle unlock
    const def = UPGRADES.find(u => u.id === upgradeId) || BOSS_UPGRADES.find(u => u.id === upgradeId);
    if (def && def.isUnlock) {
      if (def.weapon === "shotgun") this.weaponsUnlocked.shotgun = true;
      if (def.weapon === "smg") this.weaponsUnlocked.smg = true;
    }
  }

  // ── Stat Modifiers (applied during gameplay) ─────────────────

  /** Get modified weapon stats for shooting. */
  getWeaponMods(weaponName) {
    const mods = {
      damageMultiplier: 1 + this.comboDmgBonus,
      cooldownMultiplier: 1,
      pelletBonus: 0,
      spreadMultiplier: 1,
      critChance: 0,
      critMultiplier: 1.5,
      doubleTap: false,
      ricochet: false,
      piercing: 0,
      knockback: false,
      blastRadius: 0,
      overdriveRamp: 0,
      shredder: false,
      markTarget: false,
      shockwave: false,
      heatDmgBonus: 0,
      lightningChain: 0,
    };

    const lowerName = weaponName.toLowerCase();

    // Combat Rush: early-game temporary fire rate boost
    if (this.combatRushTimer > 0) {
      mods.cooldownMultiplier *= 0.75; // +25% fire rate
    }

    // Global upgrades (apply to all weapons)
    if (this.has("efficiency")) {
      mods.damageMultiplier += 0.08;
      mods.cooldownMultiplier *= 0.92;
    }
    if (this.has("adrenaline")) {
      mods._adrenaline = true; // resolved at fire time with player HP check
    }

    // Pistol upgrades
    if (lowerName.includes("pistol")) {
      if (this.has("precision_core")) mods.critChance += 0.15;
      if (this.has("double_tap"))     mods.doubleTap = true;
      if (this.has("ricochet"))       mods.ricochet = true;
      if (this.has("high_caliber"))   mods.damageMultiplier += 0.20;
      if (this.has("rapid_trigger"))  mods.cooldownMultiplier *= 0.85;
      if (this.has("deadeye"))        mods.critMultiplier += 0.4;
      if (this.has("piercing_shot"))  mods.piercing = 1;
      if (this.has("fast_hands"))     mods.cooldownMultiplier *= 0.8;
      if (this.has("mark_target"))    mods.markTarget = true;
    }

    // Shotgun upgrades
    if (lowerName.includes("scatter") || lowerName.includes("shotgun")) {
      if (this.has("dense_shells"))   mods.pelletBonus += 2;
      if (this.has("knockback_core")) mods.knockback = true;
      if (this.has("tight_spread"))   mods.spreadMultiplier *= 0.65;
      if (this.has("blast_core"))     mods.blastRadius = 40;
      if (this.has("wide_blast"))   { mods.spreadMultiplier *= 1.35; mods.pelletBonus += 2; }
      if (this.has("heavy_shells")) { mods.damageMultiplier += 0.3; mods.cooldownMultiplier *= 1.25; }
      if (this.has("shockwave"))      mods.shockwave = true;
    }

    // SMG upgrades
    if (lowerName.includes("vector") || lowerName.includes("smg")) {
      if (this.has("overdrive"))      mods.overdriveRamp = this.overdriveRamp;
      if (this.has("stabilizer"))     mods.spreadMultiplier *= 0.75;
      if (this.has("shredder"))       mods.shredder = true;
      if (this.has("spray_boost")) {
        mods.spreadMultiplier *= 1.35;
        mods.pelletBonus += 2;
      }
      if (this.has("bullet_storm")) { mods.pelletBonus += 3; mods.spreadMultiplier *= 1.5; }
      if (this.has("heat_buildup"))   mods.heatDmgBonus = this.overdriveRamp * 0.2; // up to +20%
      if (this.has("tracking_spray")) mods._trackingSpray = true; // resolved at fire time
    }

    // Rare
    if (this.has("lightning_chain"))   mods.lightningChain = 2;

    // Boss upgrades
    if (this.has("twin_shot"))         mods.pelletBonus += 1;
    if (this.has("blood_surge") && this.bloodSurgeTimer > 0) mods.damageMultiplier += 0.15;
    if (this.has("predator_instinct") && this.predatorTimer > 0) mods.damageMultiplier += 0.10;
    if (this.has("overcharged_rounds")) mods._overcharged = true;

    return mods;
  }

  /** Get movement speed multiplier. */
  getSpeedMultiplier() {
    let mult = 1;
    if (this.has("speed_boost")) mult += 0.12;
    if (this.combatRushTimer > 0) mult += 0.10; // early-game rush
    return mult;
  }

  /** Get pickup radius multiplier. */
  getPickupRadiusMultiplier() {
    return this.has("magnet_core") ? 2.5 : 1;
  }

  /** Vital Surge: heal amount on kill (0 if not acquired). */
  getHealOnKill() {
    return this.has("vital_surge") ? 3 : 0;
  }

  /** Chain Reaction: should enemy explode on death? */
  hasChainReaction() {
    return this.has("chain_reaction");
  }

  // ── Overdrive Tick (SMG ramp) ────────────────────────────────

  tickOverdrive(isFiring, delta) {
    if (!this.has("overdrive")) { this.overdriveRamp = 0; return; }
    if (isFiring) {
      this.overdriveRamp = Math.min(1, this.overdriveRamp + delta * 0.6);
    } else {
      this.overdriveRamp = Math.max(0, this.overdriveRamp - delta * 1.5);
    }
  }

  // ── Shredder Tracking ────────────────────────────────────────

  getShredderBonus(enemyId) {
    if (!this.has("shredder")) return 0;
    const stacks = this.shredderStacks.get(enemyId) || 0;
    return Math.min(stacks * 0.06, 0.4); // +6% per hit, cap 40%
  }

  addShredderStack(enemyId) {
    if (!this.has("shredder")) return;
    const cur = this.shredderStacks.get(enemyId) || 0;
    this.shredderStacks.set(enemyId, cur + 1);
  }

  clearShredderStacks(enemyId) {
    this.shredderStacks.delete(enemyId);
  }

  // ── Mark Target Tracking ─────────────────────────────────────

  /** Mark an enemy — takes +15% damage for 2 seconds. */
  markEnemy(enemyId) {
    if (!this.has("mark_target")) return;
    this.markedEnemies.set(enemyId, 2.0);
  }

  getMarkBonus(enemyId) {
    if (!this.has("mark_target")) return 0;
    return this.markedEnemies.has(enemyId) ? 0.15 : 0;
  }

  tickMarks(delta) {
    for (const [id, ttl] of this.markedEnemies) {
      const remaining = ttl - delta;
      if (remaining <= 0) this.markedEnemies.delete(id);
      else this.markedEnemies.set(id, remaining);
    }
  }

  // ── Freeze Field ─────────────────────────────────────────────

  hasFreezeField() {
    return this.has("freeze_field");
  }

  // ── Adrenaline ───────────────────────────────────────────────

  getAdrenalineBonus(playerHp, playerMaxHp) {
    if (!this.has("adrenaline")) return 0;
    return (playerHp / playerMaxHp) < 0.4 ? 0.2 : 0;
  }

  // ── Boss Upgrade Helpers ─────────────────────────────────────

  /** Blood Surge: trigger on kill — heal + damage boost. */
  triggerBloodSurge() {
    if (!this.has("blood_surge")) return { heal: 0 };
    this.bloodSurgeTimer = 3.0;
    return { heal: 8 };
  }

  /** Predator Instinct: trigger on kill — speed + damage boost. */
  triggerPredatorInstinct() {
    if (!this.has("predator_instinct")) return { speedBoost: 0 };
    this.predatorTimer = 4.0;
    return { speedBoost: 0.25 };
  }

  /** Arc Discharge: tick timer, return true when shockwave should fire. */
  tickArcDischarge(delta) {
    if (!this.has("arc_discharge")) return false;
    this.arcDischargeTimer -= delta;
    if (this.arcDischargeTimer <= 0) {
      this.arcDischargeTimer = 4.0;
      return true;
    }
    return false;
  }

  /** Overcharged Rounds: increment shot counter, return true on every 8th. */
  tickOverchargedRounds() {
    if (!this.has("overcharged_rounds")) return false;
    this.shotCounter += 1;
    if (this.shotCounter >= 8) {
      this.shotCounter = 0;
      return true;
    }
    return false;
  }

  /** Iron Shell: max HP bonus. */
  getIronShellMaxHp() {
    return this.has("iron_shell") ? 30 : 0;
  }

  /** Iron Shell: damage reduction multiplier. */
  getIronShellDR() {
    return this.has("iron_shell") ? 0.85 : 1;
  }

  /** Get Predator speed multiplier (active buff). */
  getPredatorSpeedBoost() {
    if (!this.has("predator_instinct") || this.predatorTimer <= 0) return 0;
    return 0.25;
  }

  /** Tick boss upgrade timers each frame. */
  tickBossUpgrades(delta) {
    if (this.bloodSurgeTimer > 0) this.bloodSurgeTimer = Math.max(0, this.bloodSurgeTimer - delta);
    if (this.predatorTimer > 0) this.predatorTimer = Math.max(0, this.predatorTimer - delta);
    if (this.combatRushTimer > 0) this.combatRushTimer = Math.max(0, this.combatRushTimer - delta);
  }

  // ── Grouped upgrades for display ─────────────────────────────

  getAcquiredGrouped() {
    const groups = { Pistol: [], Shotgun: [], SMG: [], Global: [], Rare: [], Boss: [] };
    for (const id of this.acquired) {
      const def = UPGRADES.find(u => u.id === id) || BOSS_UPGRADES.find(u => u.id === id);
      if (def && !def.isUnlock) {
        const cat = groups[def.category] ? def.category : "Global";
        groups[cat].push(def);
      }
    }
    return groups;
  }

  /** Return current effective stats for display. */
  getDisplayStats(player) {
    const wpn = player.weapon;
    const mods = this.getWeaponMods(wpn.name);
    return {
      damage: Math.round(wpn.damage * mods.damageMultiplier),
      fireRate: +(1 / (wpn.cooldown * mods.cooldownMultiplier)).toFixed(1),
      moveSpeed: Math.round(player.speed * this.getSpeedMultiplier()),
      critChance: Math.round(mods.critChance * 100),
      comboXpBonus: Math.round(this.comboXpBonus * 100),
      comboDmgBonus: Math.round(this.comboDmgBonus * 100),
    };
  }
}

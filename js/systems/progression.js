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
  // PISTOL (6)
  { id: "precision_core",  name: "Precision Core",  desc: "+15% crit chance",            category: "Pistol",  weapon: "pistol",  scrapCost: 0 },
  { id: "double_tap",      name: "Double Tap",      desc: "Fires 2 bullets quickly",     category: "Pistol",  weapon: "pistol",  scrapCost: 0 },
  { id: "ricochet",        name: "Ricochet I",      desc: "Bullets bounce once",          category: "Pistol",  weapon: "pistol",  scrapCost: 0 },
  { id: "high_caliber",    name: "High Caliber",    desc: "+25% damage",                  category: "Pistol",  weapon: "pistol",  scrapCost: 0 },
  { id: "rapid_trigger",   name: "Rapid Trigger",   desc: "+20% fire rate",               category: "Pistol",  weapon: "pistol",  scrapCost: 0 },
  { id: "deadeye",         name: "Deadeye",         desc: "Crits deal +50% damage",       category: "Pistol",  weapon: "pistol",  scrapCost: 0 },

  // SHOTGUN unlocked (5)
  { id: "unlock_shotgun",  name: "Unlock Shotgun",  desc: "Adds Scatter Cannon to loadout", category: "Shotgun", weapon: "shotgun", scrapCost: 0, isUnlock: true },
  { id: "dense_shells",    name: "Dense Shells",    desc: "+2 pellets per shot",          category: "Shotgun", weapon: "shotgun", scrapCost: 0 },
  { id: "knockback_core",  name: "Knockback Core",  desc: "Pushes enemies on hit",        category: "Shotgun", weapon: "shotgun", scrapCost: 0 },
  { id: "tight_spread",    name: "Tight Spread",    desc: "More focused cone",            category: "Shotgun", weapon: "shotgun", scrapCost: 0 },
  { id: "blast_core",      name: "Blast Core",      desc: "Small explosion on hit",       category: "Shotgun", weapon: "shotgun", scrapCost: 10 },

  // SMG unlocked (5)
  { id: "unlock_smg",      name: "Unlock Vector SMG", desc: "Adds Vector SMG to loadout",   category: "SMG",   weapon: "smg",     scrapCost: 0, isUnlock: true },
  { id: "overdrive",       name: "Overdrive",       desc: "Fire rate ramps while shooting", category: "SMG",   weapon: "smg",     scrapCost: 0 },
  { id: "stabilizer",      name: "Stabilizer",      desc: "Reduce spread by 30%",         category: "SMG",    weapon: "smg",     scrapCost: 0 },
  { id: "shredder",        name: "Shredder",        desc: "Damage increases per hit on same target", category: "SMG", weapon: "smg", scrapCost: 0 },
  { id: "spray_boost",     name: "Spray Boost",     desc: "Wider spread but more bullets", category: "SMG",   weapon: "smg",     scrapCost: 0 },

  // GLOBAL (3)
  { id: "speed_boost",     name: "Speed Boost",     desc: "+15% movement speed",          category: "Global", weapon: null,      scrapCost: 0 },
  { id: "magnet_core",     name: "Magnet Core",     desc: "Increased pickup radius",      category: "Global", weapon: null,      scrapCost: 0 },
  { id: "vital_surge",     name: "Vital Surge",     desc: "Small heal on kill",           category: "Global", weapon: null,      scrapCost: 0 },

  // RARE (1)
  { id: "chain_reaction",  name: "Chain Reaction",  desc: "Enemies explode on death",     category: "Rare",   weapon: null,      scrapCost: 20 },
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

    // Combo-based bonuses (recalculated each frame)
    this.comboXpBonus = 0;         // multiplier: 0, 0.1, or 0.2
    this.comboDmgBonus = 0;        // multiplier: 0 or 0.1
  }

  // ── XP & Leveling ────────────────────────────────────────────

  /** Add XP. Returns true if a level-up was triggered. */
  addXp(amount) {
    if (this.levelUpActive || this.bossRewardActive) return false;
    this.xp += amount;
    if (this.xp >= this.xpMax) {
      this.xp -= this.xpMax;
      this.level += 1;
      return true;
    }
    return false;
  }

  /** Calculate XP earned from an enemy kill. */
  getXpFromKill(enemy) {
    let base = enemy.isBoss ? 40 : Math.ceil(enemy.config.score / 3);
    base = Math.max(3, Math.min(base, 30));
    return Math.round(base * (1 + this.comboXpBonus));
  }

  // ── Combo Bonuses ────────────────────────────────────────────

  updateComboBonuses(combo) {
    this.comboXpBonus = combo >= 25 ? 0.2 : combo >= 10 ? 0.1 : 0;
    this.comboDmgBonus = combo >= 25 ? 0.1 : 0;
  }

  // ── Scrap ────────────────────────────────────────────────────

  getScrapFromKill(enemy) {
    if (enemy.isBoss) return 20 + Math.floor(Math.random() * 11); // 20-30
    return Math.random() < 0.125 ? 1 : 0; // ~12.5% chance for 1 scrap
  }

  // ── Upgrade Selection Logic ──────────────────────────────────

  /** Build 3 upgrade cards for a level-up. */
  buildLevelUpCards() {
    return this._pickCards(false);
  }

  /** Build 3 upgrade cards for a boss reward (higher rare chance). */
  buildBossRewardCards() {
    return this._pickCards(true);
  }

  _pickCards(isBossReward) {
    const pool = this._getAvailableUpgrades();
    if (pool.length === 0) return [];

    const rarePool = pool.filter(u => u.category === "Rare");
    const normalPool = pool.filter(u => u.category !== "Rare");
    const cards = [];
    const usedIds = new Set();

    // Slot 3: ~10% rare chance (30% for boss reward)
    const rareChance = isBossReward ? 0.3 : 0.1;
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

  _getAvailableUpgrades() {
    return UPGRADES.filter(u => {
      // Already acquired?
      if (this.acquired.includes(u.id)) return false;
      // Weapon unlock card: only show if weapon is still locked
      if (u.isUnlock) {
        if (u.weapon === "shotgun" && this.weaponsUnlocked.shotgun) return false;
        if (u.weapon === "smg" && this.weaponsUnlocked.smg) return false;
        // Shotgun unlock available after level 2, SMG after level 4
        if (u.weapon === "shotgun" && this.level < 2) return false;
        if (u.weapon === "smg" && this.level < 4) return false;
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
    const def = UPGRADES.find(u => u.id === upgradeId);
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
      knockback: false,
      blastRadius: 0,
      overdriveRamp: 0,
      shredder: false,
    };

    const lowerName = weaponName.toLowerCase();

    // Pistol upgrades
    if (lowerName.includes("pistol")) {
      if (this.has("precision_core")) mods.critChance += 0.15;
      if (this.has("double_tap"))     mods.doubleTap = true;
      if (this.has("ricochet"))       mods.ricochet = true;
      if (this.has("high_caliber"))   mods.damageMultiplier += 0.25;
      if (this.has("rapid_trigger"))  mods.cooldownMultiplier *= 0.8;
      if (this.has("deadeye"))        mods.critMultiplier += 0.5;
    }

    // Shotgun upgrades
    if (lowerName.includes("scatter") || lowerName.includes("shotgun")) {
      if (this.has("dense_shells"))   mods.pelletBonus += 2;
      if (this.has("knockback_core")) mods.knockback = true;
      if (this.has("tight_spread"))   mods.spreadMultiplier *= 0.65;
      if (this.has("blast_core"))     mods.blastRadius = 45;
    }

    // SMG upgrades
    if (lowerName.includes("vector") || lowerName.includes("smg")) {
      if (this.has("overdrive"))      mods.overdriveRamp = this.overdriveRamp;
      if (this.has("stabilizer"))     mods.spreadMultiplier *= 0.7;
      if (this.has("shredder"))       mods.shredder = true;
      if (this.has("spray_boost")) {
        mods.spreadMultiplier *= 1.35;
        mods.pelletBonus += 2;
      }
    }

    return mods;
  }

  /** Get movement speed multiplier. */
  getSpeedMultiplier() {
    let mult = 1;
    if (this.has("speed_boost")) mult += 0.15;
    return mult;
  }

  /** Get pickup radius multiplier. */
  getPickupRadiusMultiplier() {
    return this.has("magnet_core") ? 2.5 : 1;
  }

  /** Vital Surge: heal amount on kill (0 if not acquired). */
  getHealOnKill() {
    return this.has("vital_surge") ? 4 : 0;
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
    return Math.min(stacks * 0.08, 0.6); // +8% per hit, cap 60%
  }

  addShredderStack(enemyId) {
    if (!this.has("shredder")) return;
    const cur = this.shredderStacks.get(enemyId) || 0;
    this.shredderStacks.set(enemyId, cur + 1);
  }

  clearShredderStacks(enemyId) {
    this.shredderStacks.delete(enemyId);
  }

  // ── Grouped upgrades for display ─────────────────────────────

  getAcquiredGrouped() {
    const groups = { Pistol: [], Shotgun: [], SMG: [], Global: [], Rare: [] };
    for (const id of this.acquired) {
      const def = UPGRADES.find(u => u.id === id);
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

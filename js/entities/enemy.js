import { FiniteStateMachine } from "../ai/fsm.js";
import { Bullet } from "./bullet.js";
import {
  clamp,
  distanceBetween,
  keepCircleInBounds,
  normalize,
  pointInRect,
  randomRange,
} from "../systems/collision.js";
import { renderZombieParts } from "./zombie-renderer.js";

// Boss type definitions — milestone-wave enemies with extreme stats
// attackRange must exceed bossRadius + playerRadius (17) for melee to connect.
// noticeRange set very high so bosses never disengage.
const BOSS_TYPES = {
  juggernaut: {
    label: "Juggernaut",
    radius: 36,
    speed: 72,
    maxHealth: 600,
    damage: 35,
    attackRange: 95,
    attackWindup: 0.45,
    attackRecovery: 0.35,
    attackCooldown: 1.3,
    noticeRange: 1500,
    retreatThreshold: 0.0,
    retreatTime: [0, 0],
    retreatCooldown: 999,
    bodyColor: "#6e1818",
    accentColor: "#ff4040",
    eyeColor: "#ff8844",
    glowColor: "rgba(255,50,50,0.5)",
    tintFilter: "hue-rotate(-140deg) saturate(1.5) brightness(0.7)",
    score: 500,
    ranged: false,
    isBoss: true,
    bossGlowColor: "#ff3030",
    bossTitle: "THE JUGGERNAUT",
    slamRadius: 80,
  },
  broodmother: {
    label: "Brood Mother",
    radius: 30,
    speed: 55,
    maxHealth: 500,
    damage: 14,
    attackRange: 350,
    preferredDistance: 250,
    attackWindup: 0.5,
    attackRecovery: 0.3,
    attackCooldown: 0.9,
    noticeRange: 1500,
    retreatThreshold: 0.0,
    retreatTime: [0, 0],
    retreatCooldown: 999,
    bodyColor: "#2a6625",
    accentColor: "#55cc44",
    eyeColor: "#ccff88",
    glowColor: "rgba(80,200,60,0.5)",
    tintFilter: "hue-rotate(40deg) saturate(2.0) brightness(0.9)",
    score: 600,
    ranged: true,
    projectileSpeed: 480,
    isBoss: true,
    bossGlowColor: "#44ff22",
    bossTitle: "THE BROODMOTHER",
    burstCount: 5,
    burstSpread: 0.5,
    projectileColor: "#88ff44",
  },
  titan: {
    label: "Titan",
    radius: 42,
    speed: 90,
    maxHealth: 900,
    damage: 45,
    attackRange: 110,
    attackWindup: 0.4,
    attackRecovery: 0.3,
    attackCooldown: 1.1,
    noticeRange: 1500,
    retreatThreshold: 0.0,
    retreatTime: [0, 0],
    retreatCooldown: 999,
    bodyColor: "#3a1a4a",
    accentColor: "#8844cc",
    eyeColor: "#dd88ff",
    glowColor: "rgba(140,70,220,0.5)",
    tintFilter: "hue-rotate(180deg) saturate(1.8) brightness(0.75)",
    score: 800,
    ranged: false,
    isBoss: true,
    bossGlowColor: "#aa44ff",
    bossTitle: "THE TITAN",
    slamRadius: 100,
    shockwaveCount: 12,
    chaseAttackInterval: 2.0,
  },
};

export function getBossTypes() { return BOSS_TYPES; }

/**
 * Boss schedule — defines which boss appears at each milestone wave.
 * Entries beyond the schedule repeat the last entry with scaling.
 * Each entry has a `base` key into BOSS_TYPES and optional stat overrides.
 */
const BOSS_SCHEDULE = [
  // Boss #1 (wave 5) — intro melee
  { base: "juggernaut" },
  // Boss #2 (wave 10) — intro ranged
  { base: "broodmother" },
  // Boss #3 (wave 15) — AoE + shockwave
  { base: "titan" },
  // Boss #4 (wave 20) — evolved juggernaut
  { base: "juggernaut", bossTitle: "WARLORD GRIM", label: "Warlord Grim",
    speed: 88, damage: 42, maxHealth: 950, slamRadius: 100, attackCooldown: 1.0,
    radius: 40, score: 700, bodyColor: "#8a1010", accentColor: "#ff6644",
    bossGlowColor: "#ff5522" },
  // Boss #5 (wave 25) — evolved broodmother
  { base: "broodmother", bossTitle: "QUEEN VESPERA", label: "Queen Vespera",
    speed: 65, damage: 18, maxHealth: 850, burstCount: 8, burstSpread: 0.85,
    projectileSpeed: 540, attackCooldown: 0.7, radius: 34, score: 850,
    bodyColor: "#1a5520", accentColor: "#33ee22", bossGlowColor: "#22ff44" },
  // Boss #6 (wave 30) — evolved titan
  { base: "titan", bossTitle: "THE MONOLITH", label: "Monolith",
    speed: 100, damage: 55, maxHealth: 1500, slamRadius: 130,
    shockwaveCount: 16, attackCooldown: 0.85, radius: 48, score: 1100,
    bodyColor: "#2a0d3a", accentColor: "#aa55ee", bossGlowColor: "#bb44ff",
    chaseAttackInterval: 1.6, eyeColor: "#eeccff" },
  // Boss #7 (wave 35) — hybrid: ranged burst + melee slam + shockwave
  { base: "broodmother", bossTitle: "THE AMALGAM", label: "Amalgam",
    speed: 80, damage: 22, maxHealth: 1800, burstCount: 6, burstSpread: 0.7,
    projectileSpeed: 500, attackCooldown: 0.65, radius: 40, score: 1400,
    bodyColor: "#4a2010", accentColor: "#ff8833", bossGlowColor: "#ff6600",
    projectileColor: "#ffaa44", slamRadius: 90, shockwaveCount: 6,
    dualMode: true, eyeColor: "#ffcc66" },
  // Boss #8 (wave 40) — ultimate melee juggernaut
  { base: "titan", bossTitle: "OMEGA", label: "Omega",
    speed: 105, damage: 55, maxHealth: 2500, slamRadius: 140,
    shockwaveCount: 18, attackCooldown: 0.6, radius: 50, score: 2000,
    bodyColor: "#1a0a0a", accentColor: "#ff2222", bossGlowColor: "#ff1111",
    eyeColor: "#ff4444", chaseAttackInterval: 1.3 },
];

export function getBossSchedule() { return BOSS_SCHEDULE; }

/** Get merged boss config for the Nth boss occurrence (0-based). */
export function getBossConfigForOccurrence(n) {
  const idx = Math.min(n, BOSS_SCHEDULE.length - 1);
  const { base, ...overrides } = BOSS_SCHEDULE[idx];
  const config = { ...BOSS_TYPES[base], ...overrides };
  // Beyond-schedule: scale up the last archetype
  if (n >= BOSS_SCHEDULE.length) {
    const extra = n - BOSS_SCHEDULE.length + 1;
    config.maxHealth = Math.floor(config.maxHealth * (1 + extra * 0.25));
    config.damage = Math.floor(config.damage * (1 + extra * 0.15));
    config.speed = Math.floor(config.speed * (1 + extra * 0.05));
    config.score = Math.floor(config.score * (1 + extra * 0.2));
  }
  return config;
}

// Five enemy types for FSM AI variety — mutable so dev panel can hot-swap
let ENEMY_TYPES = {
  shambler: {
    label: "Shambler",
    radius: 16,
    speed: 84,
    maxHealth: 58,
    damage: 14,
    attackRange: 34,
    attackWindup: 0.42,
    attackRecovery: 0.28,
    attackCooldown: 1.05,
    noticeRange: 340,
    retreatThreshold: 0.18,
    retreatTime: [0.75, 1.1],
    retreatCooldown: 3.1,
    bodyColor: "#b84c3e",
    accentColor: "#ff9966",
    eyeColor: "#ffcc85",
    glowColor: "rgba(255,150,80,0.35)",
    tintFilter: "hue-rotate(-110deg) saturate(1.1)",
    score: 18,
    ranged: false,
  },
  sprinter: {
    label: "Sprinter",
    radius: 12,
    speed: 148,
    maxHealth: 36,
    damage: 10,
    attackRange: 28,
    attackWindup: 0.26,
    attackRecovery: 0.18,
    attackCooldown: 0.75,
    noticeRange: 400,
    retreatThreshold: 0.08,
    retreatTime: [0.45, 0.7],
    retreatCooldown: 2.2,
    bodyColor: "#d4783a",
    accentColor: "#ffa54e",
    eyeColor: "#ffe08e",
    glowColor: "rgba(255,200,100,0.35)",
    tintFilter: "hue-rotate(-80deg) saturate(1.3) brightness(1.1)",
    score: 22,
    ranged: false,
  },
  spitter: {
    label: "Spitter",
    radius: 14,
    speed: 76,
    maxHealth: 46,
    damage: 12,
    attackRange: 190,
    preferredDistance: 150,
    attackWindup: 0.6,
    attackRecovery: 0.28,
    attackCooldown: 1.45,
    noticeRange: 420,
    retreatThreshold: 0.74,
    retreatTime: [0.8, 1.2],
    retreatCooldown: 2.6,
    bodyColor: "#5aad58",
    accentColor: "#7bcf78",
    eyeColor: "#d2ffb9",
    glowColor: "rgba(120,210,100,0.4)",
    tintFilter: "saturate(1.5) brightness(1.05)",
    score: 28,
    ranged: true,
    projectileSpeed: 360,
  },
  brute: {
    label: "Brute",
    radius: 22,
    speed: 63,
    maxHealth: 118,
    damage: 22,
    attackRange: 44,
    attackWindup: 0.72,
    attackRecovery: 0.36,
    attackCooldown: 1.55,
    noticeRange: 360,
    retreatThreshold: 0.12,
    retreatTime: [0.55, 0.85],
    retreatCooldown: 3.4,
    bodyColor: "#7a3040",
    accentColor: "#cc5060",
    eyeColor: "#ffc49f",
    glowColor: "rgba(200,60,80,0.35)",
    tintFilter: "hue-rotate(-130deg) saturate(1.1) brightness(0.8)",
    score: 44,
    ranged: false,
  },
  screamer: {
    label: "Screamer",
    radius: 13,
    speed: 72,
    maxHealth: 40,
    damage: 8,
    attackRange: 160,
    preferredDistance: 130,
    attackWindup: 0.8,
    attackRecovery: 0.4,
    attackCooldown: 2.0,
    noticeRange: 410,
    retreatThreshold: 0.35,
    retreatTime: [0.9, 1.4],
    retreatCooldown: 2.8,
    bodyColor: "#8855aa",
    accentColor: "#bb88dd",
    eyeColor: "#eeccff",
    glowColor: "rgba(160,100,220,0.45)",
    tintFilter: "hue-rotate(160deg) saturate(1.4)",
    score: 34,
    ranged: true,
    projectileSpeed: 320,
    auraRadius: 120,
    buffSpeedMult: 1.2,
  },
};

/** Replace all enemy type configs at runtime (dev panel). */
export function setEnemyTypes(types) { ENEMY_TYPES = types; }
/** Return current enemy type configs (for export). */
export function getEnemyTypes() { return ENEMY_TYPES; }

let _enemyIdCounter = 0;

export class Enemy {
  constructor({ x, y, type, wave }) {
    this.id = ++_enemyIdCounter;
    this.type = type;
    this.config = ENEMY_TYPES[type] || BOSS_TYPES[type];
    this.x = x;
    this.y = y;
    this.wave = wave;
    this.radius = this.config.radius;
    this.maxHealth = this.config.maxHealth + wave * 3;
    this.health = this.maxHealth;
    this.speed = this.config.speed * (1 + wave * 0.018);
    this.noticeRange = this.config.noticeRange * (1 + wave * 0.012);
    this.attackCooldown = 0;
    this.damageFlash = 0;
    this.opacity = 1;
    this.stateLabel = "SPAWN";
    this.retreatTimer = 0;
    this.retreatCooldown = 0;
    this.wanderTimer = 0;
    this.wanderTarget = { x, y };
    this.deathTimer = 1.1;
    this.expired = false;
    this.hasDeathBurst = false;
    this.facing = 0;
    this.wobble = Math.random() * Math.PI * 2;
    this.wobbleRate = 4;
    this.strafeDir = Math.random() > 0.5 ? 1 : -1;
    this.perceivedPlayer = { x, y };
    this.driftAngle = Math.random() * Math.PI * 2;
    this.buffed = false;

    this.fsm = new FiniteStateMachine({
      owner: this,
      initialState: "SPAWN",
      states: this.buildStates(),
      anyTransitions: [
        {
          to: "DEAD",
          when: (owner, _ctx, machine) => owner.health <= 0 && machine.currentState !== "DEAD",
        },
      ],
    });
  }

  buildStates() {
    return {
      SPAWN: {
        enter: (owner) => {
          owner.stateLabel = "SPAWN";
          owner.spawnTimer = randomRange(0.45, 0.9);
          owner.opacity = 0.15;
        },
        update: (owner, context, delta) => {
          owner.spawnTimer -= delta;
          owner.opacity = clamp(1 - owner.spawnTimer / 0.9, 0.15, 1);
          owner.facePlayer(context.player);
        },
        transitions: [
          {
            to: "CHASE",
            when: (owner, ctx) =>
              owner.spawnTimer <= 0 && owner.distanceToPlayer(ctx.player) < owner.noticeRange,
          },
          { to: "WANDER", when: (owner) => owner.spawnTimer <= 0 },
        ],
      },

      WANDER: {
        enter: (owner, context) => {
          owner.stateLabel = "WANDER";
          owner.wanderTimer = randomRange(0.6, 1.3);
          owner.pickWanderTarget(context.bounds, context.obstacles);
        },
        update: (owner, context, delta) => {
          owner.wanderTimer -= delta;
          if (owner.wanderTimer <= 0 || owner.distanceTo(owner.wanderTarget) < 12) {
            owner.pickWanderTarget(context.bounds, context.obstacles);
            owner.wanderTimer = randomRange(0.6, 1.3);
          }
          owner.moveToward(owner.wanderTarget.x, owner.wanderTarget.y, owner.speed * 0.52, delta, context.bounds);
        },
        transitions: [
          {
            to: "CHASE",
            when: (owner, ctx) => owner.distanceToPlayer(ctx.player) < owner.noticeRange,
          },
          {
            to: "RETREAT",
            when: (owner, ctx) => owner.shouldRetreat(ctx.player),
          },
        ],
      },

      CHASE: {
        enter: (owner) => {
          owner.stateLabel = "CHASE";
        },
        update: (owner, context, delta) => {
          const pp = owner.perceivedPlayer;
          const dist = owner.distanceToPlayer(context.player);
          if (owner.config.ranged && dist < (owner.config.preferredDistance || 150) * 0.72) {
            owner.moveAway(pp.x, pp.y, owner.speed * 0.95, delta, context.bounds);
          } else if (owner.config.ranged && dist < owner.config.attackRange) {
            owner.strafe(context.player, owner.speed * 0.8, delta, context.bounds);
          } else {
            owner.moveToward(pp.x, pp.y, owner.speed, delta, context.bounds);
          }
          // Boss chase-attack: periodic ranged pressure while pursuing
          if (owner.config.isBoss && owner.config.chaseAttackInterval) {
            owner._chaseAttackTimer = (owner._chaseAttackTimer ?? owner.config.chaseAttackInterval) - delta;
            if (owner._chaseAttackTimer <= 0) {
              owner._chaseAttackTimer = owner.config.chaseAttackInterval;
              owner._performChaseAttack(context);
            }
          }
        },
        transitions: [
          {
            to: "ATTACK",
            when: (owner, ctx) =>
              owner.attackCooldown <= 0 && owner.distanceToPlayer(ctx.player) <= owner.config.attackRange,
          },
          { to: "RETREAT", when: (owner, ctx) => owner.shouldRetreat(ctx.player) },
          {
            to: "WANDER",
            when: (owner, ctx, machine) =>
              !owner.config.isBoss &&
              machine.stateTime > 1.3 &&
              owner.distanceToPlayer(ctx.player) > owner.noticeRange * 2.2,
          },
        ],
      },

      ATTACK: {
        enter: (owner) => {
          owner.stateLabel = "ATTACK";
          owner.attackWindup = owner.config.attackWindup;
          owner.attackRecovery = owner.config.attackRecovery;
          owner.attackPerformed = false;
        },
        update: (owner, context, delta) => {
          owner.facePlayer(context.player);
          if (!owner.attackPerformed) {
            owner.attackWindup -= delta;
            if (owner.attackWindup <= 0) {
              owner.performAttack(context);
              owner.attackPerformed = true;
            }
            return;
          }
          owner.attackRecovery -= delta;
          if (owner.config.ranged) {
            const pp = owner.perceivedPlayer;
            owner.moveAway(pp.x, pp.y, owner.speed * 0.75, delta, context.bounds);
          }
        },
        transitions: [
          {
            to: "RETREAT",
            when: (owner) => owner.attackPerformed && owner.attackRecovery <= 0 && owner.retreatTimer > 0,
          },
          {
            to: "CHASE",
            when: (owner, ctx) =>
              owner.attackPerformed &&
              owner.attackRecovery <= 0 &&
              owner.distanceToPlayer(ctx.player) <= owner.noticeRange * 1.8,
          },
          {
            to: "WANDER",
            when: (owner) => owner.attackPerformed && owner.attackRecovery <= 0,
          },
        ],
      },

      RETREAT: {
        enter: (owner) => {
          owner.stateLabel = "RETREAT";
          owner.retreatTimer = randomRange(owner.config.retreatTime[0], owner.config.retreatTime[1]);
          owner.retreatCooldown = owner.config.retreatCooldown;
        },
        update: (owner, context, delta) => {
          owner.retreatTimer -= delta;
          const pp = owner.perceivedPlayer;
          owner.moveAway(pp.x, pp.y, owner.speed * 1.05, delta, context.bounds);
        },
        transitions: [
          {
            to: "ATTACK",
            when: (owner, ctx) =>
              owner.retreatTimer <= 0 &&
              owner.attackCooldown <= 0 &&
              owner.distanceToPlayer(ctx.player) <= owner.config.attackRange,
          },
          {
            to: "CHASE",
            when: (owner, ctx) =>
              owner.retreatTimer <= 0 && owner.distanceToPlayer(ctx.player) <= owner.noticeRange,
          },
          { to: "WANDER", when: (owner) => owner.retreatTimer <= 0 },
        ],
      },

      DEAD: {
        enter: (owner, context) => {
          owner.stateLabel = "DEAD";
          owner.deathTimer = 1.8;
          if (!owner.hasDeathBurst) {
            owner.hasDeathBurst = true;
            // Massive body-color explosion
            context.spawnBurst(owner.x, owner.y, owner.config.bodyColor, 35, 60, 220);
            // Dark blood bursts — multi-layer
            context.spawnBurst(owner.x, owner.y, "#330808", 22, 25, 100);
            context.spawnBurst(owner.x, owner.y, "#6e0a0a", 16, 30, 130);
            context.spawnBurst(owner.x, owner.y, "#4a0000", 12, 20, 70);
            context.spawnBurst(owner.x, owner.y, "#8b1a1a", 8, 40, 150);
            // Splatter blood pools at multiple offset positions
            context.leaveBlood(owner.x, owner.y, owner.radius * 1.8);
            for (let i = 0; i < 3; i++) {
              context.leaveBlood(
                owner.x + (Math.random() - 0.5) * owner.radius * 1.6,
                owner.y + (Math.random() - 0.5) * owner.radius * 1.6,
                owner.radius * (0.5 + Math.random() * 0.6)
              );
            }
          }
        },
        update: (owner, _ctx, delta) => {
          owner.deathTimer -= delta;
          owner.opacity = clamp(owner.deathTimer / 1.8, 0, 0.8);
          if (owner.deathTimer <= 0) owner.expired = true;
        },
      },
    };
  }

  update(delta, context) {
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.damageFlash = Math.max(0, this.damageFlash - delta * 4);
    this.retreatCooldown = Math.max(0, this.retreatCooldown - delta);
    const targetWobbleRate = this.stateLabel === "CHASE" ? 8 : 4;
    this.wobbleRate += (targetWobbleRate - this.wobbleRate) * Math.min(1, delta * 3);
    this.wobble += delta * this.wobbleRate;

    // Wounded blood dripping — enemies below 55% HP leave heavy blood trails
    if (this.fsm.currentState !== "DEAD" && this.health / this.maxHealth < 0.55) {
      this.woundDripTimer = (this.woundDripTimer || 0) - delta;
      const severity = 1 - this.health / this.maxHealth; // 0.45 to 1.0
      const dripInterval = 0.08 + Math.random() * 0.12 * (1 - severity);
      if (this.woundDripTimer <= 0) {
        this.woundDripTimer = dripInterval;
        // Main drip pool
        context.leaveBlood(
          this.x + (Math.random() - 0.5) * this.radius * 0.8,
          this.y + (Math.random() - 0.5) * this.radius * 0.8,
          2 + Math.random() * 3.5 + severity * 2
        );
        // Extra splatter at low health
        if (severity > 0.6 && Math.random() < 0.4) {
          context.leaveBlood(
            this.x + (Math.random() - 0.5) * this.radius,
            this.y + (Math.random() - 0.5) * this.radius,
            1 + Math.random() * 2
          );
        }
        // Blood particle drips
        if (Math.random() < 0.3 + severity * 0.3) {
          context.spawnBurst(this.x, this.y, "#6e0a0a", 2 + Math.floor(Math.random() * 3), 10, 40);
        }
      }
    }

    // Screamer aura: buff nearby allies
    if (this.type === "screamer" && this.fsm.currentState !== "DEAD") {
      for (const enemy of context.enemies || []) {
        if (enemy === this || enemy.fsm.currentState === "DEAD") continue;
        if (distanceBetween(this.x, this.y, enemy.x, enemy.y) < (this.config.auraRadius || 120)) {
          enemy.buffed = true;
        }
      }
    }

    // Apply buff speed boost
    const speedMult = this.buffed ? 1.18 : 1;
    this._effectiveSpeed = this.speed * speedMult;
    this.buffed = false;
    const isChase = this.stateLabel === "CHASE";

    // Update perceived player position — lags behind real pos with random drift
    if (context.player) {
      // Tracking rate: sprinters react faster, shamblers are sluggish, bosses lock on
      const trackRate = this.config.isBoss ? 6.0
        : this.type === "sprinter" ? 4.5
        : this.type === "brute" ? 1.8
        : this.type === "screamer" ? 3.2
        : this.type === "spitter" ? 2.8
        : 2.2; // shambler
      const lerpT = Math.min(1, trackRate * delta);
      // Slowly wander the drift offset so zombies don't perfectly converge
      // Bosses have minimal drift so they aim precisely
      this.driftAngle += delta * (0.5 + Math.sin(this.wobble * 0.7) * 0.3);
      const driftR = this.config.isBoss ? this.config.radius * 0.25 : this.config.radius * 1.2;
      const driftX = Math.cos(this.driftAngle) * driftR;
      const driftY = Math.sin(this.driftAngle) * driftR;
      this.perceivedPlayer.x += ((context.player.x + driftX) - this.perceivedPlayer.x) * lerpT;
      this.perceivedPlayer.y += ((context.player.y + driftY) - this.perceivedPlayer.y) * lerpT;
    }

    this.fsm.update(delta, context);

    // Smooth facing interpolation (angular lerp with wrapping)
    if (this._faceTarget !== undefined) {
      let diff = this._faceTarget - this.facing;
      // Wrap to [-PI, PI]
      diff = ((diff + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const turnSpeed = isChase ? 8 : 5; // rad/s
      const step = turnSpeed * delta;
      if (Math.abs(diff) < step) {
        this.facing = this._faceTarget;
      } else {
        this.facing += Math.sign(diff) * step;
      }
      // Keep facing in [-PI, PI]
      this.facing = ((this.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    }
  }

  takeDamage(amount) {
    if (this.fsm.currentState === "DEAD") return { hit: false, killed: false };
    const wasAlive = this.health > 0;
    this.health -= amount;
    this.damageFlash = 1;
    return { hit: true, killed: wasAlive && this.health <= 0 };
  }

  shouldRetreat(player) {
    if (this.config.isBoss) return false;
    return (
      this.retreatCooldown <= 0 &&
      this.health / this.maxHealth <= this.config.retreatThreshold &&
      this.distanceToPlayer(player) < this.noticeRange
    );
  }

  distanceTo(target) {
    return distanceBetween(this.x, this.y, target.x, target.y);
  }

  distanceToPlayer(player) {
    return distanceBetween(this.x, this.y, player.x, player.y);
  }

  facePlayer(player) {
    this._faceTarget = Math.atan2(player.y - this.y, player.x - this.x);
  }

  pickWanderTarget(bounds, obstacles) {
    const m = 56;
    for (let attempt = 0; attempt < 10; attempt++) {
      const tx = randomRange(m, bounds.width - m);
      const ty = randomRange(m, bounds.height - m);
      let blocked = false;
      if (obstacles) {
        for (const obs of obstacles) {
          let px = tx, py = ty;
          if (obs.rot) {
            const cos = Math.cos(-obs.rot), sin = Math.sin(-obs.rot);
            const ddx = tx - obs.cx, ddy = ty - obs.cy;
            px = obs.cx + ddx * cos - ddy * sin;
            py = obs.cy + ddx * sin + ddy * cos;
          }
          if (pointInRect(px, py, obs)) { blocked = true; break; }
        }
      }
      if (!blocked) {
        this.wanderTarget = { x: tx, y: ty };
        return;
      }
    }
    this.wanderTarget = {
      x: randomRange(m, bounds.width - m),
      y: randomRange(m, bounds.height - m),
    };
  }

  getSpeed() {
    return this._effectiveSpeed || this.speed;
  }

  moveToward(targetX, targetY, speed, delta, bounds) {
    const d = normalize(targetX - this.x, targetY - this.y);
    const s = this.buffed ? speed * 1.18 : speed;
    this.x += d.x * s * delta;
    this.y += d.y * s * delta;
    this.facePoint(targetX, targetY);
    keepCircleInBounds(this, bounds);
  }

  moveAway(targetX, targetY, speed, delta, bounds) {
    const d = normalize(this.x - targetX, this.y - targetY);
    const s = this.buffed ? speed * 1.18 : speed;
    this.x += d.x * s * delta;
    this.y += d.y * s * delta;
    this.facePoint(targetX, targetY);
    keepCircleInBounds(this, bounds);
  }

  strafe(player, speed, delta, bounds) {
    const away = normalize(this.x - player.x, this.y - player.y);
    // Occasionally flip strafe direction for unpredictability
    if (Math.random() < delta * 0.4) this.strafeDir *= -1;
    this.x += (-away.y * this.strafeDir + away.x * 0.25) * speed * delta;
    this.y += (away.x * this.strafeDir + away.y * 0.25) * speed * delta;
    this.facePlayer(player);
    keepCircleInBounds(this, bounds);
  }

  facePoint(tx, ty) {
    this._faceTarget = Math.atan2(ty - this.y, tx - this.x);
  }

  performAttack(context) {
    this.attackCooldown = this.config.attackCooldown;

    if (this.shouldRetreat(context.player)) {
      this.retreatTimer = randomRange(this.config.retreatTime[0], this.config.retreatTime[1]);
    } else {
      this.retreatTimer = 0;
    }

    // Boss-specific enhanced attacks
    if (this.config.isBoss) {
      this._performBossAttack(context);
      return;
    }

    if (this.config.ranged) {
      const leadX = context.player.x + context.player.vx * 0.15;
      const leadY = context.player.y + context.player.vy * 0.15;
      const d = normalize(leadX - this.x, leadY - this.y);
      const pColor = this.type === "screamer" ? "#cc88ff" : "#a7ff7c";
      const projectile = new Bullet({
        x: this.x + d.x * (this.radius + 6),
        y: this.y + d.y * (this.radius + 6),
        vx: d.x * this.config.projectileSpeed,
        vy: d.y * this.config.projectileSpeed,
        radius: 7,
        damage: this.config.damage,
        life: 1.6,
        color: pColor,
        friendly: false,
      });
      context.spawnEnemyProjectile(projectile);
      context.spawnBurst(this.x, this.y, pColor, 6, 20, 60);
      return;
    }

    if (this.distanceToPlayer(context.player) <= this.config.attackRange + context.player.radius + 4) {
      context.damagePlayer(this.config.damage);
      // Skin/flesh spray
      context.spawnBurst(context.player.x, context.player.y, "#ffd1b0", 16, 30, 120);
      context.spawnBurst(context.player.x, context.player.y, "#e8b090", 8, 20, 80);
      // Blood spray
      context.spawnBurst(context.player.x, context.player.y, "#8b0000", 14, 25, 100);
      context.spawnBurst(context.player.x, context.player.y, "#4a0000", 6, 15, 60);
      // Blood pools at impact
      context.leaveBlood(context.player.x, context.player.y, 8 + Math.random() * 8);
      context.leaveBlood(
        context.player.x + (Math.random() - 0.5) * 16,
        context.player.y + (Math.random() - 0.5) * 16,
        4 + Math.random() * 5
      );
    }
  }

  _performBossAttack(context) {
    const player = context.player;

    // --- Dual-mode boss: fires burst AND does AoE slam ---
    if (this.config.dualMode) {
      this._fireBurst(context, player);
      // AoE slam if close
      const slamR = this.config.slamRadius || this.radius * 2;
      if (this.distanceToPlayer(player) <= slamR + player.radius) {
        context.damagePlayer(this.config.damage);
        context.spawnBurst(player.x, player.y, "#ffd1b0", 22, 40, 160);
        context.spawnBurst(player.x, player.y, "#8b0000", 18, 30, 130);
        context.leaveBlood(player.x, player.y, 10 + Math.random() * 12);
      }
      context.addScreenShake(12);
      context.spawnBurst(this.x, this.y, this.config.accentColor, 24, 50, 180);
      if (this.config.shockwaveCount) this._fireShockwave(context);
      return;
    }

    if (this.config.ranged) {
      this._fireBurst(context, player);
      return;
    }

    // --- Melee boss: ground slam AoE ---
    const slamRadius = this.config.slamRadius || this.radius * 2;
    if (this.distanceToPlayer(player) <= slamRadius + player.radius) {
      context.damagePlayer(this.config.damage);
      context.spawnBurst(player.x, player.y, "#ffd1b0", 22, 40, 160);
      context.spawnBurst(player.x, player.y, "#8b0000", 18, 30, 130);
      context.leaveBlood(player.x, player.y, 10 + Math.random() * 12);
    }
    // Ground-pound impact — always visible/felt
    context.addScreenShake(12);
    context.spawnBurst(this.x, this.y, this.config.accentColor, 28, 60, 220);
    context.spawnBurst(this.x, this.y, "#443322", 18, 35, 140);
    // Rage aura when low HP
    if (this.health / this.maxHealth < 0.3) {
      context.spawnBurst(this.x, this.y, "#ff2200", 14, 30, 120);
    }
    if (this.config.shockwaveCount) this._fireShockwave(context);
  }

  /** Ranged burst fire pattern (used by ranged + dual bosses). */
  _fireBurst(context, player) {
    const burstCount = this.config.burstCount || 3;
    const burstSpread = this.config.burstSpread || 0.4;
    const leadX = player.x + (player.vx || 0) * 0.3;
    const leadY = player.y + (player.vy || 0) * 0.3;
    const baseAngle = Math.atan2(leadY - this.y, leadX - this.x);
    const pColor = this.config.projectileColor || "#a7ff7c";
    const pSpeed = this.config.projectileSpeed;
    for (let i = 0; i < burstCount; i++) {
      const offset = burstCount > 1 ? ((i / (burstCount - 1)) - 0.5) * burstSpread : 0;
      const jitter = (Math.random() - 0.5) * 0.08;
      const angle = baseAngle + offset + jitter;
      context.spawnEnemyProjectile(new Bullet({
        x: this.x + Math.cos(angle) * (this.radius + 8),
        y: this.y + Math.sin(angle) * (this.radius + 8),
        vx: Math.cos(angle) * pSpeed,
        vy: Math.sin(angle) * pSpeed,
        radius: 8,
        damage: this.config.damage,
        life: 2.5,
        color: pColor,
        friendly: false,
      }));
    }
    context.spawnBurst(this.x, this.y, pColor, 14, 30, 90);
  }

  /** Fire radial shockwave ring of projectiles. */
  _fireShockwave(context) {
    const count = this.config.shockwaveCount;
    const waveColor = this.config.bossGlowColor || "#aa44ff";
    const speed = 280;
    const ringOffset = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + ringOffset;
      const altRadius = i % 2 === 0 ? 6 : 5;
      context.spawnEnemyProjectile(new Bullet({
        x: this.x + Math.cos(angle) * (this.radius + 6),
        y: this.y + Math.sin(angle) * (this.radius + 6),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: altRadius,
        damage: Math.floor(this.config.damage * 0.3),
        life: 1.4,
        color: waveColor,
        friendly: false,
      }));
    }
  }

  /** Periodic ranged pressure while chasing (boss-only). */
  _performChaseAttack(context) {
    const count = this.config.shockwaveCount || 8;
    const waveColor = this.config.bossGlowColor || "#aa44ff";
    const speed = 260;
    const dist = this.distanceToPlayer(context.player);
    const aimAngle = Math.atan2(context.player.y - this.y, context.player.x - this.x);
    // Close: focused half-ring toward player; Far: full 360 ring
    const focused = dist < 200;
    const startAngle = focused ? aimAngle - Math.PI * 0.5 : 0;
    const arcSpan = focused ? Math.PI : Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = startAngle + (i / count) * arcSpan + Math.random() * 0.1;
      context.spawnEnemyProjectile(new Bullet({
        x: this.x + Math.cos(angle) * (this.radius + 6),
        y: this.y + Math.sin(angle) * (this.radius + 6),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 5,
        damage: Math.floor(this.config.damage * 0.2),
        life: 1.3,
        color: waveColor,
        friendly: false,
      }));
    }
    context.spawnBurst(this.x, this.y, this.config.accentColor, 14, 35, 130);
  }

  render(ctx) {
    if (this.expired) return;

    const healthRatio = clamp(this.health / this.maxHealth, 0, 1);
    const isFlash = this.damageFlash > 0;
    const c = this.config;
    const t = performance.now() * 0.001;

    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.translate(this.x, this.y);

    // Drop shadow — follows body sway, bob and facing for a grounded look
    {
      const w = this.wobble;
      const isDead = this.stateLabel === "DEAD";
      const isChasing = this.stateLabel === "CHASE";

      // Mirror the sway/bob from the zombie renderer
      const swayAmp = isDead ? 0 : isChasing ? 0.06 : 0.035;
      const sway = Math.sin(w * 0.5) * swayAmp;
      const bobScale = this.radius / 16;
      const bob = isDead ? 0 : Math.sin(w * 1.4) * 1.2 * bobScale;
      const jx = isDead ? 0 : Math.sin(w * 7.1) * 0.3;

      // Shadow shifts laterally with sway and slightly with facing
      const bodyAngle = this.facing + Math.PI / 2 + sway;
      const shadowOffX = 2 + Math.sin(bodyAngle) * this.radius * 0.12 + jx * 0.5;
      const shadowOffY = this.radius + 6 - bob * 0.4;

      // Shadow stretches when moving (chasing) and compresses with bob
      const stretchX = this.radius * (isChasing ? 0.95 : 0.88) + Math.abs(Math.sin(w * 0.5)) * 1.5;
      const stretchY = this.radius * 0.38 + bob * 0.08;

      // Slight rotation to match body lean
      ctx.save();
      ctx.translate(shadowOffX, shadowOffY);
      ctx.rotate(sway * 0.5);
      ctx.fillStyle = "rgba(0,0,0,0.24)";
      ctx.beginPath();
      ctx.ellipse(0, 0, stretchX, stretchY, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // State-specific effects
    if (this.stateLabel === "SPAWN") {
      const pulse = 0.5 + Math.sin(t * 8) * 0.3;
      ctx.strokeStyle = `rgba(255,200,140,${pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 12 + Math.sin(t * 6) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.stateLabel === "ATTACK" && !this.attackPerformed) {
      const windupProgress = 1 - (this.attackWindup / c.attackWindup);
      ctx.strokeStyle = `rgba(255,60,40,${0.2 + windupProgress * 0.5})`;
      ctx.lineWidth = 2 + windupProgress * 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 4 + windupProgress * 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.stateLabel === "RETREAT") {
      ctx.strokeStyle = "rgba(100,180,255,0.2)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Screamer aura
    if (this.type === "screamer" && this.stateLabel !== "DEAD") {
      const auraR = this.config.auraRadius || 120;
      const pulse = 0.08 + Math.sin(t * 3) * 0.04;
      const auraGrad = ctx.createRadialGradient(0, 0, this.radius, 0, 0, auraR);
      auraGrad.addColorStop(0, `rgba(160,100,220,${pulse})`);
      auraGrad.addColorStop(1, "rgba(160,100,220,0)");
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(0, 0, auraR, 0, Math.PI * 2);
      ctx.fill();
    }

    // Buff glow indicator
    if (this.buffed) {
      ctx.strokeStyle = "rgba(200,140,255,0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Boss aura and ground effect
    if (c.isBoss && this.stateLabel !== "DEAD") {
      const pulse = 0.5 + Math.sin(t * 2.5) * 0.25;

      // Parse boss glow hex to rgba helper
      const gc = c.bossGlowColor || "#ff3030";
      const r = parseInt(gc.slice(1, 3), 16);
      const g = parseInt(gc.slice(3, 5), 16);
      const b = parseInt(gc.slice(5, 7), 16);
      const rgba = (a) => `rgba(${r},${g},${b},${a})`;

      // Outer menacing aura — double-layered
      const aura1 = ctx.createRadialGradient(0, 0, this.radius * 0.8, 0, 0, this.radius * 3.5);
      aura1.addColorStop(0, rgba(0.25 * pulse));
      aura1.addColorStop(0.5, rgba(0.08 * pulse));
      aura1.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = aura1;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 3.5, 0, Math.PI * 2);
      ctx.fill();

      // Inner pulsing ring
      ctx.strokeStyle = rgba(0.4 + pulse * 0.3);
      ctx.lineWidth = 2.5 + Math.sin(t * 4) * 1;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 6 + Math.sin(t * 3) * 3, 0, Math.PI * 2);
      ctx.stroke();

      // Orbiting danger particles
      for (let i = 0; i < 4; i++) {
        const a = t * 1.8 + (i * Math.PI * 2) / 4;
        const orbitR = this.radius + 12 + Math.sin(t * 2 + i) * 4;
        const px = Math.cos(a) * orbitR;
        const py = Math.sin(a) * orbitR;
        const pAlpha = 0.5 + Math.sin(t * 5 + i * 1.2) * 0.3;
        ctx.fillStyle = rgba(pAlpha);
        ctx.beginPath();
        ctx.arc(px, py, 2.5 + Math.sin(t * 3 + i) * 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Zombie body — PNG parts with procedural animation
    if (!renderZombieParts(ctx, this)) {
      // Fallback: simple coloured circle when images haven't loaded
      ctx.fillStyle = isFlash ? "#fff0df" : c.bodyColor;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Health bar above (skip for bosses — they get a top-screen bar)
    ctx.shadowBlur = 0;
    if (healthRatio < 1 && this.stateLabel !== "DEAD" && !c.isBoss) {
      const barW = this.radius * 2.2;
      const barH = 3;
      const barY = -this.radius - 10;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(-barW / 2, barY, barW, barH);
      const hpColor = healthRatio > 0.5 ? "#6c6" : healthRatio > 0.25 ? "#cc6" : "#c44";
      ctx.fillStyle = hpColor;
      ctx.fillRect(-barW / 2, barY, barW * healthRatio, barH);
    }

    ctx.restore();
  }
}

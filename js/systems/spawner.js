import { Enemy, getBossSchedule, getBossConfigForOccurrence } from "../entities/enemy.js";
import { randomRange } from "./collision.js";

const DEFAULT_WAVE_CONFIG = {
  baseCount: 5,
  perWave: 3,
  bonusEvery: 2,
  maxEnemies: 45,
  spawnDelay: [0.15, 0.38],
  bossInterval: 5,
  defaultType: "shambler",
  typeThresholds: [
    { type: "screamer", minWave: 6, threshold: 0.90 },
    { type: "brute",    minWave: 4, threshold: 0.82 },
    { type: "screamer", minWave: 4, threshold: 0.80 },
    { type: "spitter",  minWave: 2, threshold: 0.52 },
    { type: "sprinter", minWave: 1, threshold: 0.28 },
  ],
};

export class WaveSpawner {
  constructor() {
    this.config = { ...DEFAULT_WAVE_CONFIG };
    this.reset();
  }

  setConfig(cfg) {
    this.config = { ...DEFAULT_WAVE_CONFIG, ...cfg };
  }
  getConfig() { return this.config; }

  reset() {
    this.wave = 0;
    this.queue = [];
    this.spawnTimer = 0;
    this.bossActive = false;
    this.bossSpawned = false;
    this.pendingBoss = null;  // deferred boss entry — spawns when few enemies remain
  }

  /** Returns true if the given wave number is a boss wave. */
  isBossWave(wave) {
    return this.config.bossInterval > 0 && wave % this.config.bossInterval === 0;
  }

  /** Get the boss type key for a given wave (uses boss schedule). */
  getBossTypeForWave(wave) {
    const schedule = getBossSchedule();
    const bossIndex = Math.floor(wave / this.config.bossInterval) - 1;
    const idx = Math.min(bossIndex, schedule.length - 1);
    return schedule[idx].base;
  }

  /** How many waves until the next boss (0 = this is a boss wave). */
  wavesUntilBoss() {
    if (this.config.bossInterval <= 0) return Infinity;
    const next = this.config.bossInterval - (this.wave % this.config.bossInterval);
    return next === this.config.bossInterval ? 0 : next;
  }

  /** Get the type key of the next upcoming boss. */
  nextBossType() {
    const remaining = this.wavesUntilBoss();
    const nextBossWave = remaining === 0 ? this.wave : this.wave + remaining;
    return this.getBossTypeForWave(nextBossWave);
  }

  /** Get the config object for the next boss. */
  nextBossConfig() {
    const remaining = this.wavesUntilBoss();
    const nextBossWave = remaining === 0 ? this.wave : this.wave + remaining;
    const bossIndex = Math.floor(nextBossWave / this.config.bossInterval) - 1;
    return getBossConfigForOccurrence(bossIndex);
  }

  startWave(bounds, spawnZones = []) {
    this.wave += 1;
    this.spawnZones = spawnZones;
    this.bossActive = this.isBossWave(this.wave);
    this.bossSpawned = false;
    this.pendingBoss = null;
    this.queue = this.buildWave(this.wave, bounds);
    this.spawnTimer = 0.2;
  }

  buildWave(wave, bounds) {
    const c = this.config;
    const baseCount = c.baseCount + wave * c.perWave + Math.floor(wave / c.bonusEvery);
    const zombieCount = Math.min(baseCount, c.maxEnemies);
    const queue = [];

    for (let i = 0; i < zombieCount; i++) {
      queue.push({
        type: this.pickType(wave),
        delay: randomRange(c.spawnDelay[0], c.spawnDelay[1]),
        ...this.pickSpawnPoint(bounds),
      });
    }

    // Early encounter spike — wave 3 gets a fast sprinter rush mid-wave
    if (wave === 3) {
      const insertAt = Math.floor(queue.length * 0.4);
      for (let i = 0; i < 4; i++) {
        queue.splice(insertAt + i, 0, {
          type: "sprinter",
          delay: 0.08,  // rapid burst
          ...this.pickSpawnPoint(bounds),
        });
      }
    }

    // Boss spawn on milestone waves — deferred until few enemies remain
    if (this.isBossWave(wave)) {
      const bossKey = this.getBossTypeForWave(wave);
      const bossIndex = Math.floor(wave / this.config.bossInterval) - 1;
      const bossConfig = getBossConfigForOccurrence(bossIndex);
      if (bossConfig) {
        this.pendingBoss = {
          type: bossKey,
          delay: 0,
          isBoss: true,
          bossConfig,
          ...this.pickSpawnPoint(bounds),
        };
      }
    }

    return queue;
  }

  pickType(wave) {
    const roll = Math.random();
    for (const t of this.config.typeThresholds) {
      if (wave >= t.minWave && roll > t.threshold) return t.type;
    }
    return this.config.defaultType;
  }

  pickSpawnPoint(bounds) {
    // Use a random spawn zone rectangle if any are defined
    if (this.spawnZones && this.spawnZones.length > 0) {
      const zone = this.spawnZones[Math.floor(Math.random() * this.spawnZones.length)];
      const pad = 6;
      return {
        x: zone.x + pad + Math.random() * Math.max(0, zone.w - pad * 2),
        y: zone.y + pad + Math.random() * Math.max(0, zone.h - pad * 2),
      };
    }
    // Fallback: edge spawn
    const side = Math.floor(Math.random() * 4);
    const p = 30;
    if (side === 0) return { x: randomRange(p, bounds.width - p), y: p };
    if (side === 1) return { x: bounds.width - p, y: randomRange(p, bounds.height - p) };
    if (side === 2) return { x: randomRange(p, bounds.width - p), y: bounds.height - p };
    return { x: p, y: randomRange(p, bounds.height - p) };
  }

  update(delta) {
    const spawned = [];
    if (this.queue.length === 0) return spawned;

    this.spawnTimer -= delta;
    while (this.spawnTimer <= 0 && this.queue.length > 0) {
      const next = this.queue.shift();
      const enemy = new Enemy({ x: next.x, y: next.y, type: next.type, wave: this.wave });

      // Apply boss stats from BOSS_TYPES if this is a boss spawn
      if (next.isBoss && next.bossConfig) {
        const bc = next.bossConfig;
        // Override with boss config (scaled by wave)
        enemy.config = { ...bc };
        enemy.radius = bc.radius;
        enemy.maxHealth = bc.maxHealth + this.wave * 12;
        enemy.health = enemy.maxHealth;
        enemy.speed = bc.speed * (1 + this.wave * 0.012);
        enemy.noticeRange = bc.noticeRange * (1 + this.wave * 0.012);
        enemy.isBoss = true;
        this.bossSpawned = true;
      }

      spawned.push(enemy);
      this.spawnTimer += next.delay;
    }
    return spawned;
  }

  /** Try to spawn the deferred boss when active enemies are low enough. */
  trySpawnBoss(activeEnemyCount) {
    if (!this.pendingBoss || this.bossSpawned) return null;
    // Spawn boss when queue is empty and <=5 normal enemies remain
    if (this.queue.length > 0 || activeEnemyCount > 5) return null;

    const next = this.pendingBoss;
    this.pendingBoss = null;
    const enemy = new Enemy({ x: next.x, y: next.y, type: next.type, wave: this.wave });
    const bc = next.bossConfig;
    enemy.config = { ...bc };
    enemy.radius = bc.radius;
    enemy.maxHealth = bc.maxHealth + this.wave * 12;
    enemy.health = enemy.maxHealth;
    enemy.speed = bc.speed * (1 + this.wave * 0.012);
    enemy.noticeRange = bc.noticeRange * (1 + this.wave * 0.012);
    enemy.isBoss = true;
    this.bossSpawned = true;
    return enemy;
  }

  get remaining() {
    return this.queue.length + (this.pendingBoss && !this.bossSpawned ? 1 : 0);
  }
}

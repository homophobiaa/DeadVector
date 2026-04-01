import { Enemy } from "../entities/enemy.js";
import { randomRange } from "./collision.js";

const DEFAULT_WAVE_CONFIG = {
  baseCount: 5,
  perWave: 2,
  bonusEvery: 2,
  maxEnemies: 40,
  spawnDelay: [0.2, 0.45],
  bossInterval: 5,
  bossType: "brute",
  defaultType: "shambler",
  typeThresholds: [
    { type: "screamer", minWave: 7, threshold: 0.92 },
    { type: "brute",    minWave: 5, threshold: 0.85 },
    { type: "screamer", minWave: 4, threshold: 0.82 },
    { type: "spitter",  minWave: 3, threshold: 0.58 },
    { type: "sprinter", minWave: 2, threshold: 0.32 },
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
  }

  startWave(bounds, spawnZones = []) {
    this.wave += 1;
    this.spawnZones = spawnZones;
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

    // Boss-tier every N waves
    if (c.bossInterval > 0 && wave % c.bossInterval === 0) {
      for (let i = 0; i < Math.ceil(wave / c.bossInterval); i++) {
        queue.push({
          type: c.bossType,
          delay: 0.1,
          ...this.pickSpawnPoint(bounds),
        });
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
      spawned.push(new Enemy({ x: next.x, y: next.y, type: next.type, wave: this.wave }));
      this.spawnTimer += next.delay;
    }
    return spawned;
  }

  get remaining() {
    return this.queue.length;
  }
}

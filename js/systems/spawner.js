import { Enemy } from "../entities/enemy.js";
import { randomRange } from "./collision.js";

export class WaveSpawner {
  constructor() {
    this.reset();
  }

  reset() {
    this.wave = 0;
    this.queue = [];
    this.spawnTimer = 0;
  }

  startWave(bounds) {
    this.wave += 1;
    this.queue = this.buildWave(this.wave, bounds);
    this.spawnTimer = 0.2;
  }

  buildWave(wave, bounds) {
    const baseCount = 5 + wave * 2 + Math.floor(wave / 2);
    const zombieCount = Math.min(baseCount, 40);
    const queue = [];

    for (let i = 0; i < zombieCount; i++) {
      queue.push({
        type: this.pickType(wave),
        delay: randomRange(0.2, 0.45),
        ...this.pickSpawnPoint(bounds),
      });
    }

    // Boss-tier brute every 5 waves
    if (wave % 5 === 0) {
      for (let i = 0; i < Math.ceil(wave / 5); i++) {
        queue.push({
          type: "brute",
          delay: 0.1,
          ...this.pickSpawnPoint(bounds),
        });
      }
    }

    return queue;
  }

  pickType(wave) {
    const roll = Math.random();

    if (wave >= 7 && roll > 0.92) return "screamer";
    if (wave >= 5 && roll > 0.85) return "brute";
    if (wave >= 4 && roll > 0.82) return "screamer";
    if (wave >= 3 && roll > 0.58) return "spitter";
    if (wave >= 2 && roll > 0.32) return "sprinter";
    return "shambler";
  }

  pickSpawnPoint(bounds) {
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

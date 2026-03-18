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
    const zombieCount = 5 + wave * 2 + Math.floor(wave / 2);
    const queue = [];

    for (let index = 0; index < zombieCount; index += 1) {
      queue.push({
        type: this.pickType(wave),
        delay: randomRange(0.24, 0.42),
        ...this.pickSpawnPoint(bounds),
      });
    }

    return queue;
  }

  pickType(wave) {
    const roll = Math.random();

    if (wave >= 5 && roll > 0.9) {
      return "brute";
    }

    if (wave >= 3 && roll > 0.62) {
      return "spitter";
    }

    if (wave >= 2 && roll > 0.36) {
      return "sprinter";
    }

    return "shambler";
  }

  pickSpawnPoint(bounds) {
    const side = Math.floor(Math.random() * 4);
    const padding = 30;

    if (side === 0) {
      return { x: randomRange(padding, bounds.width - padding), y: padding };
    }

    if (side === 1) {
      return { x: bounds.width - padding, y: randomRange(padding, bounds.height - padding) };
    }

    if (side === 2) {
      return { x: randomRange(padding, bounds.width - padding), y: bounds.height - padding };
    }

    return { x: padding, y: randomRange(padding, bounds.height - padding) };
  }

  update(delta) {
    const spawned = [];

    if (this.queue.length === 0) {
      return spawned;
    }

    this.spawnTimer -= delta;

    while (this.spawnTimer <= 0 && this.queue.length > 0) {
      const nextSpawn = this.queue.shift();
      spawned.push(new Enemy({ x: nextSpawn.x, y: nextSpawn.y, type: nextSpawn.type, wave: this.wave }));
      this.spawnTimer += nextSpawn.delay;
    }

    return spawned;
  }

  get remaining() {
    return this.queue.length;
  }
}

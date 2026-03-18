import { Player } from "./entities/player.js";
import { circlesOverlap, clamp, keepCircleInBounds, separateCircles } from "./systems/collision.js";
import { WaveSpawner } from "./systems/spawner.js";

export class Game {
  constructor({ canvas, input, ui, audio }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.input = input;
    this.ui = ui;
    this.audio = audio;
    this.bounds = { width: 1280, height: 720 };
    this.dpr = 1;
    this.state = "menu";
    this.lastFrameTime = 0;
    this.waveSpawner = new WaveSpawner();
    this.player = new Player(this.bounds.width / 2, this.bounds.height / 2);
    this.bullets = [];
    this.enemyProjectiles = [];
    this.enemies = [];
    this.particles = [];
    this.bloodPools = [];
    this.score = 0;
    this.screenShake = 0;
    this.awaitingWaveStart = false;
    this.nextWaveTimer = 0;

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    this.syncHud();
  }

  async startNewRun() {
    await this.audio.unlock();

    window.clearTimeout(this.nextWaveTimer);
    this.state = "playing";
    this.score = 0;
    this.screenShake = 0;
    this.awaitingWaveStart = false;
    this.waveSpawner.reset();
    this.player.reset(this.bounds.width / 2, this.bounds.height / 2);
    this.bullets = [];
    this.enemyProjectiles = [];
    this.enemies = [];
    this.particles = [];
    this.bloodPools = [];

    this.ui.showMenu(false);
    this.ui.showPause(false);
    this.ui.showGameOver(false);

    window.dispatchEvent(new CustomEvent("gameStart", { detail: { wave: 1 } }));
    this.queueNextWave(650);
    this.syncHud();
  }

  resume() {
    if (this.state !== "paused") {
      return;
    }

    this.state = "playing";
    this.ui.showPause(false);
    this.syncHud();
  }

  togglePause() {
    if (this.state === "playing") {
      this.state = "paused";
      this.ui.showPause(true);
      this.syncHud();
      return;
    }

    if (this.state === "paused") {
      this.resume();
    }
  }

  toggleMute() {
    return this.audio.toggleMute();
  }

  queueNextWave(delayMs) {
    this.awaitingWaveStart = true;
    window.clearTimeout(this.nextWaveTimer);

    this.nextWaveTimer = window.setTimeout(() => {
      this.waveSpawner.startWave(this.bounds);
      this.awaitingWaveStart = false;
      this.audio.playWaveStart();
      window.dispatchEvent(new CustomEvent("levelUp", { detail: { wave: this.waveSpawner.wave } }));
      this.syncHud();
    }, delayMs);
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.bounds.width = Math.max(320, Math.floor(rect.width));
    this.bounds.height = Math.max(320, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.bounds.width * this.dpr);
    this.canvas.height = Math.floor(this.bounds.height * this.dpr);

    keepCircleInBounds(this.player, this.bounds);
  }

  loop(timestamp) {
    if (!this.lastFrameTime) {
      this.lastFrameTime = timestamp;
    }

    const delta = clamp((timestamp - this.lastFrameTime) / 1000, 0, 0.033);
    this.lastFrameTime = timestamp;

    this.handleInput();

    if (this.state === "playing") {
      this.update(delta);
    }

    this.render();
    this.input.endFrame();
    requestAnimationFrame(this.loop);
  }

  handleInput() {
    const events = this.input.consumeEvents();

    if (this.input.wasPressed("escape")) {
      this.togglePause();
    }

    for (const event of events) {
      if (event.type === "resize") {
        this.resize();
      }

      if (event.type === "blur" && this.state === "playing") {
        this.state = "paused";
        this.ui.showPause(true);
      }

      if (event.type === "focus") {
        this.ui.pushEvent("Window focus restored.");
      }

      if (event.type === "visibilitychange" && event.hidden && this.state === "playing") {
        this.state = "paused";
        this.ui.showPause(true);
      }

      if (event.type === "keypress") {
        this.handleKeyPress(event.key);
      }

      if (this.state !== "playing") {
        continue;
      }

      if (event.type === "wheel") {
        const weapon = this.player.switchWeaponByStep(event.deltaY > 0 ? 1 : -1);
        this.ui.pushEvent(`${weapon.name} selected.`);
      }

      if (event.type === "click") {
        this.firePlayerWeapon();
      }

      if (event.type === "contextmenu") {
        const dashed = this.player.useDash(event.x, event.y, this.bounds);

        if (dashed) {
          this.audio.playDash();
          this.spawnBurst(this.player.x, this.player.y, "#6be0d6", 14, 20, 140);
          this.screenShake = Math.max(this.screenShake, 5);
        }
      }
    }

    if (this.state === "playing" && this.input.mouse.leftDown && this.player.weapon.auto) {
      this.firePlayerWeapon();
    }

    this.syncHud();
  }

  handleKeyPress(key) {
    if (key === "1" || key === "2" || key === "3") {
      const weapon = this.player.selectWeapon(Number(key) - 1);
      this.ui.pushEvent(`${weapon.name} selected.`);
      return;
    }

    if (key === "m") {
      const muted = this.toggleMute();
      this.ui.setMuteLabel(muted);
      return;
    }

    if (key === "r" && (this.state === "menu" || this.state === "gameover")) {
      this.startNewRun();
    }
  }

  firePlayerWeapon() {
    const bullets = this.player.tryShoot(this.input.mouse.x, this.input.mouse.y);

    if (bullets.length === 0) {
      return;
    }

    this.bullets.push(...bullets);
    this.audio.playShoot(this.player.weapon.name);
    this.screenShake = Math.max(this.screenShake, this.player.weapon.recoil);
    this.spawnBurst(this.player.x, this.player.y, this.player.weapon.color, 6, 10, 40);
  }

  update(delta) {
    this.player.update(delta, this.input, this.bounds);
    this.screenShake = Math.max(0, this.screenShake - delta * 24);

    const spawnedEnemies = this.waveSpawner.update(delta);
    this.enemies.push(...spawnedEnemies);

    for (const bullet of this.bullets) {
      bullet.update(delta, this.bounds);
    }

    for (const projectile of this.enemyProjectiles) {
      projectile.update(delta, this.bounds);
    }

    const enemyContext = {
      player: this.player,
      bounds: this.bounds,
      damagePlayer: (amount) => this.damagePlayer(amount),
      spawnEnemyProjectile: (projectile) => this.enemyProjectiles.push(projectile),
      spawnBurst: (x, y, color, count, speedMin, speedMax) =>
        this.spawnBurst(x, y, color, count, speedMin, speedMax),
      leaveBlood: (x, y, radius) => this.leaveBlood(x, y, radius),
    };

    for (const enemy of this.enemies) {
      enemy.update(delta, enemyContext);
    }

    this.updateParticles(delta);
    this.resolveCollisions();

    this.bullets = this.bullets.filter((bullet) => bullet.alive);
    this.enemyProjectiles = this.enemyProjectiles.filter((bullet) => bullet.alive);
    this.enemies = this.enemies.filter((enemy) => !enemy.expired);

    if (!this.awaitingWaveStart && this.waveSpawner.remaining === 0 && this.enemies.length === 0) {
      window.dispatchEvent(new CustomEvent("waveComplete", { detail: { wave: this.waveSpawner.wave } }));
      this.player.heal(12);
      this.queueNextWave(1600);
    }

    if (this.player.health <= 0 && this.state === "playing") {
      this.finishRun();
    }

    this.syncHud();
  }

  damagePlayer(amount) {
    const hitLanded = this.player.takeDamage(amount);

    if (hitLanded) {
      this.audio.playPlayerHit();
      this.screenShake = Math.max(this.screenShake, 8);
    }
  }

  resolveCollisions() {
    for (const bullet of this.bullets) {
      if (!bullet.alive) {
        continue;
      }

      for (const enemy of this.enemies) {
        if (enemy.fsm.currentState === "DEAD" || !circlesOverlap(bullet, enemy)) {
          continue;
        }

        bullet.alive = false;
        const result = enemy.takeDamage(bullet.damage);

        if (result.hit) {
          this.audio.playEnemyHit();
          this.spawnBurst(bullet.x, bullet.y, bullet.color, 6, 20, 70);
        }

        if (result.killed) {
          this.score += enemy.config.score * Math.max(1, this.waveSpawner.wave);
          this.screenShake = Math.max(this.screenShake, 10);
        }

        break;
      }
    }

    for (const projectile of this.enemyProjectiles) {
      if (!projectile.alive || !circlesOverlap(projectile, this.player)) {
        continue;
      }

      projectile.alive = false;
      this.damagePlayer(projectile.damage);
      this.spawnBurst(projectile.x, projectile.y, projectile.color, 8, 20, 90);
    }

    for (let index = 0; index < this.enemies.length; index += 1) {
      const firstEnemy = this.enemies[index];

      for (let inner = index + 1; inner < this.enemies.length; inner += 1) {
        const secondEnemy = this.enemies[inner];

        if (firstEnemy.fsm.currentState !== "DEAD" && secondEnemy.fsm.currentState !== "DEAD") {
          separateCircles(firstEnemy, secondEnemy);
        }
      }

      if (firstEnemy.fsm.currentState !== "DEAD" && circlesOverlap(firstEnemy, this.player)) {
        separateCircles(firstEnemy, this.player);
        keepCircleInBounds(this.player, this.bounds);
      }
    }
  }

  spawnBurst(x, y, color, count, speedMin, speedMax) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);

      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.25 + Math.random() * 0.45,
        size: 2 + Math.random() * 4,
        color,
      });
    }
  }

  updateParticles(delta) {
    for (const particle of this.particles) {
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.life -= delta;
      particle.vx *= 0.95;
      particle.vy *= 0.95;
    }

    this.particles = this.particles.filter((particle) => particle.life > 0);
  }

  leaveBlood(x, y, radius) {
    this.bloodPools.push({
      x,
      y,
      radius,
      alpha: 0.18 + Math.random() * 0.12,
    });
  }

  finishRun() {
    this.state = "gameover";
    window.clearTimeout(this.nextWaveTimer);
    this.audio.playGameOver();
    window.dispatchEvent(
      new CustomEvent("gameOver", {
        detail: {
          score: this.score,
          wave: this.waveSpawner.wave,
        },
      }),
    );

    this.ui.showPause(false);
    this.ui.showGameOver(true, `Score ${this.score}. Reached wave ${this.waveSpawner.wave}. Press R or Restart.`);
    this.syncHud();
  }

  syncHud() {
    const stateLabels = {
      menu: "Menu",
      playing: "Playing",
      paused: "Paused",
      gameover: "Game Over",
    };

    this.ui.updateHud({
      health: this.player.health,
      maxHealth: this.player.maxHealth,
      score: this.score,
      wave: this.waveSpawner.wave,
      weapon: this.player.weapon.name,
      activeZombies: this.enemies.filter((enemy) => enemy.fsm.currentState !== "DEAD").length,
      state: stateLabels[this.state],
    });
  }

  renderBackground() {
    const { ctx } = this;
    const gradient = ctx.createRadialGradient(
      this.bounds.width * 0.5,
      this.bounds.height * 0.45,
      80,
      this.bounds.width * 0.5,
      this.bounds.height * 0.45,
      this.bounds.width * 0.85,
    );

    gradient.addColorStop(0, "#291a16");
    gradient.addColorStop(0.55, "#18110f");
    gradient.addColorStop(1, "#090707");

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.bounds.width, this.bounds.height);

    ctx.strokeStyle = "rgba(255, 166, 102, 0.08)";
    ctx.lineWidth = 1;

    for (let x = 24; x < this.bounds.width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.bounds.height);
      ctx.stroke();
    }

    for (let y = 24; y < this.bounds.height; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.bounds.width, y);
      ctx.stroke();
    }

    ctx.strokeStyle = "rgba(255, 122, 69, 0.2)";
    ctx.lineWidth = 4;
    ctx.strokeRect(16, 16, this.bounds.width - 32, this.bounds.height - 32);

    for (const bloodPool of this.bloodPools) {
      ctx.fillStyle = `rgba(130, 17, 24, ${bloodPool.alpha})`;
      ctx.beginPath();
      ctx.arc(bloodPool.x, bloodPool.y, bloodPool.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderParticles() {
    for (const particle of this.particles) {
      this.ctx.globalAlpha = clamp(particle.life * 2, 0, 1);
      this.ctx.fillStyle = particle.color;
      this.ctx.beginPath();
      this.ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.globalAlpha = 1;
  }

  render() {
    const shakeX = (Math.random() - 0.5) * this.screenShake;
    const shakeY = (Math.random() - 0.5) * this.screenShake;

    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, shakeX * this.dpr, shakeY * this.dpr);
    this.ctx.clearRect(0, 0, this.bounds.width, this.bounds.height);

    this.renderBackground();

    for (const bullet of this.bullets) {
      bullet.render(this.ctx);
    }

    for (const projectile of this.enemyProjectiles) {
      projectile.render(this.ctx);
    }

    for (const enemy of this.enemies) {
      enemy.render(this.ctx);
    }

    if (this.state !== "menu") {
      this.player.render(this.ctx);
    } else {
      this.player.x = this.bounds.width * 0.5;
      this.player.y = this.bounds.height * 0.6;
      this.player.render(this.ctx);
    }

    this.renderParticles();

    if (this.state === "paused") {
      this.ctx.fillStyle = "rgba(4, 4, 4, 0.26)";
      this.ctx.fillRect(0, 0, this.bounds.width, this.bounds.height);
    }
  }
}

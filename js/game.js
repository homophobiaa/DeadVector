import { Player } from "./entities/player.js";
import { circlesOverlap, clamp, keepCircleInBounds, randomRange, separateCircles } from "./systems/collision.js";
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
    this.pickups = [];
    this.damageNumbers = [];
    this.score = 0;
    this.screenShake = 0;
    this.awaitingWaveStart = false;
    this.nextWaveTimer = 0;

    // Combo system
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;

    // Wave announcement
    this.waveAnnouncement = { text: "", timer: 0 };

    // Damage vignette
    this.damageVignette = 0;

    // Ambient dust particles
    this.ambientDust = [];
    this.initAmbientDust();

    // Pre-generate some ground debris positions
    this.debris = [];
    this.initDebris();

    // Periodic stats reporting via setInterval (required event)
    this.statsInterval = null;

    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
    this.syncHud();
  }

  initAmbientDust() {
    for (let i = 0; i < 30; i++) {
      this.ambientDust.push({
        x: Math.random() * 1600,
        y: Math.random() * 900,
        size: 1 + Math.random() * 2,
        speed: 5 + Math.random() * 12,
        alpha: 0.05 + Math.random() * 0.1,
        angle: Math.random() * Math.PI * 2,
      });
    }
  }

  initDebris() {
    for (let i = 0; i < 20; i++) {
      this.debris.push({
        x: Math.random() * 1600,
        y: Math.random() * 900,
        size: 3 + Math.random() * 8,
        rotation: Math.random() * Math.PI * 2,
        alpha: 0.03 + Math.random() * 0.06,
      });
    }
  }

  async startNewRun() {
    await this.audio.unlock();
    this.audio.startMusic();

    window.clearTimeout(this.nextWaveTimer);
    if (this.statsInterval) clearInterval(this.statsInterval);

    this.state = "playing";
    this.score = 0;
    this.screenShake = 0;
    this.awaitingWaveStart = false;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.damageVignette = 0;
    this.waveAnnouncement = { text: "", timer: 0 };
    this.waveSpawner.reset();
    this.player.reset(this.bounds.width / 2, this.bounds.height / 2);
    this.bullets = [];
    this.enemyProjectiles = [];
    this.enemies = [];
    this.particles = [];
    this.bloodPools = [];
    this.pickups = [];
    this.damageNumbers = [];

    this.ui.showMenu(false);
    this.ui.showPause(false);
    this.ui.showGameOver(false);

    // setInterval event: periodic stats sync
    this.statsInterval = setInterval(() => {
      if (this.state === "playing") this.syncHud();
    }, 500);

    window.dispatchEvent(new CustomEvent("gameStart", { detail: { wave: 1 } }));
    this.audio.playConfirm();
    this.queueNextWave(650);
    this.syncHud();
  }

  resume() {
    if (this.state !== "paused") return;
    this.state = "playing";
    this.ui.showPause(false);
    this.audio.unlock();
    this.audio.startMusic();
    this.audio.playConfirm();
    this.syncHud();
  }

  togglePause() {
    if (this.state === "playing") {
      this.state = "paused";
      this.ui.showPause(true);
      this.audio.stopMusic();
      this.syncHud();
      return;
    }
    if (this.state === "paused") this.resume();
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

      // Wave announcement
      this.waveAnnouncement = {
        text: `WAVE ${this.waveSpawner.wave}`,
        timer: 2.5,
      };

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
    if (this.player) keepCircleInBounds(this.player, this.bounds);
  }

  loop(timestamp) {
    if (!this.lastFrameTime) this.lastFrameTime = timestamp;
    const delta = clamp((timestamp - this.lastFrameTime) / 1000, 0, 0.033);
    this.lastFrameTime = timestamp;

    this.handleInput();
    if (this.state === "playing") this.update(delta);
    this.render();
    this.input.endFrame();
    requestAnimationFrame(this.loop);
  }

  handleInput() {
    const events = this.input.consumeEvents();

    if (this.input.wasPressed("escape")) this.togglePause();

    for (const event of events) {
      if (event.type === "resize") this.resize();

      if (event.type === "blur" && this.state === "playing") {
        this.state = "paused";
        this.ui.showPause(true);
        this.audio.stopMusic();
      }

      if (event.type === "focus") {
        this.ui.pushEvent("Window focus restored.");
      }

      if (event.type === "visibilitychange" && event.hidden && this.state === "playing") {
        this.state = "paused";
        this.ui.showPause(true);
        this.audio.stopMusic();
      }

      if (event.type === "keypress") this.handleKeyPress(event.key);

      if (this.state !== "playing") continue;

      if (event.type === "wheel") {
        const weapon = this.player.switchWeaponByStep(event.deltaY > 0 ? 1 : -1);
        this.ui.pushEvent(`${weapon.name} selected.`);
      }

      if (event.type === "click") this.firePlayerWeapon();

      if (event.type === "contextmenu") {
        const dashed = this.player.useDash(event.x, event.y, this.bounds);
        if (dashed) {
          this.audio.playDash();
          this.spawnBurst(this.player.x, this.player.y, "#6be0d6", 16, 25, 160);
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
    if (bullets.length === 0) return;
    this.bullets.push(...bullets);
    this.audio.playShoot(this.player.weapon.name);
    this.screenShake = Math.max(this.screenShake, this.player.weapon.recoil);
    this.spawnBurst(this.player.x, this.player.y, this.player.weapon.color, 4, 10, 40);
  }

  update(delta) {
    this.player.update(delta, this.input, this.bounds);
    this.screenShake = Math.max(0, this.screenShake - delta * 24);
    this.damageVignette = Math.max(0, this.damageVignette - delta * 1.8);

    // Combo timer
    if (this.comboTimer > 0) {
      this.comboTimer -= delta;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTimer = 0;
      }
    }

    // Wave announcement
    if (this.waveAnnouncement.timer > 0) {
      this.waveAnnouncement.timer -= delta;
    }

    // Spawn enemies
    const spawnedEnemies = this.waveSpawner.update(delta);
    this.enemies.push(...spawnedEnemies);

    // Update bullets
    for (const b of this.bullets) b.update(delta, this.bounds);
    for (const p of this.enemyProjectiles) p.update(delta, this.bounds);

    // Update enemies with full context
    const enemyContext = {
      player: this.player,
      bounds: this.bounds,
      enemies: this.enemies,
      damagePlayer: (amount) => this.damagePlayer(amount),
      spawnEnemyProjectile: (p) => this.enemyProjectiles.push(p),
      spawnBurst: (x, y, color, count, sMin, sMax) => this.spawnBurst(x, y, color, count, sMin, sMax),
      leaveBlood: (x, y, r) => this.leaveBlood(x, y, r),
    };

    for (const enemy of this.enemies) enemy.update(delta, enemyContext);

    // Update pickups
    this.updatePickups(delta);

    // Update particles and damage numbers
    this.updateParticles(delta);
    this.updateDamageNumbers(delta);

    // Update ambient dust
    this.updateAmbientDust(delta);

    // Update toast notifications
    this.ui.updateToasts(delta);

    // Collisions
    this.resolveCollisions();

    // Clean up dead objects
    this.bullets = this.bullets.filter((b) => b.alive);
    this.enemyProjectiles = this.enemyProjectiles.filter((b) => b.alive);
    this.enemies = this.enemies.filter((e) => !e.expired);
    this.pickups = this.pickups.filter((p) => p.life > 0);

    // Limit blood pools
    if (this.bloodPools.length > 60) this.bloodPools.splice(0, this.bloodPools.length - 60);

    // Wave completion
    if (!this.awaitingWaveStart && this.waveSpawner.remaining === 0 && this.enemies.length === 0) {
      window.dispatchEvent(new CustomEvent("waveComplete", { detail: { wave: this.waveSpawner.wave } }));
      this.player.heal(15);
      this.spawnBurst(this.player.x, this.player.y, "#78ff78", 12, 15, 80);
      this.queueNextWave(1800);
    }

    // Game over check
    if (this.player.health <= 0 && this.state === "playing") this.finishRun();

    this.syncHud();
  }

  damagePlayer(amount) {
    const hit = this.player.takeDamage(amount);
    if (hit) {
      this.audio.playPlayerHit();
      this.screenShake = Math.max(this.screenShake, 10);
      this.damageVignette = 1;
    }
  }

  resolveCollisions() {
    // Player bullets vs enemies
    for (const bullet of this.bullets) {
      if (!bullet.alive) continue;
      for (const enemy of this.enemies) {
        if (enemy.fsm.currentState === "DEAD" || !circlesOverlap(bullet, enemy)) continue;

        bullet.alive = false;
        const result = enemy.takeDamage(bullet.damage);

        if (result.hit) {
          this.audio.playEnemyHit();
          this.spawnBurst(bullet.x, bullet.y, bullet.color, 5, 20, 70);
          this.spawnBurst(bullet.x, bullet.y, "#550808", 3, 10, 40);

          // Damage number
          this.spawnDamageNumber(enemy.x, enemy.y - enemy.radius - 8, bullet.damage, bullet.color);
        }

        if (result.killed) {
          // Combo system
          this.combo += 1;
          this.comboTimer = 2.5;
          if (this.combo > this.maxCombo) this.maxCombo = this.combo;

          const multiplier = this.getComboMultiplier();
          const points = Math.floor(enemy.config.score * Math.max(1, this.waveSpawner.wave) * multiplier);
          this.score += points;
          this.player.kills += 1;

          this.audio.playEnemyKill();
          this.screenShake = Math.max(this.screenShake, 12);

          // Combo text
          if (this.combo > 1) {
            this.spawnDamageNumber(
              enemy.x, enemy.y - enemy.radius - 22,
              `${this.combo}x COMBO`, "#ffc850"
            );
          }

          // Score text
          this.spawnDamageNumber(enemy.x + 15, enemy.y - enemy.radius - 12, `+${points}`, "#fff");

          // Drop pickup (25% chance)
          if (Math.random() < 0.25) {
            this.pickups.push({
              x: enemy.x + randomRange(-10, 10),
              y: enemy.y + randomRange(-10, 10),
              radius: 8,
              type: "health",
              amount: 12,
              life: 10,
              bobPhase: Math.random() * Math.PI * 2,
            });
          }
        }
        break;
      }
    }

    // Enemy projectiles vs player
    for (const p of this.enemyProjectiles) {
      if (!p.alive || !circlesOverlap(p, this.player)) continue;
      p.alive = false;
      this.damagePlayer(p.damage);
      this.spawnBurst(p.x, p.y, p.color, 8, 20, 90);
    }

    // Enemy-enemy and enemy-player separation
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (a.fsm.currentState !== "DEAD" && b.fsm.currentState !== "DEAD") {
          separateCircles(a, b);
        }
      }
      if (a.fsm.currentState !== "DEAD" && circlesOverlap(a, this.player)) {
        separateCircles(a, this.player);
        keepCircleInBounds(this.player, this.bounds);
      }
    }

    // Player vs pickups
    for (const pickup of this.pickups) {
      if (pickup.life <= 0) continue;
      const dx = this.player.x - pickup.x;
      const dy = this.player.y - pickup.y;
      const dist = Math.hypot(dx, dy);
      if (dist < this.player.radius + pickup.radius) {
        if (pickup.type === "health") {
          this.player.heal(pickup.amount);
          this.spawnBurst(pickup.x, pickup.y, "#78ff78", 8, 15, 55);
          this.spawnDamageNumber(pickup.x, pickup.y - 15, `+${pickup.amount} HP`, "#78ff78");
        }
        pickup.life = 0;
      }
    }
  }

  getComboMultiplier() {
    return Math.min(1 + (this.combo - 1) * 0.25, 5);
  }

  spawnDamageNumber(x, y, text, color) {
    this.damageNumbers.push({
      x, y,
      text: typeof text === "number" ? text.toString() : text,
      color,
      life: 1.0,
      vy: -55,
      scale: 1,
    });
  }

  updateDamageNumbers(delta) {
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const dn = this.damageNumbers[i];
      dn.y += dn.vy * delta;
      dn.vy *= 0.96;
      dn.life -= delta;
      if (dn.life <= 0) this.damageNumbers.splice(i, 1);
    }
  }

  updatePickups(delta) {
    for (const p of this.pickups) {
      p.life -= delta;
      p.bobPhase += delta * 3;
    }
  }

  spawnBurst(x, y, color, count, speedMin, speedMax) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.25 + Math.random() * 0.45,
        size: 2 + Math.random() * 4,
        color,
      });
    }
  }

  updateParticles(delta) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.life -= delta;
      p.vx *= 0.94;
      p.vy *= 0.94;
      if (p.life <= 0) this.particles.splice(i, 1);
    }
  }

  updateAmbientDust(delta) {
    for (const d of this.ambientDust) {
      d.x += Math.cos(d.angle) * d.speed * delta;
      d.y += Math.sin(d.angle) * d.speed * delta;
      d.angle += (Math.random() - 0.5) * delta;
      if (d.x < -10) d.x = this.bounds.width + 10;
      if (d.x > this.bounds.width + 10) d.x = -10;
      if (d.y < -10) d.y = this.bounds.height + 10;
      if (d.y > this.bounds.height + 10) d.y = -10;
    }
  }

  leaveBlood(x, y, radius) {
    this.bloodPools.push({
      x, y, radius,
      alpha: 0.15 + Math.random() * 0.12,
    });
  }

  finishRun() {
    this.state = "gameover";
    window.clearTimeout(this.nextWaveTimer);
    if (this.statsInterval) { clearInterval(this.statsInterval); this.statsInterval = null; }
    this.audio.stopMusic();
    this.audio.playGameOver();

    window.dispatchEvent(
      new CustomEvent("gameOver", {
        detail: { score: this.score, wave: this.waveSpawner.wave },
      }),
    );

    this.ui.showPause(false);
    this.ui.showGameOver(
      true,
      `Score: ${this.score.toLocaleString()} \u2022 Wave: ${this.waveSpawner.wave} \u2022 Kills: ${this.player.kills} \u2022 Max Combo: ${this.maxCombo}x`,
    );
    this.syncHud();
  }

  syncHud() {
    // HUD is now rendered directly on canvas — no DOM updates needed
  }

  // ====== RENDERING ======

  renderBackground() {
    const { ctx, bounds } = this;

    // Dark green radial gradient
    const bg = ctx.createRadialGradient(
      bounds.width * 0.5, bounds.height * 0.45, 60,
      bounds.width * 0.5, bounds.height * 0.45, bounds.width * 0.9,
    );
    bg.addColorStop(0, "#0e1a0e");
    bg.addColorStop(0.4, "#0a120a");
    bg.addColorStop(1, "#040804");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, bounds.width, bounds.height);

    // Grid lines
    ctx.strokeStyle = "rgba(0,255,136,0.03)";
    ctx.lineWidth = 1;
    for (let x = 24; x < bounds.width; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, bounds.height);
      ctx.stroke();
    }
    for (let y = 24; y < bounds.height; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(bounds.width, y);
      ctx.stroke();
    }

    // Ground debris
    ctx.fillStyle = "rgba(0,255,136,0.015)";
    for (const d of this.debris) {
      ctx.save();
      ctx.translate(d.x % bounds.width, d.y % bounds.height);
      ctx.rotate(d.rotation);
      ctx.globalAlpha = d.alpha;
      ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.6);
      ctx.restore();
    }

    // Arena border
    ctx.strokeStyle = "rgba(0,255,136,0.12)";
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 18, bounds.width - 36, bounds.height - 36);

    // Corner accents
    const cornerSize = 24;
    ctx.strokeStyle = "rgba(0,255,136,0.25)";
    ctx.lineWidth = 2;
    const corners = [
      [18, 18, 1, 1], [bounds.width - 18, 18, -1, 1],
      [18, bounds.height - 18, 1, -1], [bounds.width - 18, bounds.height - 18, -1, -1],
    ];
    for (const [cx, cy, dx, dy] of corners) {
      ctx.beginPath();
      ctx.moveTo(cx, cy + dy * cornerSize);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + dx * cornerSize, cy);
      ctx.stroke();
    }

    // Blood pools
    for (const pool of this.bloodPools) {
      ctx.fillStyle = `rgba(110,14,18,${pool.alpha})`;
      ctx.beginPath();
      ctx.arc(pool.x, pool.y, pool.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ambient dust
    for (const d of this.ambientDust) {
      ctx.fillStyle = `rgba(180,255,200,${d.alpha * 0.5})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderPickups() {
    const { ctx } = this;
    const t = performance.now() * 0.001;

    for (const p of this.pickups) {
      if (p.life <= 0) continue;
      const fadeAlpha = p.life < 2 ? p.life / 2 : 1;
      const bob = Math.sin(p.bobPhase) * 3;

      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.globalAlpha = fadeAlpha;

      // Outer glow
      ctx.shadowBlur = 20;
      ctx.shadowColor = "#78ff78";

      // Pulsing ring
      const pulse = 0.3 + Math.sin(t * 4 + p.bobPhase) * 0.15;
      ctx.strokeStyle = `rgba(120,255,120,${pulse})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 4 + Math.sin(t * 3) * 2, 0, Math.PI * 2);
      ctx.stroke();

      // Core orb
      const orbGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, p.radius);
      orbGrad.addColorStop(0, "#ccffcc");
      orbGrad.addColorStop(0.5, "#55dd55");
      orbGrad.addColorStop(1, "#228822");
      ctx.fillStyle = orbGrad;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Cross symbol
      ctx.fillStyle = "#ffffff";
      ctx.globalAlpha = fadeAlpha * 0.8;
      ctx.fillRect(-1.5, -4, 3, 8);
      ctx.fillRect(-4, -1.5, 8, 3);

      ctx.restore();
    }
  }

  renderParticles() {
    const { ctx } = this;
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life * 2.5, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  renderDamageNumbers() {
    const { ctx } = this;
    for (const dn of this.damageNumbers) {
      const alpha = clamp(dn.life * 2, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `bold ${13 + dn.scale}px "Inter", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      // Shadow
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.fillText(dn.text, dn.x + 1, dn.y + 1);

      // Text
      ctx.fillStyle = dn.color;
      ctx.fillText(dn.text, dn.x, dn.y);
      ctx.restore();
    }
  }

  renderWaveAnnouncement() {
    const wa = this.waveAnnouncement;
    if (wa.timer <= 0) return;

    const { ctx, bounds } = this;
    const alpha = wa.timer > 2 ? clamp((2.5 - wa.timer) * 2, 0, 1) : clamp(wa.timer / 1.5, 0, 1);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Large title
    ctx.font = 'bold 64px "Orbitron", "Arial Black", sans-serif';
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillText(wa.text, bounds.width / 2 + 2, bounds.height / 2 + 2);
    ctx.fillStyle = "#00ff88";
    ctx.shadowBlur = 30;
    ctx.shadowColor = "rgba(0,255,136,0.5)";
    ctx.fillText(wa.text, bounds.width / 2, bounds.height / 2);

    // Subtitle
    ctx.font = '18px "Inter", sans-serif';
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,255,136,0.5)";
    ctx.fillText("SURVIVE", bounds.width / 2, bounds.height / 2 + 40);

    ctx.restore();
  }

  renderComboOverlay() {
    if (this.combo <= 1) return;

    const { ctx, bounds } = this;
    const alpha = clamp(this.comboTimer / 0.5, 0, 1);

    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";

    const comboText = `${this.combo}x`;
    const multText = `${this.getComboMultiplier().toFixed(1)}x SCORE`;

    // Combo number
    ctx.font = 'bold 42px "Orbitron", "Arial Black", sans-serif';
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillText(comboText, bounds.width - 22, 22);
    ctx.fillStyle = this.combo >= 10 ? "#ff3355" : this.combo >= 5 ? "#ffc850" : "#00ff88";
    ctx.shadowBlur = 20;
    ctx.shadowColor = "rgba(0,255,136,0.4)";
    ctx.fillText(comboText, bounds.width - 20, 20);

    // Multiplier
    ctx.font = '14px "Inter", sans-serif';
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,255,136,0.5)";
    ctx.fillText(multText, bounds.width - 20, 64);

    ctx.restore();
  }

  renderVignette() {
    const { ctx, bounds } = this;

    // Constant subtle vignette
    const vignette = ctx.createRadialGradient(
      bounds.width / 2, bounds.height / 2, bounds.width * 0.25,
      bounds.width / 2, bounds.height / 2, bounds.width * 0.75,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, bounds.width, bounds.height);

    // Damage flash vignette
    if (this.damageVignette > 0) {
      const dmgVig = ctx.createRadialGradient(
        bounds.width / 2, bounds.height / 2, bounds.width * 0.2,
        bounds.width / 2, bounds.height / 2, bounds.width * 0.65,
      );
      dmgVig.addColorStop(0, "rgba(180,20,20,0)");
      dmgVig.addColorStop(1, `rgba(180,20,20,${this.damageVignette * 0.45})`);
      ctx.fillStyle = dmgVig;
      ctx.fillRect(0, 0, bounds.width, bounds.height);
    }
  }

  renderHud() {
    if (this.state === "menu") return;
    const { ctx, bounds } = this;

    ctx.save();

    // ---- Health bar (bottom-center) ----
    const barW = 200;
    const barH = 8;
    const barX = (bounds.width - barW) / 2;
    const barY = bounds.height - 32;
    const pct = clamp(this.player.health / this.player.maxHealth, 0, 1);

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.roundRect(barX - 2, barY - 2, barW + 4, barH + 4, 4);
    ctx.fill();

    // Border
    ctx.strokeStyle = "rgba(0,255,136,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(barX - 2, barY - 2, barW + 4, barH + 4, 4);
    ctx.stroke();

    // Fill
    const hpColor = pct > 0.6 ? "#00ff88" : pct > 0.3 ? "#ffcc00" : "#ff3355";
    ctx.fillStyle = hpColor;
    ctx.shadowBlur = 8;
    ctx.shadowColor = hpColor;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW * pct, barH, 3);
    ctx.fill();
    ctx.shadowBlur = 0;

    // HP text
    ctx.font = '600 11px "Inter", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.fillText(`${Math.ceil(this.player.health)} / ${this.player.maxHealth}`, bounds.width / 2, barY - 5);

    // ---- Top-left: Score + Wave ----
    const tlX = 56;
    const tlY = 18;

    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    // Score
    ctx.font = 'bold 18px "Orbitron", monospace';
    ctx.fillStyle = "#00ff88";
    ctx.shadowBlur = 10;
    ctx.shadowColor = "rgba(0,255,136,0.3)";
    ctx.fillText(this.score.toLocaleString(), tlX, tlY);
    ctx.shadowBlur = 0;

    // Wave label
    ctx.font = '500 11px "Inter", sans-serif';
    ctx.fillStyle = "rgba(0,255,136,0.45)";
    ctx.fillText(`WAVE ${this.waveSpawner.wave}`, tlX, tlY + 24);

    // ---- Bottom-left: Weapon ----
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.font = '600 12px "Inter", sans-serif';
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.fillText(this.player.weapon.name.toUpperCase(), 22, bounds.height - 18);

    // Weapon indicator dots
    const weapons = this.player.weapons || [];
    for (let i = 0; i < weapons.length; i++) {
      const dotX = 22 + i * 14;
      const dotY = bounds.height - 38;
      const active = weapons[i] === this.player.weapon;
      ctx.fillStyle = active ? "#00ff88" : "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.arc(dotX + 4, dotY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- Bottom-right: Kills ----
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.font = '600 12px "Inter", sans-serif';
    ctx.fillStyle = "rgba(255,255,255,0.4)";
    ctx.fillText(`${this.player.kills} KILLS`, bounds.width - 22, bounds.height - 18);

    ctx.restore();
  }

  renderToasts() {
    const toasts = this.ui.toasts;
    if (toasts.length === 0) return;

    const { ctx, bounds } = this;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = '500 12px "Inter", sans-serif';

    for (let i = 0; i < toasts.length; i++) {
      const t = toasts[i];
      const alpha = t.life > 2.5 ? clamp((3.5 - t.life) * 2, 0, 0.7) : clamp(t.life / 1.5, 0, 0.7);
      const yOff = 50 + i * 24;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = "rgba(0,255,136,0.6)";
      ctx.fillText(t.text, bounds.width / 2, yOff);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  render() {
    const { ctx, bounds } = this;
    const shakeX = (Math.random() - 0.5) * this.screenShake;
    const shakeY = (Math.random() - 0.5) * this.screenShake;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, shakeX * this.dpr, shakeY * this.dpr);
    ctx.clearRect(-10, -10, bounds.width + 20, bounds.height + 20);

    this.renderBackground();

    // Pickups
    this.renderPickups();

    // Bullets
    for (const b of this.bullets) b.render(ctx);
    for (const p of this.enemyProjectiles) p.render(ctx);

    // Enemies
    for (const e of this.enemies) e.render(ctx);

    // Player
    if (this.state !== "menu") {
      this.player.render(ctx);
    } else {
      this.player.x = bounds.width * 0.5;
      this.player.y = bounds.height * 0.6;
      this.player.render(ctx);
    }

    // Particles (on top of everything)
    this.renderParticles();

    // Damage numbers
    this.renderDamageNumbers();

    // Vignette overlay
    this.renderVignette();

    // Wave announcement
    this.renderWaveAnnouncement();

    // Combo overlay
    this.renderComboOverlay();

    // In-game HUD
    this.renderHud();

    // Toast notifications
    this.renderToasts();

    // Pause overlay
    if (this.state === "paused") {
      ctx.fillStyle = "rgba(4,8,4,0.3)";
      ctx.fillRect(0, 0, bounds.width, bounds.height);
    }
  }
}

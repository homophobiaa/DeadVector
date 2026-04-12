import { Player, DEV_WEAPON, setBaseWeapons, getBaseWeapons, setPlayerStats, getPlayerStats } from "./entities/player.js";
import { Bullet } from "./entities/bullet.js";
import { circlesOverlap, clamp, keepCircleInBounds, randomRange, separateCircles, resolveCircleRect, pointInRect } from "./systems/collision.js";
import { WaveSpawner } from "./systems/spawner.js";
import { Enemy, setEnemyTypes, getEnemyTypes, getBossTypes, getBossConfigForOccurrence } from "./entities/enemy.js";
import { Progression } from "./systems/progression.js";
import { getMuzzleOffset } from "./entities/player-renderer.js";

export class Game {
  constructor({ canvas, input, ui, audio, settings, mapObstacles = [], mapSpawnZones = [],
                weaponsData, enemiesData, wavesData, playerData }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.input = input;
    this.ui = ui;
    this.audio = audio;
    this.settings = settings;
    this.bounds = { width: 1280, height: 720 };
    this.dpr = 1;
    this.state = "menu";
    this.lastFrameTime = 0;
    this.fpsFrames = 0;
    this.fpsTime = 0;
    this.fpsDisplay = 0;
    this.waveSpawner = new WaveSpawner();
    this.player = new Player(this.bounds.width / 2, this.bounds.height / 2);

    // Apply external data configs if provided
    if (weaponsData) setBaseWeapons(weaponsData);
    if (enemiesData) setEnemyTypes(enemiesData);
    if (wavesData) this.waveSpawner.setConfig(wavesData);
    if (playerData) { setPlayerStats(playerData); this.player.applyStats(); }

    // Store original configs for reset
    this._defaultWeapons = JSON.parse(JSON.stringify(getBaseWeapons()));
    this._defaultEnemies = JSON.parse(JSON.stringify(getEnemyTypes()));
    this._defaultWaves  = JSON.parse(JSON.stringify(this.waveSpawner.getConfig()));
    this._defaultPlayer = JSON.parse(JSON.stringify(getPlayerStats()));

    this.bullets = [];
    this.enemyProjectiles = [];
    this.enemies = [];
    this.particles = [];
    this.bloodPools = [];
    this.gibs = [];
    this.bloodMist = [];
    this.bloodTrails = [];
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

    // Boss tracking
    this.activeBoss = null;           // reference to the boss Enemy instance
    this.bossHealthBarAnim = 0;       // slide-in animation progress (0→1)
    this.bossDeathFlash = 0;          // screen flash on boss kill
    this.bossIndicatorPulse = 0;      // accumulated time for indicator animations

    // Progression system
    this.progression = new Progression();
    this.gameSpeed = 1;                // 1 = normal, ~0.27 = level-up slowdown
    this.loadoutOpen = false;
    this.levelUpReadyAt = 0;           // misclick prevention timestamp

    // Background image
    this.bgImg = new Image();
    this.bgImg.onload = () => this.resize();
    this.bgImg.src = "assets/images/background.png";
    this.bgTransform = { x: 0, y: 0, w: 1280, h: 720 };

    // Map obstacles — normalized to background image dimensions (0-1)
    this.mapObstaclesNorm = mapObstacles;
    this.obstacles = [];

    // Spawn zones — normalized, converted to pixel coords on resize
    this.mapSpawnZonesNorm = mapSpawnZones;
    this.spawnZones = [];

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
    this.activeBoss = null;
    this.bossHealthBarAnim = 0;
    this.bossDeathFlash = 0;
    this.bossIndicatorPulse = 0;
    this.waveAnnouncement = { text: "", timer: 0 };
    this.waveSpawner.reset();
    this.player.reset(this.bounds.width / 2, this.bounds.height / 2);
    // Progression reset — player starts with pistol only
    this.progression.reset();
    this.gameSpeed = 1;
    this.loadoutOpen = false;
    this.levelUpReadyAt = 0;
    this.bullets = [];
    this.enemyProjectiles = [];
    this.enemies = [];
    this.particles = [];
    this.bloodPools = [];
    this.gibs = [];
    this.bloodMist = [];
    this.bloodTrails = [];
    this.pickups = [];
    this.damageNumbers = [];

    this.ui.showMenu(false);
    this.ui.showPause(false);
    this.ui.showGameOver(false);
    this.ui.showSettings(false);
    this.ui.showLevelUp(false);
    this.ui.showBossReward(false);
    this.ui.showLoadout(false);
    this.ui.showHudHint(true);

    this.applySettings();
    // Sync weapons from progression AFTER applySettings to override setDevMode's weapon reset
    this.syncWeaponsFromProgression();

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

  applySettings() {
    const s = this.settings;
    this.audio.masterVolume = s.get("masterVolume");
    this.audio.musicVolumePref = s.get("musicVolume");
    this.audio.sfxVolumePref = s.get("sfxVolume");
    this.audio.syncLoopVolumes();
    this.player.setDevMode(s.get("devMode"));
    this.player.setDevInvincible(s.get("devMode") && s.get("devInvincible"));
  }

  // ---- Dev panel helpers ----

  devKillAll() {
    for (const e of this.enemies) e.health = 0;
  }

  devSkipWave() {
    this.enemies.forEach(e => e.health = 0);
    this.waveSpawner.queue = [];
  }

  devSkipToWave(targetWave) {
    const target = Math.max(1, Math.floor(targetWave));
    // Clear current wave
    this.enemies.forEach(e => e.health = 0);
    this.waveSpawner.queue = [];
    this.activeBoss = null;
    // Set wave counter so next startWave() increments to target
    this.waveSpawner.wave = target - 1;
    this.awaitingWaveStart = false;
    this.queueNextWave(200);
  }

  devHeal() {
    this.player.health = this.player.maxHealth;
    this.player.energy = getPlayerStats().maxEnergy;
  }

  devTeleportCenter() {
    this.player.x = this.bounds.width / 2;
    this.player.y = this.bounds.height / 2;
  }

  devSpawnEnemy(type) {
    const margin = 60;
    const x = margin + Math.random() * (this.bounds.width - margin * 2);
    const y = margin + Math.random() * (this.bounds.height - margin * 2);
    this.enemies.push(new Enemy({ x, y, type, wave: this.waveSpawner.wave || 1 }));
  }

  // Data accessors for dev panel
  getWeaponsData()   { return getBaseWeapons(); }
  getEnemiesData()   { return getEnemyTypes(); }
  getWavesData()     { return this.waveSpawner.getConfig(); }
  getPlayerData()    { return getPlayerStats(); }
  getSpawnZonesData(){ return this.mapSpawnZonesNorm; }
  getObstaclesData() { return this.mapObstaclesNorm; }

  applyWeaponsData(data) {
    setBaseWeapons(data);
    this.syncWeaponsFromProgression();
  }

  applyEnemiesData(data) {
    setEnemyTypes(data);
  }

  applyWavesData(data) {
    this.waveSpawner.setConfig(data);
  }

  applyPlayerData(data) {
    setPlayerStats(data);
    this.player.applyStats();
  }

  applySpawnZonesData(data) {
    this.mapSpawnZonesNorm = data;
    this.computeBgTransform();
  }

  applyObstaclesData(data) {
    this.mapObstaclesNorm = data;
    this.computeBgTransform();
  }

  resetWeaponsData() {
    setBaseWeapons(JSON.parse(JSON.stringify(this._defaultWeapons)));
    this.syncWeaponsFromProgression();
  }
  resetEnemiesData()   { setEnemyTypes(JSON.parse(JSON.stringify(this._defaultEnemies))); }
  resetWavesData()     { this.waveSpawner.setConfig(JSON.parse(JSON.stringify(this._defaultWaves))); }
  resetPlayerData()    { setPlayerStats(JSON.parse(JSON.stringify(this._defaultPlayer))); this.player.applyStats(); }

  queueNextWave(delayMs) {
    this.awaitingWaveStart = true;
    window.clearTimeout(this.nextWaveTimer);

    this.nextWaveTimer = window.setTimeout(() => {
      this.waveSpawner.startWave(this.bounds, this.spawnZones);
      this.awaitingWaveStart = false;
      this.audio.playWaveStart();

      // Wave announcement — boss waves get special treatment
      const isBoss = this.waveSpawner.bossActive;
      if (isBoss) {
        const bossIndex = Math.floor(this.waveSpawner.wave / this.waveSpawner.config.bossInterval) - 1;
        const bossConfig = getBossConfigForOccurrence(bossIndex);
        this.waveAnnouncement = {
          text: `WAVE ${this.waveSpawner.wave}`,
          subtext: bossConfig ? `${bossConfig.bossTitle} APPROACHES` : "BOSS INCOMING",
          timer: 3.5,
          isBoss: true,
          bossColor: bossConfig ? bossConfig.bossGlowColor : "#ff3030",
        };
        this.screenShake = Math.max(this.screenShake, 15);
      } else {
        this.waveAnnouncement = {
          text: `WAVE ${this.waveSpawner.wave}`,
          timer: 2.5,
        };
      }

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
    this.computeBgTransform();
    if (this.player) {
      keepCircleInBounds(this.player, this.bounds);
      this.resolveEntityObstacles(this.player);
    }
  }

  computeBgTransform() {
    const img = this.bgImg;
    if (!img.naturalWidth) return;
    const { bounds } = this;
    const zoom = 1.12;
    const imgAspect = img.naturalWidth / img.naturalHeight;
    const canAspect = bounds.width / bounds.height;
    let dw, dh;
    if (canAspect > imgAspect) {
      dw = bounds.width * zoom;
      dh = dw / imgAspect;
    } else {
      dh = bounds.height * zoom;
      dw = dh * imgAspect;
    }
    const dx = (bounds.width - dw) / 2;
    const dy = (bounds.height - dh) / 2;
    this.bgTransform = { x: dx, y: dy, w: dw, h: dh };

    this.obstacles = this.mapObstaclesNorm.map(o => {
      const w = o.nw * dw, h = o.nh * dh;
      const x = dx + o.nx * dw, y = dy + o.ny * dh;
      const nr = Array.isArray(o.nr) ? o.nr : (o.nr ? [o.nr, o.nr, o.nr, o.nr] : [0,0,0,0]);
      const m = Math.min(w, h);
      return {
        x, y, w, h,
        r: nr.map(v => v * m),
        rot: (o.rot || 0) * Math.PI / 180,
        cx: x + w / 2,
        cy: y + h / 2,
        label: o.label,
      };
    });

    this.spawnZones = this.mapSpawnZonesNorm.map(z => ({
      x: dx + z.nx * dw,
      y: dy + z.ny * dh,
      w: z.nw * dw,
      h: z.nh * dh,
      label: z.label,
    }));
  }

  resolveEntityObstacles(entity) {
    for (const obs of this.obstacles) {
      if (obs.rot) {
        const cos = Math.cos(-obs.rot), sin = Math.sin(-obs.rot);
        const edx = entity.x - obs.cx, edy = entity.y - obs.cy;
        const savedX = entity.x, savedY = entity.y;
        entity.x = obs.cx + edx * cos - edy * sin;
        entity.y = obs.cy + edx * sin + edy * cos;
        const hit = resolveCircleRect(entity, obs);
        if (hit) {
          const ldx = entity.x - (obs.cx + edx * cos - edy * sin);
          const ldy = entity.y - (obs.cy + edx * sin + edy * cos);
          const wcos = Math.cos(obs.rot), wsin = Math.sin(obs.rot);
          entity.x = savedX + ldx * wcos - ldy * wsin;
          entity.y = savedY + ldx * wsin + ldy * wcos;
        } else {
          entity.x = savedX; entity.y = savedY;
        }
      } else {
        resolveCircleRect(entity, obs);
      }
    }
  }

  pointInObstacle(px, py, obs) {
    if (obs.rot) {
      const cos = Math.cos(-obs.rot), sin = Math.sin(-obs.rot);
      const ddx = px - obs.cx, ddy = py - obs.cy;
      return pointInRect(obs.cx + ddx * cos - ddy * sin, obs.cy + ddx * sin + ddy * cos, obs);
    }
    return pointInRect(px, py, obs);
  }

  loop(timestamp) {
    if (!this.lastFrameTime) this.lastFrameTime = timestamp;
    const delta = clamp((timestamp - this.lastFrameTime) / 1000, 0, 0.033);
    this.lastFrameTime = timestamp;

    // FPS counter
    this.fpsFrames++;
    this.fpsTime += delta;
    if (this.fpsTime >= 0.5) {
      this.fpsDisplay = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    this.handleInput();
    if (this.state === "playing") this.update(delta * this.gameSpeed);
    this.render();
    this.input.endFrame();
    requestAnimationFrame(this.loop);
  }

  handleInput() {
    const events = this.input.consumeEvents();

    // Escape: close loadout first, then pause
    if (this.input.wasPressed("escape")) {
      if (this.loadoutOpen) {
        this.toggleLoadout();
      } else {
        this.togglePause();
      }
    }

    // TAB / E: toggle loadout (only while playing, not during level-up/boss reward)
    if ((this.input.wasPressed("tab") || this.input.wasPressed("e")) && this.state === "playing") {
      if (!this.progression.levelUpActive && !this.progression.bossRewardActive) {
        this.toggleLoadout();
      }
    }

    // Block gameplay input during level-up, boss reward, or loadout
    const inputBlocked = this.progression.levelUpActive || this.progression.bossRewardActive || this.loadoutOpen;

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

      if (this.state !== "playing" || inputBlocked) continue;

      if (event.type === "wheel") {
        const weapon = this.player.switchWeaponByStep(event.deltaY > 0 ? 1 : -1);
        this.ui.pushEvent(`${weapon.name} selected.`);
      }

      if (event.type === "click") this.firePlayerWeapon();

      if (event.type === "contextmenu") {
        const dashed = this.player.useDash(event.x, event.y, this.bounds);
        if (dashed) {
          this.resolveEntityObstacles(this.player);
          this.audio.playDash();
          this.spawnBurst(this.player.x, this.player.y, "#6be0d6", 16, 25, 160);
          this.screenShake = Math.max(this.screenShake, 5);
        }
      }
    }

    if (this.state === "playing" && !inputBlocked && this.input.mouse.leftDown && this.player.weapon.auto) {
      this.firePlayerWeapon();
      this.audio.markAutoFiring();
    }

    // Stop auto-fire loop if player isn't holding fire this frame
    this.audio.tickAutoFire();

    this.syncHud();
  }

  handleKeyPress(key) {
    // Level-up / boss reward card selection (1/2/3)
    if (this.progression.levelUpActive || this.progression.bossRewardActive) {
      if (key === "1" || key === "2" || key === "3") {
        this.selectUpgradeCard(Number(key) - 1);
        return;
      }
      return; // Block other keys during level-up
    }

    if (key === "1" || key === "2" || key === "3" || key === "4") {
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
    const wpn = this.player.weapon;
    const mods = this.progression.getWeaponMods(wpn.name);

    // Apply fire rate modifiers
    let cooldown = wpn.cooldown * mods.cooldownMultiplier;
    // Overdrive ramp: up to -40% cooldown at full ramp
    if (mods.overdriveRamp > 0) cooldown *= (1 - mods.overdriveRamp * 0.4);

    // Apply spread modifiers
    const spread = wpn.spread * mods.spreadMultiplier;

    // Calculate damage
    let damage = wpn.damage * mods.damageMultiplier;
    const isCrit = Math.random() < mods.critChance;
    if (isCrit) damage *= mods.critMultiplier;
    damage = Math.round(damage);

    // Use modified cooldown
    if (this.player.fireCooldown > 0) return;
    this.player.fireCooldown = cooldown;
    this.player.muzzleFlash = 1;

    const angle = Math.atan2(this.input.mouse.y - this.player.y, this.input.mouse.x - this.player.x);
    const pellets = wpn.pellets + mods.pelletBonus;

    // Spawn from muzzle
    const muzzleOff = getMuzzleOffset(this.player);
    const spawnX = muzzleOff ? this.player.x + muzzleOff.x : this.player.x + Math.cos(angle) * (this.player.radius + 12);
    const spawnY = muzzleOff ? this.player.y + muzzleOff.y : this.player.y + Math.sin(angle) * (this.player.radius + 12);

    const bullets = [];
    for (let i = 0; i < pellets; i++) {
      const spreadOffset = (Math.random() - 0.5) * spread;
      const a = angle + spreadOffset;
      bullets.push(new Bullet({
        x: spawnX, y: spawnY,
        vx: Math.cos(a) * wpn.projectileSpeed,
        vy: Math.sin(a) * wpn.projectileSpeed,
        radius: wpn.radius,
        damage,
        life: 0.9,
        color: isCrit ? "#ffffff" : wpn.color,
        friendly: true,
        _ricochet: mods.ricochet ? 1 : 0,
        _knockback: mods.knockback,
        _blastRadius: mods.blastRadius,
        _isCrit: isCrit,
      }));
    }

    // Double Tap: fire a second burst after a tiny delay
    if (mods.doubleTap) {
      for (let i = 0; i < pellets; i++) {
        const spreadOffset = (Math.random() - 0.5) * spread;
        const a = angle + spreadOffset;
        bullets.push(new Bullet({
          x: spawnX, y: spawnY,
          vx: Math.cos(a) * wpn.projectileSpeed,
          vy: Math.sin(a) * wpn.projectileSpeed,
          radius: wpn.radius,
          damage: Math.round(damage * 0.6),
          life: 0.9,
          color: wpn.color,
          friendly: true,
          _ricochet: mods.ricochet ? 1 : 0,
          _knockback: mods.knockback,
          _blastRadius: mods.blastRadius,
          _isCrit: false,
        }));
      }
    }

    if (bullets.length === 0) return;
    this.bullets.push(...bullets);
    this.audio.playShoot(wpn.name);
    this.screenShake = Math.max(this.screenShake, wpn.recoil);
  }

  // ---- Progression helpers ----

  selectUpgradeCard(index) {
    // Block input during the misclick-prevention delay
    if (Date.now() < this.levelUpReadyAt) return;

    const cards = this.progression.levelUpActive
      ? this.progression.levelUpCards
      : this.progression.bossRewardCards;
    if (index < 0 || index >= cards.length) return;
    const card = cards[index];

    // Check scrap cost
    if (card.scrapCost > 0 && this.progression.scrap < card.scrapCost) return;
    if (card.scrapCost > 0) this.progression.scrap -= card.scrapCost;

    this.progression.acquire(card.id);
    this.syncWeaponsFromProgression();

    // Dismiss UI
    const wasLevelUp = this.progression.levelUpActive;
    this.progression.levelUpActive = false;
    this.progression.bossRewardActive = false;
    this.progression.levelUpCards = [];
    this.progression.bossRewardCards = [];
    this.gameSpeed = 1;

    this.ui.showLevelUp(false);
    this.ui.showBossReward(false);

    this.ui.pushEvent(`${card.name} acquired.`);
    this.audio.playConfirm();
  }

  triggerLevelUp() {
    const cards = this.progression.buildLevelUpCards();
    if (cards.length === 0) return;  // Pool exhausted
    this.progression.levelUpCards = cards;
    this.progression.levelUpActive = true;
    this.gameSpeed = 0.27;
    this.levelUpReadyAt = Date.now() + 350;
    this.populateCards(cards, this.ui.elements.levelupCards);
    this.ui.showLevelUp(true);
  }

  triggerBossReward(enemy) {
    // Grant XP burst — don't trigger another level-up from the burst itself
    const xpAmt = this.progression.getXpFromKill(enemy);
    this.progression.xp = Math.min(this.progression.xp + xpAmt, this.progression.xpMax - 1);

    const cards = this.progression.buildBossRewardCards();
    if (cards.length === 0) return;
    this.progression.bossRewardCards = cards;
    this.progression.bossRewardActive = true;
    this.gameSpeed = 0.27;
    this.levelUpReadyAt = Date.now() + 350;
    this.populateCards(cards, this.ui.elements.bossRewardCards);
    this.ui.showBossReward(true);
  }

  populateCards(cards, container) {
    container.innerHTML = "";
    cards.forEach((card, i) => {
      const div = document.createElement("div");
      div.className = "upgrade-card";
      div.style.animationDelay = `${i * 0.08}s`;
      const canAfford = card.scrapCost <= 0 || this.progression.scrap >= card.scrapCost;
      if (!canAfford) div.classList.add("disabled");

      div.innerHTML = `
        <span class="card-category${card.category === 'Rare' ? ' cat-rare' : ''}">${card.category}</span>
        <strong class="card-name">${card.name}</strong>
        <span class="card-desc">${card.desc}</span>
        ${card.scrapCost > 0 ? `<span class="card-cost${this.progression.scrap < card.scrapCost ? ' insufficient' : ''}">${card.scrapCost} SCRAP</span>` : ""}
        <span class="card-key">${i + 1}</span>
      `;
      div.addEventListener("click", () => this.selectUpgradeCard(i));
      container.appendChild(div);
    });
  }

  toggleLoadout() {
    this.loadoutOpen = !this.loadoutOpen;
    if (this.loadoutOpen) {
      this.populateLoadout();
      this.ui.showLoadout(true);
    } else {
      this.ui.showLoadout(false);
    }
  }

  populateLoadout() {
    const el = this.ui.elements;

    // Weapons
    const allWeapons = [
      { name: "Service Pistol", key: "pistol" },
      { name: "Scatter Cannon", key: "shotgun" },
      { name: "Vector SMG", key: "smg" },
    ];
    el.loadoutWeapons.innerHTML = "";
    for (const w of allWeapons) {
      const unlocked = this.progression.weaponsUnlocked[w.key];
      const active = this.player.weapons.some(pw => pw.name === w.name);
      const div = document.createElement("div");
      div.className = "loadout-weapon-item" + (active ? " active" : "") + (!unlocked ? " locked" : "");
      div.innerHTML = `<span class="weapon-dot"></span><span>${w.name}</span>${!unlocked ? '<span class="weapon-lock">LOCKED</span>' : ""}`;
      el.loadoutWeapons.appendChild(div);
    }

    // Upgrades
    const groups = this.progression.getAcquiredGrouped();
    el.loadoutUpgrades.innerHTML = "";
    for (const [cat, items] of Object.entries(groups)) {
      if (items.length === 0) continue;
      const group = document.createElement("div");
      group.className = "loadout-upgrade-group";
      group.innerHTML = `<span class="loadout-upgrade-group-label">${cat}</span>`;
      for (const item of items) {
        const pip = document.createElement("div");
        pip.className = "loadout-upgrade-item";
        pip.innerHTML = `<span class="upgrade-pip"></span><span>${item.name}</span>`;
        group.appendChild(pip);
      }
      el.loadoutUpgrades.appendChild(group);
    }
    if (this.progression.acquired.length === 0) {
      el.loadoutUpgrades.innerHTML = '<span class="loadout-no-upgrades">No upgrades yet</span>';
    }

    // Stats
    const stats = this.progression.getDisplayStats(this.player);
    el.loadoutStats.innerHTML = `
      <div class="loadout-stat"><span>DAMAGE</span><span class="stat-value">${stats.damage}</span></div>
      <div class="loadout-stat"><span>FIRE RATE</span><span class="stat-value">${stats.fireRate}/s</span></div>
      <div class="loadout-stat"><span>MOVE SPD</span><span class="stat-value">${stats.moveSpeed}</span></div>
      <div class="loadout-stat"><span>CRIT</span><span class="stat-value">${stats.critChance}%</span></div>
      <div class="loadout-stat"><span>XP BONUS</span><span class="stat-value">+${stats.comboXpBonus}%</span></div>
      <div class="loadout-stat"><span>DMG BONUS</span><span class="stat-value">+${stats.comboDmgBonus}%</span></div>
      <div class="loadout-stat"><span>LEVEL</span><span class="stat-value">${this.progression.level}</span></div>
      <div class="loadout-stat"><span>SCRAP</span><span class="stat-value">${this.progression.scrap}</span></div>
    `;
  }

  syncWeaponsFromProgression() {
    const base = getBaseWeapons();
    const weapons = [base[0]]; // Pistol always
    if (this.progression.weaponsUnlocked.shotgun) weapons.push(base[2]); // Scatter Cannon
    if (this.progression.weaponsUnlocked.smg) weapons.push(base[1]);     // Vector SMG

    // If dev mode, append dev weapon
    if (this.player.devMode) weapons.push(DEV_WEAPON);

    this.player.weapons = weapons;
    if (this.player.weaponIndex >= weapons.length) {
      this.player.weaponIndex = weapons.length - 1;
    }
  }

  update(delta) {
    // Recompute obstacles if image just loaded
    if (this.bgImg.naturalWidth && this.obstacles.length === 0) {
      this.computeBgTransform();
    }

    this.player.update(delta, this.input, this.bounds);
    // Apply speed modifier from progression
    const speedMult = this.progression.getSpeedMultiplier();
    if (speedMult !== 1) {
      // Speed was applied at base; recalc velocity this frame
      this.player.vx *= speedMult;
      this.player.vy *= speedMult;
    }
    if (!this.settings.get("devMode") || !this.settings.get("devNoclip")) {
      this.resolveEntityObstacles(this.player);
    }
    this.screenShake = Math.max(0, this.screenShake - delta * 24);
    this.damageVignette = Math.max(0, this.damageVignette - delta * 1.8);

    // Progression: tick overdrive ramp (SMG continuous fire)
    const isFiringSMG = this.input.mouse.leftDown &&
      (this.player.weapon.name.toLowerCase().includes("vector") || this.player.weapon.name.toLowerCase().includes("smg"));
    this.progression.tickOverdrive(isFiringSMG, delta);

    // Progression: update combo bonuses
    this.progression.updateComboBonuses(this.combo);

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
    for (const e of spawnedEnemies) {
      this.resolveEntityObstacles(e);
      // Track boss
      if (e.isBoss) {
        this.activeBoss = e;
        this.bossHealthBarAnim = 0;
      }
    }

    // Update boss tracking
    this.bossIndicatorPulse += delta;
    if (this.bossHealthBarAnim < 1) {
      this.bossHealthBarAnim = Math.min(1, this.bossHealthBarAnim + delta * 2.0);
    }
    if (this.bossDeathFlash > 0) {
      this.bossDeathFlash = Math.max(0, this.bossDeathFlash - delta * 2.5);
    }
    // Clear dead boss reference
    if (this.activeBoss && this.activeBoss.expired) {
      this.activeBoss = null;
    }

    // Update bullets — pass through obstacles
    for (const b of this.bullets) {
      b.update(delta, this.bounds);
    }
    for (const p of this.enemyProjectiles) {
      p.update(delta, this.bounds);
      if (p.alive) {
        for (const obs of this.obstacles) {
          if (this.pointInObstacle(p.x, p.y, obs)) { p.alive = false; break; }
        }
      }
    }

    // Update enemies with full context
    const enemyContext = {
      player: this.player,
      bounds: this.bounds,
      obstacles: this.obstacles,
      enemies: this.enemies,
      damagePlayer: (amount) => this.damagePlayer(amount),
      spawnEnemyProjectile: (p) => this.enemyProjectiles.push(p),
      spawnBurst: (x, y, color, count, sMin, sMax) => this.spawnBurst(x, y, color, count, sMin, sMax),
      addScreenShake: (amount) => { this.screenShake = Math.max(this.screenShake, amount); },
      leaveBlood: (x, y, r) => this.leaveBlood(x, y, r),
    };

    for (const enemy of this.enemies) {
      enemy.update(delta, enemyContext);
      if (enemy.fsm.currentState !== "DEAD") this.resolveEntityObstacles(enemy);
    }

    // Update pickups
    this.updatePickups(delta);

    // Update particles and damage numbers
    this.updateParticles(delta);
    this.updateDamageNumbers(delta);

    // Update gore systems
    this.updateGibs(delta);
    this.updateBloodMist(delta);

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

    // Limit blood pools and trails
    if (this.bloodPools.length > 400) this.bloodPools.splice(0, this.bloodPools.length - 400);
    if (this.bloodTrails.length > 800) this.bloodTrails.splice(0, this.bloodTrails.length - 800);

    // Wave completion
    if (!this.awaitingWaveStart && this.waveSpawner.remaining === 0 && this.enemies.length === 0) {
      window.dispatchEvent(new CustomEvent("waveComplete", { detail: { wave: this.waveSpawner.wave } }));
      this.player.heal(15);
      this.spawnBurst(this.player.x, this.player.y, "#78ff78", 12, 15, 80);
      // Longer delay before boss waves for dramatic pacing,
      // and after boss waves to let effects and pickups settle
      const nextWave = this.waveSpawner.wave + 1;
      const isBossNext = nextWave % this.waveSpawner.config.bossInterval === 0;
      const wasBossWave = this.waveSpawner.wave % this.waveSpawner.config.bossInterval === 0;
      const delay = isBossNext ? 1400 : wasBossWave ? 1200 : 800;
      this.queueNextWave(delay);
    }

    // Game over check
    if (this.player.health <= 0 && this.state === "playing") this.finishRun();

    this.syncHud();
  }

  damagePlayer(amount) {
    const hit = this.player.takeDamage(amount);
    if (hit) {
      this.audio.playPlayerHit();
      // Scale shake with damage — boss hits feel heavier
      const shake = Math.min(25, 8 + amount * 0.4);
      this.screenShake = Math.max(this.screenShake, shake);
      this.damageVignette = 1;
    }
  }

  resolveCollisions() {
    // Player bullets vs enemies
    for (const bullet of this.bullets) {
      if (!bullet.alive) continue;
      for (const enemy of this.enemies) {
        if (enemy.fsm.currentState === "DEAD" || !circlesOverlap(bullet, enemy)) continue;

        // Apply shredder bonus (per-enemy hit stacking)
        let bulletDmg = bullet.damage;
        const shredBonus = this.progression.getShredderBonus(enemy.id);
        if (shredBonus > 0) bulletDmg = Math.round(bulletDmg * (1 + shredBonus));
        this.progression.addShredderStack(enemy.id);

        bullet.alive = false;

        // Ricochet — bounce toward next nearest enemy
        if (bullet._ricochet > 0) {
          let nearest = null, nearDist = 300;
          for (const other of this.enemies) {
            if (other === enemy || other.fsm.currentState === "DEAD") continue;
            const d = Math.hypot(other.x - bullet.x, other.y - bullet.y);
            if (d < nearDist) { nearDist = d; nearest = other; }
          }
          if (nearest) {
            const a = Math.atan2(nearest.y - bullet.y, nearest.x - bullet.x);
            const speed = Math.hypot(bullet.vx, bullet.vy);
            this.bullets.push(new Bullet({
              x: bullet.x, y: bullet.y,
              vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
              radius: bullet.radius,
              damage: Math.round(bulletDmg * 0.6),
              life: 0.5,
              color: bullet.color,
              friendly: true,
              _ricochet: bullet._ricochet - 1,
            }));
          }
        }

        const result = enemy.takeDamage(bulletDmg);

        if (result.hit) {
          this.audio.playEnemyHit();
          this.spawnBurst(bullet.x, bullet.y, bullet.color, 6, 20, 80);
          this.spawnBurst(bullet.x, bullet.y, "#550808", 5, 15, 55);

          // Directional blood spray in bullet travel direction
          const bulletAngle = Math.atan2(bullet.vy, bullet.vx);
          this.spawnDirectionalBlood(bullet.x, bullet.y, bulletAngle, 14, 70, 220);

          // Blood splatter at impact point
          if (Math.random() < 0.6) {
            this.bloodTrails.push({
              x: bullet.x + (Math.random() - 0.5) * 10,
              y: bullet.y + (Math.random() - 0.5) * 10,
              radius: 2 + Math.random() * 5,
              alpha: 0.12 + Math.random() * 0.10,
            });
          }

          // Occasional exit wound blood spray (opposite direction)
          if (Math.random() < 0.3) {
            this.spawnDirectionalBlood(
              enemy.x + Math.cos(bulletAngle) * enemy.radius * 0.5,
              enemy.y + Math.sin(bulletAngle) * enemy.radius * 0.5,
              bulletAngle, 5, 40, 120
            );
          }

          // Damage number (show crit indicator)
          const dmgColor = bullet._isCrit ? "#ffffff" : bullet.color;
          const dmgText = bullet._isCrit ? `${bulletDmg} CRIT` : bulletDmg;
          this.spawnDamageNumber(enemy.x, enemy.y - enemy.radius - 8, dmgText, dmgColor);

          // Knockback — push enemy away from bullet direction
          if (bullet._knockback && !enemy.isBoss) {
            const kbAngle = Math.atan2(bullet.vy, bullet.vx);
            const kbForce = 60;
            enemy.x += Math.cos(kbAngle) * kbForce;
            enemy.y += Math.sin(kbAngle) * kbForce;
            keepCircleInBounds(enemy, this.bounds);
          }

          // Blast Core — AoE explosion on hit
          if (bullet._blastRadius > 0) {
            this.spawnBurst(bullet.x, bullet.y, "#ff6633", 12, 30, 120);
            this.screenShake = Math.max(this.screenShake, 10);
            for (const other of this.enemies) {
              if (other === enemy || other.fsm.currentState === "DEAD") continue;
              const d = Math.hypot(other.x - bullet.x, other.y - bullet.y);
              if (d < bullet._blastRadius) {
                const aoeDmg = Math.round(bulletDmg * 0.4);
                const aoeResult = other.takeDamage(aoeDmg);
                if (aoeResult.hit) {
                  this.spawnDamageNumber(other.x, other.y - other.radius - 8, aoeDmg, "#ff6633");
                }
                if (aoeResult.killed) {
                  this.handleEnemyKill(other, bullet);
                }
              }
            }
          }
        }

        if (result.killed) {
          this.handleEnemyKill(enemy, bullet);
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
      const hitAngle = Math.atan2(p.vy, p.vx);
      this.spawnDirectionalBlood(this.player.x, this.player.y, hitAngle, 6, 40, 120);
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

    // Player vs pickups (with magnet core radius modifier)
    const pickupRadiusMult = this.progression.getPickupRadiusMultiplier();
    for (const pickup of this.pickups) {
      if (pickup.life <= 0) continue;
      const dx = this.player.x - pickup.x;
      const dy = this.player.y - pickup.y;
      const dist = Math.hypot(dx, dy);
      if (dist < (this.player.radius + pickup.radius) * pickupRadiusMult) {
        if (pickup.type === "health") {
          this.player.heal(pickup.amount);
          this.spawnBurst(pickup.x, pickup.y, "#78ff78", 8, 15, 55);
          this.spawnDamageNumber(pickup.x, pickup.y - 15, `+${pickup.amount} HP`, "#78ff78");
        } else if (pickup.type === "scrap") {
          this.progression.scrap += pickup.amount;
          this.spawnBurst(pickup.x, pickup.y, "#ffc850", 6, 12, 45);
          this.spawnDamageNumber(pickup.x, pickup.y - 15, `+${pickup.amount} SCRAP`, "#ffc850");
        }
        pickup.life = 0;
      }
    }
  }

  /** Shared enemy-kill handling — called from main hit loop and blast AoE. */
  handleEnemyKill(enemy, bullet) {
    // Combo system
    this.combo += 1;
    this.comboTimer = 2.5;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;

    const multiplier = this.getComboMultiplier();
    const points = Math.floor(enemy.config.score * Math.max(1, this.waveSpawner.wave) * multiplier);
    this.score += points;
    this.player.kills += 1;

    this.audio.playEnemyKill();
    this.screenShake = Math.max(this.screenShake, 20);

    // Progression: XP
    const xp = this.progression.getXpFromKill(enemy);
    if (this.progression.addXp(xp)) {
      this.triggerLevelUp();
    }

    // Progression: Scrap
    const scrapAmt = this.progression.getScrapFromKill(enemy);
    if (scrapAmt > 0) {
      // Bosses drop multiple scrap pickups spread around, normal enemies drop one
      const pickupCount = enemy.isBoss ? 5 : 1;
      const perPickup = Math.ceil(scrapAmt / pickupCount);
      for (let si = 0; si < pickupCount; si++) {
        this.pickups.push({
          x: enemy.x + randomRange(-20, 20),
          y: enemy.y + randomRange(-20, 20),
          radius: 6,
          type: "scrap",
          amount: perPickup,
          life: 12,
          bobPhase: Math.random() * Math.PI * 2,
        });
      }
    }

    // Progression: Heal on kill
    const healAmt = this.progression.getHealOnKill();
    if (healAmt > 0) {
      this.player.heal(healAmt);
    }

    // Progression: Clear shredder stacks for dead enemy
    this.progression.clearShredderStacks(enemy.id);

    // Massive gore explosion on kill
    const killAngle = Math.atan2(bullet.vy, bullet.vx);
    this.spawnDirectionalBlood(enemy.x, enemy.y, killAngle, 24, 90, 320);
    this.spawnDirectionalBlood(enemy.x, enemy.y, killAngle + Math.PI, 10, 40, 140);
    this.spawnDirectionalBlood(enemy.x, enemy.y, Math.random() * Math.PI * 2, 12, 50, 180);
    const gibCount = enemy.type === "brute" ? 10 + Math.floor(Math.random() * 6) : 5 + Math.floor(Math.random() * 5);
    this.spawnGibs(enemy.x, enemy.y, enemy.radius, enemy.config.bodyColor, gibCount);
    this.spawnBloodMist(enemy.x, enemy.y, enemy.radius);
    this.spawnBloodMist(enemy.x, enemy.y, enemy.radius * 0.6);

    const edgeDist = Math.min(enemy.x, enemy.y, this.bounds.width - enemy.x, this.bounds.height - enemy.y);
    if (edgeDist < 120) {
      this.leaveBlood(enemy.x, enemy.y, enemy.radius * 2.0);
    }

    // Combo text
    if (this.combo > 1) {
      this.spawnDamageNumber(enemy.x, enemy.y - enemy.radius - 22, `${this.combo}x COMBO`, "#ffc850");
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

    // Chain Reaction — enemies explode on death
    if (this.progression.hasChainReaction()) {
      const chainRadius = 55;
      this.spawnBurst(enemy.x, enemy.y, "#ff4444", 16, 40, 160);
      for (const other of this.enemies) {
        if (other === enemy || other.fsm.currentState === "DEAD") continue;
        const d = Math.hypot(other.x - enemy.x, other.y - enemy.y);
        if (d < chainRadius) {
          const chainDmg = 15;
          const chainResult = other.takeDamage(chainDmg);
          if (chainResult.hit) {
            this.spawnDamageNumber(other.x, other.y - other.radius - 8, chainDmg, "#ff4444");
          }
          // Chain kills don't re-trigger chain to prevent infinite cascades
        }
      }
    }

    // Boss death — massive effects + boss reward
    if (enemy.isBoss) {
      this.bossDeathFlash = 1;
      this.screenShake = Math.max(this.screenShake, 40);
      for (let bi = 0; bi < 3; bi++) {
        this.spawnDirectionalBlood(enemy.x, enemy.y, Math.random() * Math.PI * 2, 30, 100, 400);
      }
      this.spawnGibs(enemy.x, enemy.y, enemy.radius, enemy.config.bodyColor, 20);
      this.spawnBloodMist(enemy.x, enemy.y, enemy.radius * 2);
      this.spawnBloodMist(enemy.x, enemy.y, enemy.radius * 1.5);
      for (let pi = 0; pi < 3; pi++) {
        this.pickups.push({
          x: enemy.x + randomRange(-30, 30),
          y: enemy.y + randomRange(-30, 30),
          radius: 8,
          type: "health",
          amount: 20,
          life: 12,
          bobPhase: Math.random() * Math.PI * 2,
        });
      }
      this.spawnDamageNumber(enemy.x, enemy.y - enemy.radius - 35, "BOSS SLAIN!", "#ff4444");
      this.activeBoss = null;

      // Trigger boss reward after a brief pause
      setTimeout(() => {
        if (this.state === "playing") this.triggerBossReward(enemy);
      }, 600);
    }
  }

  getComboMultiplier() {
    return Math.min(1 + (this.combo - 1) * 0.25, 5);
  }

  spawnDamageNumber(x, y, text, color) {
    if (!this.settings.get("damageNumbers")) return;
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
        life: 0.3 + Math.random() * 0.6,
        size: 2 + Math.random() * 5,
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
      if (p.life <= 0) {
        // Blood particles leave tiny ground stains
        if (p.isBlood && this.settings.get("blood")) {
          this.bloodTrails.push({
            x: p.x, y: p.y,
            radius: p.size * 0.6,
            alpha: 0.08 + Math.random() * 0.06,
          });
        }
        this.particles.splice(i, 1);
      }
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
    if (!this.settings.get("blood")) return;
    // Main pool — irregular splatter with sub-splatters
    const baseAlpha = 0.18 + Math.random() * 0.14;
    this.bloodPools.push({
      x, y, radius: radius * (0.9 + Math.random() * 0.4),
      alpha: baseAlpha,
      angle: Math.random() * Math.PI * 2,
      stretch: 0.7 + Math.random() * 0.6,
    });
    // Sub-splatters around main pool
    const splats = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < splats; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = radius * (0.6 + Math.random() * 1.0);
      this.bloodPools.push({
        x: x + Math.cos(a) * dist,
        y: y + Math.sin(a) * dist,
        radius: 3 + Math.random() * (radius * 0.5),
        alpha: baseAlpha * (0.5 + Math.random() * 0.5),
        angle: Math.random() * Math.PI * 2,
        stretch: 0.6 + Math.random() * 0.8,
      });
    }
  }

  spawnDirectionalBlood(x, y, angle, count, speedMin, speedMax) {
    if (!this.settings.get("blood")) return;
    const BLOOD_COLORS = ["#8b0000", "#6e0a0a", "#550808", "#3d0000", "#7a1010", "#920000", "#a01515", "#4a0000"];
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 1.4;
      const a = angle + spread;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const big = Math.random() < 0.15;
      this.particles.push({
        x, y,
        vx: Math.cos(a) * speed * (big ? 1.4 : 1),
        vy: Math.sin(a) * speed * (big ? 1.4 : 1),
        life: 0.35 + Math.random() * 0.65,
        size: big ? (5 + Math.random() * 7) : (2 + Math.random() * 5),
        color: BLOOD_COLORS[Math.floor(Math.random() * BLOOD_COLORS.length)],
        isBlood: true,
      });
    }
  }

  spawnGibs(x, y, radius, color, count) {
    if (!this.settings.get("blood")) return;
    const GIB_COLORS = ["#8b0000", "#6e0a0a", "#4a0505", "#3a0303", color, "#5c1010"];
    const GIB_SHAPES = ["chunk", "shard", "round", "strip"];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 100 + Math.random() * 280;
      this.gibs.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 18,
        size: 3 + Math.random() * (radius * 0.55),
        life: 1.5 + Math.random() * 2.0,
        color: GIB_COLORS[Math.floor(Math.random() * GIB_COLORS.length)],
        shape: GIB_SHAPES[Math.floor(Math.random() * GIB_SHAPES.length)],
        trailTimer: 0,
      });
    }
  }

  spawnBloodMist(x, y, radius) {
    if (!this.settings.get("blood")) return;
    const count = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      this.bloodMist.push({
        x: x + (Math.random() - 0.5) * radius * 2,
        y: y + (Math.random() - 0.5) * radius * 2,
        radius: radius * (1.5 + Math.random() * 2.0),
        alpha: 0.25 + Math.random() * 0.15,
        life: 1.8 + Math.random() * 1.2,
        maxLife: 3.0,
      });
    }
  }

  updateGibs(delta) {
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i];
      g.x += g.vx * delta;
      g.y += g.vy * delta;
      g.vx *= 0.92;
      g.vy *= 0.92;
      g.rotation += g.rotSpeed * delta;
      g.life -= delta;
      // Leave tiny blood drops along gib path
      g.trailTimer -= delta;
      if (g.trailTimer <= 0 && this.settings.get("blood")) {
        g.trailTimer = 0.06;
        this.bloodTrails.push({
          x: g.x, y: g.y,
          radius: 1 + Math.random() * 2,
          alpha: 0.12 + Math.random() * 0.08,
        });
      }
      if (g.life <= 0) {
        // Leave small blood splat where gib lands
        this.leaveBlood(g.x, g.y, g.size * 0.6);
        this.gibs.splice(i, 1);
      }
    }
  }

  updateBloodMist(delta) {
    for (let i = this.bloodMist.length - 1; i >= 0; i--) {
      const m = this.bloodMist[i];
      m.life -= delta;
      m.radius += delta * 15;
      m.alpha = Math.max(0, m.alpha * (m.life / m.maxLife));
      if (m.life <= 0) this.bloodMist.splice(i, 1);
    }
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
    this.ui.showLevelUp(false);
    this.ui.showBossReward(false);
    this.ui.showLoadout(false);
    this.ui.showHudHint(false);
    this.gameSpeed = 1;
    this.loadoutOpen = false;
    this.progression.levelUpActive = false;
    this.progression.bossRewardActive = false;
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
    const bt = this.bgTransform;

    // Draw background image (cover + zoom)
    if (this.bgImg.naturalWidth) {
      ctx.drawImage(this.bgImg, bt.x, bt.y, bt.w, bt.h);
      // Subtle vignette darkening at edges for gameplay clarity
      const vig = ctx.createRadialGradient(
        bounds.width * 0.5, bounds.height * 0.5, bounds.width * 0.25,
        bounds.width * 0.5, bounds.height * 0.5, bounds.width * 0.75,
      );
      vig.addColorStop(0, "rgba(0,0,0,0)");
      vig.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, bounds.width, bounds.height);
    } else {
      // Fallback while image loads
      ctx.fillStyle = "#1a1a1a";
      ctx.fillRect(0, 0, bounds.width, bounds.height);
    }

    // Blood trails (tiny drips from gibs and blood particles)
    if (this.settings.get("blood")) {
      for (const t of this.bloodTrails) {
        ctx.fillStyle = `rgba(90,10,12,${t.alpha})`;
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Blood pools (irregular splatters)
    if (this.settings.get("blood")) {
      for (const pool of this.bloodPools) {
        ctx.save();
        ctx.translate(pool.x, pool.y);
        ctx.rotate(pool.angle || 0);
        ctx.scale(pool.stretch || 1, 1);
        ctx.fillStyle = `rgba(110,14,18,${pool.alpha})`;
        ctx.beginPath();
        ctx.arc(0, 0, pool.radius, 0, Math.PI * 2);
        ctx.fill();
        // Darker inner core
        ctx.fillStyle = `rgba(60,6,8,${pool.alpha * 0.7})`;
        ctx.beginPath();
        ctx.arc(0, 0, pool.radius * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Ambient dust
    for (const d of this.ambientDust) {
      ctx.fillStyle = `rgba(160,150,130,${d.alpha * 0.4})`;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  renderGibs() {
    if (!this.settings.get("blood") || this.gibs.length === 0) return;
    const { ctx } = this;

    for (const g of this.gibs) {
      const alpha = clamp(g.life / 0.8, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(g.x, g.y);
      ctx.rotate(g.rotation);

      ctx.fillStyle = g.color;
      const s = g.size;

      if (g.shape === "shard") {
        // Sharp bone-like shard
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.4, 0);
        ctx.lineTo(0, s * 1.2);
        ctx.lineTo(-s * 0.3, 0);
        ctx.closePath();
        ctx.fill();
      } else if (g.shape === "round") {
        // Fleshy round chunk
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "rgba(180,30,30,0.5)";
        ctx.beginPath();
        ctx.arc(s * 0.15, -s * 0.1, s * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (g.shape === "strip") {
        // Elongated meat strip
        ctx.beginPath();
        ctx.moveTo(-s * 1.2, -s * 0.2);
        ctx.quadraticCurveTo(0, -s * 0.5, s * 1.0, -s * 0.15);
        ctx.lineTo(s * 0.8, s * 0.25);
        ctx.quadraticCurveTo(0, s * 0.4, -s * 1.0, s * 0.2);
        ctx.closePath();
        ctx.fill();
      } else {
        // Default irregular chunk
        ctx.beginPath();
        ctx.moveTo(-s, -s * 0.6);
        ctx.lineTo(s * 0.7, -s * 0.4);
        ctx.lineTo(s, s * 0.5);
        ctx.lineTo(-s * 0.3, s * 0.8);
        ctx.closePath();
        ctx.fill();
      }

      // Wet blood sheen on all gibs
      ctx.fillStyle = "rgba(160,20,20,0.45)";
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Trailing blood drip from gib
      const speed = Math.hypot(g.vx, g.vy);
      if (speed > 30) {
        const trailAngle = Math.atan2(-g.vy, -g.vx);
        ctx.globalAlpha = alpha * 0.3;
        ctx.fillStyle = "#6e0a0a";
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(
          Math.cos(trailAngle - 0.2) * s * 1.5,
          Math.sin(trailAngle - 0.2) * s * 0.5
        );
        ctx.lineTo(
          Math.cos(trailAngle) * s * 2.5,
          Math.sin(trailAngle) * s * 0.3
        );
        ctx.lineTo(
          Math.cos(trailAngle + 0.2) * s * 1.5,
          Math.sin(trailAngle + 0.2) * s * 0.5
        );
        ctx.closePath();
        ctx.fill();
      }

      ctx.restore();
    }
  }

  renderBloodMist() {
    if (!this.settings.get("blood") || this.bloodMist.length === 0) return;
    const { ctx } = this;

    for (const m of this.bloodMist) {
      // Outer haze layer
      const outerGrad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.radius * 1.4);
      outerGrad.addColorStop(0, `rgba(90,5,5,${m.alpha * 0.4})`);
      outerGrad.addColorStop(0.6, `rgba(50,2,2,${m.alpha * 0.15})`);
      outerGrad.addColorStop(1, "rgba(30,0,0,0)");
      ctx.fillStyle = outerGrad;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius * 1.4, 0, Math.PI * 2);
      ctx.fill();

      // Core blood cloud
      const grad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.radius);
      grad.addColorStop(0, `rgba(150,20,20,${m.alpha * 1.2})`);
      grad.addColorStop(0.3, `rgba(120,15,15,${m.alpha * 0.8})`);
      grad.addColorStop(0.7, `rgba(80,8,8,${m.alpha * 0.35})`);
      grad.addColorStop(1, "rgba(60,5,5,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
      ctx.fill();

      // Hot center spot
      const hotGrad = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.radius * 0.3);
      hotGrad.addColorStop(0, `rgba(200,40,40,${m.alpha * 0.5})`);
      hotGrad.addColorStop(1, "rgba(150,20,20,0)");
      ctx.fillStyle = hotGrad;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius * 0.3, 0, Math.PI * 2);
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

      if (p.type === "scrap") {
        // Scrap pickup — golden orb
        ctx.shadowBlur = 14;
        ctx.shadowColor = "#ffc850";

        const pulse = 0.3 + Math.sin(t * 4 + p.bobPhase) * 0.15;
        ctx.strokeStyle = `rgba(255,200,80,${pulse})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius + 3, 0, Math.PI * 2);
        ctx.stroke();

        const orbGrad = ctx.createRadialGradient(0, 0, 1, 0, 0, p.radius);
        orbGrad.addColorStop(0, "#fff4cc");
        orbGrad.addColorStop(0.5, "#ffc850");
        orbGrad.addColorStop(1, "#aa7722");
        ctx.fillStyle = orbGrad;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();

        // Diamond symbol
        ctx.fillStyle = "#ffffff";
        ctx.globalAlpha = fadeAlpha * 0.7;
        ctx.beginPath();
        ctx.moveTo(0, -3.5);
        ctx.lineTo(3, 0);
        ctx.lineTo(0, 3.5);
        ctx.lineTo(-3, 0);
        ctx.closePath();
        ctx.fill();
      } else {
        // Health pickup — green orb
        ctx.shadowBlur = 20;
        ctx.shadowColor = "#78ff78";

        const pulse = 0.3 + Math.sin(t * 4 + p.bobPhase) * 0.15;
        ctx.strokeStyle = `rgba(120,255,120,${pulse})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, p.radius + 4 + Math.sin(t * 3) * 2, 0, Math.PI * 2);
        ctx.stroke();

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
      }

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
    const maxTimer = wa.isBoss ? 3.5 : 2.5;
    const alpha = wa.timer > (maxTimer - 0.5)
      ? clamp((maxTimer - wa.timer) * 2, 0, 1)
      : clamp(wa.timer / 1.5, 0, 1);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (wa.isBoss) {
      // Boss wave — dramatic red-tinted announcement
      const bossColor = wa.bossColor || "#ff3030";
      const t = performance.now() * 0.001;
      const pulse = 0.8 + Math.sin(t * 4) * 0.2;

      // Dark overlay for emphasis
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.25})`;
      ctx.fillRect(0, 0, bounds.width, bounds.height);

      // Large title
      ctx.font = 'bold 64px "Orbitron", "Arial Black", sans-serif';
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillText(wa.text, bounds.width / 2 + 2, bounds.height / 2 - 12);
      ctx.fillStyle = bossColor;
      ctx.shadowBlur = 40;
      ctx.shadowColor = bossColor;
      ctx.globalAlpha = alpha * pulse;
      ctx.fillText(wa.text, bounds.width / 2, bounds.height / 2 - 14);

      // Boss subtitle
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 22px "Orbitron", sans-serif';
      ctx.shadowBlur = 20;
      ctx.fillStyle = bossColor;
      ctx.fillText(wa.subtext || "BOSS INCOMING", bounds.width / 2, bounds.height / 2 + 30);

      // Warning lines
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(${parseInt(bossColor.slice(1, 3), 16)},${parseInt(bossColor.slice(3, 5), 16)},${parseInt(bossColor.slice(5, 7), 16)},${0.15 * alpha})`;
      ctx.lineWidth = 1;
      const lineW = 180;
      const lineY = bounds.height / 2 + 52;
      ctx.beginPath();
      ctx.moveTo(bounds.width / 2 - lineW, lineY);
      ctx.lineTo(bounds.width / 2 + lineW, lineY);
      ctx.stroke();
    } else {
      // Normal wave announcement
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
    }

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

    // Combo number — offset down when boss indicator is visible
    let comboY = 20;
    if (this.state === "playing" && this.waveSpawner.wave > 0) {
      const noActiveBoss = !this.activeBoss || this.activeBoss.fsm.currentState === "DEAD";
      const wl = this.waveSpawner.wavesUntilBoss();
      if (noActiveBoss && wl !== Infinity && wl !== 0) comboY = 78;
    }
    ctx.font = 'bold 42px "Orbitron", "Arial Black", sans-serif';
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillText(comboText, bounds.width - 22, comboY + 2);
    ctx.fillStyle = this.combo >= 10 ? "#ff3355" : this.combo >= 5 ? "#ffc850" : "#00ff88";
    ctx.shadowBlur = 20;
    ctx.shadowColor = "rgba(0,255,136,0.4)";
    ctx.fillText(comboText, bounds.width - 20, comboY);

    // Multiplier
    ctx.font = '14px "Inter", sans-serif';
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(0,255,136,0.5)";
    ctx.fillText(multText, bounds.width - 20, comboY + 44);

    ctx.restore();
  }

  /** Render the boss health bar at the top of the screen when a boss is alive. */
  renderBossHealthBar() {
    const boss = this.activeBoss;
    if (!boss || boss.fsm.currentState === "DEAD") return;

    const { ctx, bounds } = this;
    const t = performance.now() * 0.001;
    const anim = clamp(this.bossHealthBarAnim, 0, 1);
    const easeAnim = 1 - Math.pow(1 - anim, 3); // ease-out cubic

    ctx.save();

    // Slide down from top
    const slideY = -40 + easeAnim * 40;
    ctx.globalAlpha = easeAnim;

    const barW = Math.min(400, bounds.width * 0.4);
    const barH = 10;
    const barX = (bounds.width - barW) / 2;
    const barY = 28 + slideY;
    const hpPct = clamp(boss.health / boss.maxHealth, 0, 1);

    const gc = boss.config.bossGlowColor || "#ff3030";
    const r = parseInt(gc.slice(1, 3), 16);
    const g = parseInt(gc.slice(3, 5), 16);
    const b = parseInt(gc.slice(5, 7), 16);

    // Background with subtle dark glow
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath();
    ctx.roundRect(barX - 3, barY - 3, barW + 6, barH + 6, 6);
    ctx.fill();

    // Border with boss color
    const borderPulse = 0.3 + Math.sin(t * 3) * 0.1;
    ctx.strokeStyle = `rgba(${r},${g},${b},${borderPulse})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(barX - 3, barY - 3, barW + 6, barH + 6, 6);
    ctx.stroke();

    // Health fill with gradient
    if (hpPct > 0) {
      const fillGrad = ctx.createLinearGradient(barX, barY, barX + barW * hpPct, barY);
      fillGrad.addColorStop(0, gc);
      fillGrad.addColorStop(1, `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 30)},${Math.min(255, b + 30)},1)`);
      ctx.fillStyle = fillGrad;
      ctx.shadowBlur = 12;
      ctx.shadowColor = gc;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * hpPct, barH, 4);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Shiny highlight line
      ctx.fillStyle = `rgba(255,255,255,0.15)`;
      ctx.beginPath();
      ctx.roundRect(barX, barY, barW * hpPct, barH * 0.35, [4, 4, 0, 0]);
      ctx.fill();
    }

    // Boss name above bar
    const bossTitle = boss.config.bossTitle || boss.config.label.toUpperCase();
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.font = 'bold 12px "Orbitron", monospace';
    ctx.fillStyle = `rgba(${r},${g},${b},0.8)`;
    ctx.fillText(bossTitle, bounds.width / 2, barY - 6);

    // HP percentage on the right
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = '600 10px "Inter", sans-serif';
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.fillText(`${Math.ceil(hpPct * 100)}%`, barX + barW + 30, barY + barH / 2);

    ctx.restore();
  }

  /** Render the next-boss indicator widget (top-right, scales with urgency). */
  renderBossIndicator() {
    if (this.state !== "playing" || this.waveSpawner.wave === 0) return;
    if (this.activeBoss && this.activeBoss.fsm.currentState !== "DEAD") return;

    const wavesLeft = this.waveSpawner.wavesUntilBoss();
    if (wavesLeft === Infinity || wavesLeft === 0) return;

    const { ctx, bounds } = this;
    const t = this.bossIndicatorPulse;
    const nextBossConfig = this.waveSpawner.nextBossConfig();
    if (!nextBossConfig) return;

    const gc = nextBossConfig.bossGlowColor || "#ff3030";
    const cr = parseInt(gc.slice(1, 3), 16);
    const cg = parseInt(gc.slice(3, 5), 16);
    const cb = parseInt(gc.slice(5, 7), 16);

    const maxDist = this.waveSpawner.config.bossInterval;
    const urgency = clamp(1 - (wavesLeft - 1) / (maxDist - 1), 0, 1);

    ctx.save();

    // --- Screen-edge warning at high urgency ---
    if (urgency > 0.55) {
      const edgeAlpha = (urgency - 0.55) * 0.35 + Math.sin(t * 2.5) * urgency * 0.06;
      const edgeW = 3 + urgency * 4;
      // Right and top edge strips
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${clamp(edgeAlpha, 0, 0.25)})`;
      ctx.fillRect(bounds.width - edgeW, 0, edgeW, bounds.height);
      ctx.fillRect(0, 0, bounds.width, edgeW * 0.6);
    }

    // Widget sizing — grows slightly with urgency
    const W = 186 + urgency * 10;
    const H = 54 + urgency * 4;
    const pad = 12;
    const x0 = bounds.width - W - pad;
    const y0 = pad;

    // Outer glow at high urgency
    if (urgency > 0.35) {
      ctx.shadowBlur = 12 + urgency * 18;
      ctx.shadowColor = `rgba(${cr},${cg},${cb},${(urgency - 0.35) * 0.5})`;
    }

    // Panel background
    ctx.fillStyle = `rgba(6,6,6,${0.5 + urgency * 0.25})`;
    ctx.beginPath();
    ctx.roundRect(x0, y0, W, H, 8);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Panel border — pulses at high urgency
    const borderAlpha = 0.15 + urgency * 0.5;
    const borderPulse = urgency > 0.5
      ? borderAlpha + Math.sin(t * 3.5) * urgency * 0.2
      : borderAlpha;
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},${clamp(borderPulse, 0, 1)})`;
    ctx.lineWidth = 1.5 + urgency * 1;
    ctx.beginPath();
    ctx.roundRect(x0, y0, W, H, 8);
    ctx.stroke();

    // Warning stripe on left edge of panel
    const stripeW = 3 + urgency * 1.5;
    const stripeAlpha = 0.3 + urgency * 0.5 + (urgency > 0.6 ? Math.sin(t * 4) * 0.15 : 0);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${clamp(stripeAlpha, 0, 1)})`;
    ctx.beginPath();
    ctx.roundRect(x0, y0, stripeW, H, [8, 0, 0, 8]);
    ctx.fill();

    // --- Skull icon ---
    const ix = x0 + 18;
    const iy = y0 + H / 2;
    const iSz = 10 + urgency * 3;
    const iPulse = 0.5 + urgency * 0.4 + (urgency > 0.4 ? Math.sin(t * 3) * 0.15 : 0);

    ctx.fillStyle = `rgba(${cr},${cg},${cb},${iPulse})`;
    ctx.beginPath();
    ctx.arc(ix, iy - 1, iSz * 0.75, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(ix - iSz * 0.35, iy + iSz * 0.35, iSz * 0.7, iSz * 0.3);

    ctx.fillStyle = "rgba(0,0,0,0.75)";
    ctx.beginPath();
    ctx.arc(ix - iSz * 0.24, iy - 2, iSz * 0.18, 0, Math.PI * 2);
    ctx.arc(ix + iSz * 0.24, iy - 2, iSz * 0.18, 0, Math.PI * 2);
    ctx.fill();

    if (urgency > 0.25) {
      const eGlow = (urgency - 0.25) * 1.3;
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${clamp(eGlow, 0, 1)})`;
      ctx.beginPath();
      ctx.arc(ix - iSz * 0.24, iy - 2, iSz * 0.1, 0, Math.PI * 2);
      ctx.arc(ix + iSz * 0.24, iy - 2, iSz * 0.1, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- Text area ---
    const tx = x0 + 36;
    const maxTextW = W - 36 - 10;

    // Boss name
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const nameFontSize = 10 + urgency * 1.5;
    ctx.font = `bold ${nameFontSize}px "Orbitron", monospace`;
    const name = nextBossConfig.bossTitle || nextBossConfig.label.toUpperCase();
    let displayName = name;
    while (ctx.measureText(displayName).width > maxTextW && displayName.length > 4) {
      displayName = displayName.slice(0, -1);
    }
    if (displayName !== name) displayName += "\u2026";
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${0.6 + urgency * 0.35})`;
    ctx.fillText(displayName, tx, y0 + 9);

    // Wave counter or WARNING
    const counterFontSize = 11 + urgency * 1.5;
    ctx.font = `700 ${counterFontSize}px "Inter", sans-serif`;
    if (wavesLeft <= 1) {
      const flash = 0.5 + Math.sin(t * 6) * 0.5;
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${clamp(flash, 0.2, 1)})`;
      ctx.fillText("\u26A0 WARNING", tx, y0 + 26);
    } else if (wavesLeft <= 2) {
      const pulse = 0.7 + Math.sin(t * 3) * 0.2;
      ctx.fillStyle = `rgba(${cr},${cg},${cb},${pulse})`;
      ctx.fillText(`IN ${wavesLeft} WAVES`, tx, y0 + 26);
    } else {
      ctx.fillStyle = `rgba(255,255,255,${0.4 + urgency * 0.3})`;
      ctx.fillText(`IN ${wavesLeft} WAVES`, tx, y0 + 26);
    }

    // Progress bar at bottom
    const pbX = x0 + 7;
    const pbY = y0 + H - 6;
    const pbW = W - 14;
    const pbH = 3;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.roundRect(pbX, pbY, pbW, pbH, 1.5);
    ctx.fill();
    const barAlpha = 0.3 + urgency * 0.55 + (urgency > 0.7 ? Math.sin(t * 4) * 0.1 : 0);
    ctx.fillStyle = `rgba(${cr},${cg},${cb},${clamp(barAlpha, 0, 1)})`;
    ctx.beginPath();
    ctx.roundRect(pbX, pbY, pbW * urgency, pbH, 1.5);
    ctx.fill();

    ctx.restore();
  }

  /** Screen flash when boss is killed. */
  renderBossDeathFlash() {
    if (this.bossDeathFlash <= 0) return;
    const { ctx, bounds } = this;
    ctx.save();
    ctx.globalAlpha = this.bossDeathFlash * 0.35;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, bounds.width, bounds.height);
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

    // ---- XP bar (below health bar) ----
    const xpW = 200;
    const xpH = 5;
    const xpX = (bounds.width - xpW) / 2;
    const xpY = barY + barH + 8;
    const xpPct = clamp(this.progression.xp / this.progression.xpMax, 0, 1);

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.roundRect(xpX - 1, xpY - 1, xpW + 2, xpH + 2, 3);
    ctx.fill();

    // Border
    ctx.strokeStyle = "rgba(107,224,214,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(xpX - 1, xpY - 1, xpW + 2, xpH + 2, 3);
    ctx.stroke();

    if (xpPct > 0) {
      ctx.fillStyle = "#6be0d6";
      ctx.shadowBlur = 6;
      ctx.shadowColor = "rgba(107,224,214,0.4)";
      ctx.beginPath();
      ctx.roundRect(xpX, xpY, xpW * xpPct, xpH, 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Level badge (left of XP bar)
    ctx.font = '700 11px "Inter", sans-serif';
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(107,224,214,0.85)";
    ctx.fillText(`LV ${this.progression.level}`, xpX - 8, xpY + xpH / 2);

    // Scrap counter (right of XP bar)
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(255,200,80,0.85)";
    ctx.fillText(`${this.progression.scrap} SCRAP`, xpX + xpW + 8, xpY + xpH / 2);

    // ---- Top-left: Score + Wave (below brand corner) ----
    const tlX = 16;
    const tlY = 34;

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

    // ---- FPS counter (top-right) ----
    if (this.settings.get("showFps")) {
      let fpsY = 16;
      // Push below boss indicator widget when it's visible
      if (this.state === "playing" && this.waveSpawner.wave > 0) {
        const noActiveBoss = !this.activeBoss || this.activeBoss.fsm.currentState === "DEAD";
        const wl = this.waveSpawner.wavesUntilBoss();
        if (noActiveBoss && wl !== Infinity && wl !== 0) fpsY = 78;
      }
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.font = '600 11px "Share Tech Mono", monospace';
      ctx.fillStyle = "rgba(0,255,136,0.45)";
      ctx.fillText(`${this.fpsDisplay} FPS`, bounds.width - 16, fpsY);
    }

    // ---- Dev mode indicator ----
    if (this.settings.get("devMode")) {
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = 'bold 10px "Share Tech Mono", monospace';
      ctx.fillStyle = "rgba(255,0,255,0.6)";
      ctx.fillText("DEV MODE", 16, bounds.height - 58);
    }

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
    const shakeMag = this.settings.get("screenShake") ? this.screenShake : 0;
    const shakeX = (Math.random() - 0.5) * shakeMag;
    const shakeY = (Math.random() - 0.5) * shakeMag;

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

    // Gibs (flying body chunks)
    this.renderGibs();

    // Blood mist (death clouds)
    this.renderBloodMist();

    // Damage numbers
    this.renderDamageNumbers();

    // Vignette overlay
    this.renderVignette();

    // Wave announcement
    this.renderWaveAnnouncement();

    // Combo overlay
    this.renderComboOverlay();

    // Boss health bar (top of screen)
    this.renderBossHealthBar();

    // Boss indicator widget (bottom-right)
    this.renderBossIndicator();

    // Boss death flash
    this.renderBossDeathFlash();

    // In-game HUD
    this.renderHud();

    // Toast notifications
    this.renderToasts();

    // Debug obstacle overlay (dev mode only)
    if (this.settings.get("devMode") && this.settings.get("devShowObstacles")) {
      ctx.save();
      for (const obs of this.obstacles) {
        const r = obs.r || [0,0,0,0];
        ctx.save();
        if (obs.rot) { ctx.translate(obs.cx, obs.cy); ctx.rotate(obs.rot); ctx.translate(-obs.cx, -obs.cy); }
        ctx.strokeStyle = "rgba(255,0,0,0.6)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        const hasR = Array.isArray(r) ? r.some(v => v > 0.5) : r > 0.5;
        if (hasR) {
          let tl, tr, bl, br;
          if (Array.isArray(r)) { [tl, tr, bl, br] = r; } else { tl = tr = bl = br = r; }
          const hw = obs.w / 2, hh = obs.h / 2;
          tl = Math.min(tl, hw, hh); tr = Math.min(tr, hw, hh);
          bl = Math.min(bl, hw, hh); br = Math.min(br, hw, hh);
          ctx.beginPath();
          ctx.moveTo(obs.x + tl, obs.y);
          ctx.lineTo(obs.x + obs.w - tr, obs.y); ctx.quadraticCurveTo(obs.x + obs.w, obs.y, obs.x + obs.w, obs.y + tr);
          ctx.lineTo(obs.x + obs.w, obs.y + obs.h - br); ctx.quadraticCurveTo(obs.x + obs.w, obs.y + obs.h, obs.x + obs.w - br, obs.y + obs.h);
          ctx.lineTo(obs.x + bl, obs.y + obs.h); ctx.quadraticCurveTo(obs.x, obs.y + obs.h, obs.x, obs.y + obs.h - bl);
          ctx.lineTo(obs.x, obs.y + tl); ctx.quadraticCurveTo(obs.x, obs.y, obs.x + tl, obs.y);
          ctx.closePath();
          ctx.stroke();
          ctx.fillStyle = "rgba(255,0,0,0.08)";
          ctx.fill();
        } else {
          ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
          ctx.fillStyle = "rgba(255,0,0,0.08)";
          ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        }
        if (obs.label) {
          ctx.setLineDash([]);
          ctx.font = "10px monospace";
          ctx.fillStyle = "rgba(255,100,100,0.8)";
          ctx.fillText(obs.label, obs.x + 4, obs.y + 12);
        }
        ctx.restore();
      }
      ctx.restore();
    }

    // Pause overlay
    if (this.state === "paused") {
      ctx.fillStyle = "rgba(4,8,4,0.3)";
      ctx.fillRect(0, 0, bounds.width, bounds.height);
    }
  }
}

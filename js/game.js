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
    this.bossHitStop = 0;             // freeze frames on boss death

    // Progression system
    this.progression = new Progression();
    this.gameSpeed = 1;                // 1 = normal, 0 = fully paused
    this.loadoutOpen = false;
    this.levelUpReadyAt = 0;           // misclick prevention timestamp
    this.levelUpQueue = 0;             // queued level-up count
    this.upgradeCountdown = 0;         // seconds remaining on pause countdown
    this.upgradeTransition = 0;        // seconds remaining on speed-return transition
    this.upgradeTransitionDur = 7;     // total transition duration
    this.upgradePauseDur = 7;          // total pause countdown duration

    // Pickup images
    this.hpImg = new Image(); this.hpImg.src = "assets/images/dropables/hp.png";
    this.scrapImg = new Image(); this.scrapImg.src = "assets/images/dropables/scrap.png";

    // Gib particle images
    this.gibImgs = [new Image(), new Image(), new Image()];
    this.gibImgs[0].src = "assets/images/particle-drops/mixed-chunk.png";
    this.gibImgs[1].src = "assets/images/particle-drops/flesh-chunk.png";
    this.gibImgs[2].src = "assets/images/particle-drops/bloody-fragment.png";

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
    this.bossHitStop = 0;
    this.waveAnnouncement = { text: "", timer: 0 };
    this.waveSpawner.reset();
    this.player.reset(this.bounds.width / 2, this.bounds.height / 2);
    // Progression reset — player starts with pistol only
    this.progression.reset();
    this.gameSpeed = 1;
    this.loadoutOpen = false;
    this.levelUpReadyAt = 0;
    this.levelUpQueue = 0;
    this.upgradeCountdown = 0;
    this.upgradeTransition = 0;
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
        this.screenShake = Math.max(this.screenShake, 8);
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

    // Upgrade countdown & time-return transition (runs in real time)
    if (this.state === "playing") {
      const isUpgradeOpen = this.progression.levelUpActive || this.progression.bossRewardActive;
      if (isUpgradeOpen) {
        if (this.upgradeCountdown > 0) {
          // Full pause phase — countdown ticking
          this.upgradeCountdown -= delta;
          this.gameSpeed = 0;
          if (this.upgradeCountdown <= 0) {
            this.upgradeCountdown = 0;
            this.upgradeTransition = this.upgradeTransitionDur;
          }
        } else if (this.upgradeTransition > 0) {
          // Transition phase — speed eases from 0 to 1 over upgradeTransitionDur
          this.upgradeTransition -= delta;
          if (this.upgradeTransition <= 0) {
            this.upgradeTransition = 0;
            this.gameSpeed = 1;
            // Auto-pick first affordable card if player didn't choose
            if (this.progression.levelUpActive || this.progression.bossRewardActive) {
              const cards = this.progression.levelUpActive
                ? this.progression.levelUpCards
                : this.progression.bossRewardCards;
              const pick = cards.findIndex(c => c.scrapCost <= 0 || this.progression.scrap >= c.scrapCost);
              this.selectUpgradeCard(pick >= 0 ? pick : 0);
            }
          } else {
            const t = 1 - (this.upgradeTransition / this.upgradeTransitionDur);
            // Ease-in: slow at first, accelerates
            this.gameSpeed = t * t;
          }
        }
        // Drive DOM countdown overlay
        this.updateCountdownUI();
      } else {
        this.hideCountdownUI();
      }
    } else {
      this.hideCountdownUI();
    }

    if (this.state === "playing") this.update(delta * this.gameSpeed);
    this.render();
    this.input.endFrame();
    requestAnimationFrame(this.loop);
  }

  updateCountdownUI() {
    const el = this.ui.elements;
    const wrap = el.upgradeCountdown;
    if (!wrap) return;
    wrap.classList.remove("hidden");
    wrap.classList.add("visible");

    if (this.upgradeCountdown > 0) {
      // Pause phase
      const secs = Math.ceil(this.upgradeCountdown);
      el.ucNumber.textContent = secs;
      el.ucLabel.textContent = "PAUSED \u2014 CHOOSE NOW";
      el.ucLabel.classList.remove("uc-resuming");
      const pct = (this.upgradeCountdown / this.upgradePauseDur) * 100;
      el.ucBarFill.style.width = pct + "%";
      el.ucBarFill.classList.remove("uc-transition");
    } else if (this.upgradeTransition > 0) {
      // Transition phase
      const pctDone = 1 - (this.upgradeTransition / this.upgradeTransitionDur);
      const speedPct = Math.round(pctDone * pctDone * 100);
      el.ucNumber.textContent = speedPct + "%";
      el.ucLabel.textContent = "RESUMING";
      el.ucLabel.classList.add("uc-resuming");
      el.ucBarFill.style.width = (pctDone * 100) + "%";
      el.ucBarFill.classList.add("uc-transition");
    } else {
      el.ucNumber.textContent = "";
      el.ucLabel.textContent = "";
      el.ucBarFill.style.width = "100%";
    }

    // Queue indicator
    if (this.levelUpQueue > 0) {
      el.ucQueue.textContent = `+${this.levelUpQueue} MORE LEVEL-UP${this.levelUpQueue > 1 ? "S" : ""}`;
    } else {
      el.ucQueue.textContent = "";
    }
  }

  hideCountdownUI() {
    const wrap = this.ui.elements.upgradeCountdown;
    if (!wrap) return;
    wrap.classList.add("hidden");
    wrap.classList.remove("visible");
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

      // Wheel in loadout: switch weapon and refresh stats
      if (event.type === "wheel" && this.loadoutOpen) {
        const weapon = this.player.switchWeaponByStep(event.deltaY > 0 ? 1 : -1);
        this.ui.pushEvent(`${weapon.name} selected.`);
        this.populateLoadout();
        continue;
      }

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
          this.screenShake = Math.max(this.screenShake, 3);
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
    let spread = wpn.spread * mods.spreadMultiplier;
    // Tracking Spray: reduce spread while player is moving
    if (mods._trackingSpray && (Math.abs(this.player.vx) > 10 || Math.abs(this.player.vy) > 10)) {
      spread *= 0.8;
    }

    // Calculate damage
    let damage = wpn.damage * mods.damageMultiplier;
    // Adrenaline: +20% when below 40% HP
    const adrenBonus = this.progression.getAdrenalineBonus(this.player.health, this.player.maxHealth);
    if (adrenBonus > 0) damage *= (1 + adrenBonus);
    // Heat Build: up to +30% based on overdrive ramp
    if (mods.heatDmgBonus > 0) damage *= (1 + mods.heatDmgBonus);
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
        _piercing: mods.piercing || 0,
        _knockback: mods.knockback,
        _blastRadius: mods.blastRadius,
        _isCrit: isCrit,
        _markTarget: mods.markTarget,
        _lightningChain: mods.lightningChain || 0,
        _shockwave: mods.shockwave,
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
          _piercing: mods.piercing || 0,
          _knockback: mods.knockback,
          _blastRadius: mods.blastRadius,
          _isCrit: false,
          _markTarget: mods.markTarget,
          _lightningChain: mods.lightningChain || 0,
          _shockwave: mods.shockwave,
        }));
      }
    }

    if (bullets.length === 0) return;
    this.bullets.push(...bullets);
    this.audio.playShoot(wpn.name);
    this.screenShake = Math.max(this.screenShake, wpn.recoil * 0.5);
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
    this.progression.levelUpActive = false;
    this.progression.bossRewardActive = false;
    this.progression.levelUpCards = [];
    this.progression.bossRewardCards = [];
    this.upgradeCountdown = 0;
    this.upgradeTransition = 0;
    this.gameSpeed = 1;

    this.ui.showLevelUp(false);
    this.ui.showBossReward(false);

    this.ui.pushEvent(`${card.name} acquired.`);
    this.audio.playConfirm();

    // If more queued level-ups remain, trigger the next one
    if (this.levelUpQueue > 0) {
      // Small delay so the player sees the dismiss
      setTimeout(() => this.triggerLevelUp(), 250);
    }
  }

  triggerLevelUp() {
    if (this.progression.levelUpActive || this.progression.bossRewardActive) return;
    if (this.levelUpQueue <= 0) return;
    this.levelUpQueue -= 1;

    const cards = this.progression.buildLevelUpCards();
    if (cards.length === 0) return;  // Pool exhausted
    this.progression.levelUpCards = cards;
    this.progression.levelUpActive = true;
    this.gameSpeed = 0;                       // FULL PAUSE
    this.upgradeCountdown = this.upgradePauseDur;
    this.upgradeTransition = 0;
    this.levelUpReadyAt = Date.now() + 350;
    this.populateCards(cards, this.ui.elements.levelupCards);
    this.ui.showLevelUp(true);
  }

  triggerBossReward(enemy) {
    // If a level-up or boss reward is already active, defer boss reward
    if (this.progression.levelUpActive || this.progression.bossRewardActive) {
      // Retry after a short delay
      setTimeout(() => {
        if (this.state === "playing") this.triggerBossReward(enemy);
      }, 400);
      return;
    }

    // Grant XP burst — don't trigger another level-up from the burst itself
    const xpAmt = this.progression.getXpFromKill(enemy);
    this.progression.xp = Math.min(this.progression.xp + xpAmt, this.progression.xpToNextLevel() - 1);

    const cards = this.progression.buildBossRewardCards();
    if (cards.length === 0) return;
    this.progression.bossRewardCards = cards;
    this.progression.bossRewardActive = true;
    this.gameSpeed = 0;                       // FULL PAUSE
    this.upgradeCountdown = this.upgradePauseDur;
    this.upgradeTransition = 0;
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

    // ---- Determine equipped weapon key ----
    const wpnName = this.player.weapon.name.toLowerCase();
    const equippedKey = wpnName.includes("pistol") ? "pistol"
      : (wpnName.includes("scatter") || wpnName.includes("shotgun")) ? "shotgun"
      : (wpnName.includes("vector") || wpnName.includes("smg")) ? "smg"
      : "pistol";

    // ---- Weapon + upgrade columns ----
    const columns = [
      { label: "PISTOL",  key: "pistol",  weaponName: "Service Pistol",  color: "#00ff88" },
      { label: "SHOTGUN", key: "shotgun", weaponName: "Scatter Cannon",  color: "#ff6633" },
      { label: "SMG",     key: "smg",     weaponName: "Vector SMG",      color: "#6be0d6" },
      { label: "GLOBAL",  key: null,      weaponName: null,              color: "#ffc850" },
    ];

    const groups = this.progression.getAcquiredGrouped();

    el.loadoutColumns.innerHTML = "";
    for (const col of columns) {
      const div = document.createElement("div");
      const isWeapon = col.key !== null;
      const unlocked = isWeapon ? this.progression.weaponsUnlocked[col.key] : true;
      const locked = isWeapon && !unlocked;
      const isEquipped = isWeapon && col.key === equippedKey && unlocked;

      div.className = "loadout-col"
        + (locked ? " col-locked" : "")
        + (isEquipped ? " col-equipped" : "");

      // Icon area (colored circle)
      const icon = `<div class="col-icon" style="--col-color:${col.color}">
        <span class="col-icon-glyph">${isWeapon ? "⬡" : "✦"}</span>
      </div>`;

      // Name
      const name = `<div class="col-name">${col.label}</div>`;

      // Status + equipped badge
      let statusText;
      if (isEquipped) {
        statusText = `<div class="col-status equipped">EQUIPPED</div>`;
      } else if (locked) {
        statusText = `<div class="col-status locked">LOCKED</div>`;
      } else {
        statusText = `<div class="col-status unlocked">ACTIVE</div>`;
      }

      // Upgrades list
      const catKey = isWeapon ? col.label.charAt(0) + col.label.slice(1).toLowerCase() : "Global";
      const catUpgrades = groups[catKey] || [];
      // Also include Rare upgrades in Global column
      const extras = col.key === null ? (groups["Rare"] || []) : [];
      const allUpgrades = [...catUpgrades, ...extras];

      let upgradeHTML = "";
      if (allUpgrades.length > 0) {
        upgradeHTML = allUpgrades.map(u =>
          `<div class="col-upgrade"><span class="col-upgrade-pip" style="background:${col.color}"></span><span>${u.name}</span></div>`
        ).join("");
      } else {
        upgradeHTML = `<div class="col-upgrade col-upgrade-none">${locked ? "—" : "None yet"}</div>`;
      }

      div.innerHTML = `${icon}${name}${statusText}<div class="col-upgrades">${upgradeHTML}</div>`;

      // Click to select weapon for inspection
      if (isWeapon && unlocked) {
        div.style.cursor = "pointer";
        div.addEventListener("click", () => {
          // Find the weapon in player.weapons by matching key
          const idx = this.player.weapons.findIndex(w => {
            const n = w.name.toLowerCase();
            if (col.key === "pistol") return n.includes("pistol");
            if (col.key === "shotgun") return n.includes("scatter") || n.includes("shotgun");
            if (col.key === "smg") return n.includes("vector") || n.includes("smg");
            return false;
          });
          if (idx >= 0) {
            this.player.selectWeapon(idx);
            this.ui.pushEvent(`${this.player.weapon.name} selected.`);
            this.populateLoadout();
          }
        });
      }

      el.loadoutColumns.appendChild(div);
    }

    // ---- Weapon stats label ----
    const equippedCol = columns.find(c => c.key === equippedKey);
    const weaponLabel = equippedCol ? equippedCol.weaponName.toUpperCase() : "PISTOL";
    el.loadoutWeaponLabel.textContent = `CURRENT WEAPON: ${weaponLabel}`;

    // ---- Stats bar (bottom) ----
    const stats = this.progression.getDisplayStats(this.player);
    el.loadoutStats.innerHTML = `
      <div class="loadout-stat"><span class="stat-label">DAMAGE</span><span class="stat-value">${stats.damage}</span></div>
      <div class="loadout-stat"><span class="stat-label">FIRE RATE</span><span class="stat-value">${stats.fireRate}/s</span></div>
      <div class="loadout-stat"><span class="stat-label">MOVE SPD</span><span class="stat-value">${stats.moveSpeed}</span></div>
      <div class="loadout-stat"><span class="stat-label">CRIT</span><span class="stat-value">${stats.critChance}%</span></div>
      <div class="loadout-stat"><span class="stat-label">LEVEL</span><span class="stat-value">${this.progression.level}</span></div>
      <div class="loadout-stat"><span class="stat-label">SCRAP</span><span class="stat-value scrap-val">${this.progression.scrap}</span></div>
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
    // Boss death hit-stop — freeze gameplay briefly
    if (this.bossHitStop > 0) {
      this.bossHitStop -= delta;
      // Still decay visual effects during hit-stop
      this.bossDeathFlash = Math.max(0, this.bossDeathFlash - delta * 2.5);
      this.screenShake = Math.max(0, this.screenShake - delta * 30);
      this.damageVignette = Math.max(0, this.damageVignette - delta * 1.8);
      this.updateParticles(delta);
      this.updateGibs(delta);
      this.updateBloodMist(delta);
      return;
    }

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
    this.screenShake = Math.max(0, this.screenShake - delta * 30);
    this.damageVignette = Math.max(0, this.damageVignette - delta * 1.8);

    // Progression: tick overdrive ramp (SMG continuous fire)
    const isFiringSMG = this.input.mouse.leftDown &&
      (this.player.weapon.name.toLowerCase().includes("vector") || this.player.weapon.name.toLowerCase().includes("smg"));
    this.progression.tickOverdrive(isFiringSMG, delta);

    // Progression: update combo bonuses
    this.progression.updateComboBonuses(this.combo);

    // Progression: tick mark target timers
    this.progression.tickMarks(delta);

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

    // Deferred boss spawn — appears when few normal enemies remain
    const aliveEnemies = this.enemies.filter(e => e.fsm.currentState !== "DEAD").length;
    const deferredBoss = this.waveSpawner.trySpawnBoss(aliveEnemies);
    if (deferredBoss) {
      this.enemies.push(deferredBoss);
      this.resolveEntityObstacles(deferredBoss);
      this.activeBoss = deferredBoss;
      this.bossHealthBarAnim = 0;
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
      const shake = Math.min(15, 6 + amount * 0.3);
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

        // Mark Target bonus — marked enemies take +15% damage
        const markBonus = this.progression.getMarkBonus(enemy.id);
        if (markBonus > 0) bulletDmg = Math.round(bulletDmg * (1 + markBonus));

        // Mark Target — mark this enemy on hit
        if (bullet._markTarget) this.progression.markEnemy(enemy.id);

        // Piercing — bullet passes through instead of dying
        if (bullet._piercing > 0) {
          bullet._piercing -= 1;
          bullet.damage = Math.round(bullet.damage * 0.7); // reduce for next hit
        } else {
          bullet.alive = false;
        }

        // Ricochet — bounce toward next nearest enemy
        if (!bullet.alive && bullet._ricochet > 0) {
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
              _piercing: 0,
              _knockback: bullet._knockback,
              _blastRadius: bullet._blastRadius,
              _markTarget: bullet._markTarget,
              _lightningChain: 0,
              _shockwave: bullet._shockwave,
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
            this.screenShake = Math.max(this.screenShake, 6);
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
          // Lightning Chain — spawn chain bolts to nearby enemies
          if (bullet._lightningChain > 0) {
            const chainTargets = [];
            for (const other of this.enemies) {
              if (other === enemy || other.fsm.currentState === "DEAD") continue;
              const d = Math.hypot(other.x - enemy.x, other.y - enemy.y);
              if (d < 150) chainTargets.push({ enemy: other, dist: d });
            }
            chainTargets.sort((a, b) => a.dist - b.dist);
            const chainCount = Math.min(bullet._lightningChain, chainTargets.length);
            for (let ci = 0; ci < chainCount; ci++) {
              const target = chainTargets[ci].enemy;
              const chainDmg = Math.round(bulletDmg * 0.35);
              const chainResult = target.takeDamage(chainDmg);
              if (chainResult.hit) {
                this.spawnDamageNumber(target.x, target.y - target.radius - 8, chainDmg, "#88ccff");
                this.spawnBurst(target.x, target.y, "#88ccff", 6, 15, 60);
              }
              if (chainResult.killed) this.handleEnemyKill(target, bullet);
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
    this.screenShake = Math.max(this.screenShake, 10);

    // Progression: XP
    const xp = this.progression.getXpFromKill(enemy);
    const levelUps = this.progression.addXp(xp);
    if (levelUps > 0) {
      // Queue all level-ups; triggerLevelUp will show the first
      this.levelUpQueue = (this.levelUpQueue || 0) + levelUps;
      if (!this.progression.levelUpActive && !this.progression.bossRewardActive) {
        this.triggerLevelUp();
      }
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

    // Shockwave — kills push nearby enemies back (shotgun upgrade)
    if (bullet._shockwave && !enemy.isBoss) {
      const swRadius = 80;
      for (const other of this.enemies) {
        if (other === enemy || other.fsm.currentState === "DEAD" || other.isBoss) continue;
        const d = Math.hypot(other.x - enemy.x, other.y - enemy.y);
        if (d < swRadius && d > 0) {
          const pushAngle = Math.atan2(other.y - enemy.y, other.x - enemy.x);
          const pushForce = 90 * (1 - d / swRadius);
          other.x += Math.cos(pushAngle) * pushForce;
          other.y += Math.sin(pushAngle) * pushForce;
          keepCircleInBounds(other, this.bounds);
        }
      }
      this.spawnBurst(enemy.x, enemy.y, "#ffaa33", 10, 30, 100);
    }

    // Freeze Field — kills slow nearby enemies for 1.5s
    if (this.progression.hasFreezeField()) {
      const freezeRadius = 100;
      for (const other of this.enemies) {
        if (other === enemy || other.fsm.currentState === "DEAD") continue;
        const d = Math.hypot(other.x - enemy.x, other.y - enemy.y);
        if (d < freezeRadius) {
          other.slowTimer = 1.5;
          other.slowFactor = 0.4; // 60% slower
        }
      }
      this.spawnBurst(enemy.x, enemy.y, "#88ddff", 12, 25, 90);
    }

    // Boss death — massive effects + boss reward
    if (enemy.isBoss) {
      this.bossDeathFlash = 1;
      this.screenShake = Math.max(this.screenShake, 25);

      // Brief hit-stop freeze for dramatic impact
      this.bossHitStop = 0.35;

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

      // Trigger boss reward after hit-stop + reveal delay
      setTimeout(() => {
        if (this.state === "playing") this.triggerBossReward(enemy);
      }, 1000);
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
      p.age = (p.age || 0) + delta;
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
      const useImage = Math.random() < 0.3 && this.gibImgs.length > 0;
      const gib = {
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 18,
        size: useImage ? (6 + Math.random() * 10) : (3 + Math.random() * (radius * 0.55)),
        life: 1.5 + Math.random() * 2.0,
        color: GIB_COLORS[Math.floor(Math.random() * GIB_COLORS.length)],
        shape: GIB_SHAPES[Math.floor(Math.random() * GIB_SHAPES.length)],
        trailTimer: 0,
      };
      if (useImage) {
        gib.img = this.gibImgs[Math.floor(Math.random() * this.gibImgs.length)];
      }
      this.gibs.push(gib);
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

      const s = g.size;

      // Image-based gib
      if (g.img && g.img.complete && g.img.naturalWidth > 0) {
        ctx.drawImage(g.img, -s, -s, s * 2, s * 2);
      } else if (!g.img) {
        // Procedural gib (original shapes)
        ctx.fillStyle = g.color;

        if (g.shape === "shard") {
          ctx.beginPath();
          ctx.moveTo(0, -s);
          ctx.lineTo(s * 0.4, 0);
          ctx.lineTo(0, s * 1.2);
          ctx.lineTo(-s * 0.3, 0);
          ctx.closePath();
          ctx.fill();
        } else if (g.shape === "round") {
          ctx.beginPath();
          ctx.arc(0, 0, s * 0.7, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(180,30,30,0.5)";
          ctx.beginPath();
          ctx.arc(s * 0.15, -s * 0.1, s * 0.35, 0, Math.PI * 2);
          ctx.fill();
        } else if (g.shape === "strip") {
          ctx.beginPath();
          ctx.moveTo(-s * 1.2, -s * 0.2);
          ctx.quadraticCurveTo(0, -s * 0.5, s * 1.0, -s * 0.15);
          ctx.lineTo(s * 0.8, s * 0.25);
          ctx.quadraticCurveTo(0, s * 0.4, -s * 1.0, s * 0.2);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(-s, -s * 0.6);
          ctx.lineTo(s * 0.7, -s * 0.4);
          ctx.lineTo(s, s * 0.5);
          ctx.lineTo(-s * 0.3, s * 0.8);
          ctx.closePath();
          ctx.fill();
        }

        // Wet blood sheen on procedural gibs
        ctx.fillStyle = "rgba(160,20,20,0.45)";
        ctx.beginPath();
        ctx.arc(0, 0, s * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

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

      // Spawn pop-in scale (first 0.25s)
      const age = p.age || 0;
      const spawnT = Math.min(age / 0.25, 1);
      const spawnScale = spawnT < 1 ? 1.4 - 0.4 * spawnT : 1; // start big, settle to 1

      ctx.save();
      ctx.translate(p.x, p.y + bob);
      ctx.globalAlpha = fadeAlpha * Math.min(spawnT * 4, 1); // fade in quickly

      const isScrap = p.type === "scrap";
      const img = isScrap ? this.scrapImg : this.hpImg;
      const glowColor = isScrap ? "#ffc850" : "#78ff78";
      const drawSize = (isScrap ? 14 : 16) * spawnScale;

      // Pulsing glow ring
      const pulse = 0.3 + Math.sin(t * 4 + p.bobPhase) * 0.15;
      ctx.shadowBlur = 18;
      ctx.shadowColor = glowColor;
      ctx.strokeStyle = glowColor;
      ctx.globalAlpha = fadeAlpha * pulse;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, drawSize + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = fadeAlpha * Math.min(spawnT * 4, 1);

      // Draw the image
      if (img.complete && img.naturalWidth > 0) {
        ctx.shadowBlur = 12;
        ctx.shadowColor = glowColor;
        ctx.drawImage(img, -drawSize, -drawSize, drawSize * 2, drawSize * 2);
        ctx.shadowBlur = 0;
      } else {
        // Fallback: simple colored circle if image not loaded
        ctx.fillStyle = glowColor;
        ctx.beginPath();
        ctx.arc(0, 0, drawSize * 0.6, 0, Math.PI * 2);
        ctx.fill();
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
    const s = this.settings.get("uiScale") || 1.0;

    ctx.save();

    // ---- Bottom-center HUD: [ HEALTH ] [ SCRAP ] [ XP ] ----
    const hudY = bounds.height - Math.round(36 * s);
    const barH = Math.round(16 * s);
    const healthW = Math.round(220 * s);
    const scrapW = Math.round(100 * s);
    const xpW = Math.round(220 * s);
    const gap = Math.round(22 * s);
    const totalW = healthW + gap + scrapW + gap + xpW;
    const startX = (bounds.width - totalW) / 2;

    // == HEALTH BAR (left) ==
    const hpX = startX;
    const hpY = hudY - barH / 2;
    const pct = clamp(this.player.health / this.player.maxHealth, 0, 1);
    const hpFill = pct > 0.6 ? "#00e050" : pct > 0.3 ? "#ffcc00" : "#ff2244";

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.65)";
    ctx.beginPath();
    ctx.roundRect(hpX - 2, hpY - 2, healthW + 4, barH + 4, Math.round(5 * s));
    ctx.fill();

    // Border
    const hpBorder = pct > 0.6 ? "rgba(0,224,80,0.18)" : pct > 0.3 ? "rgba(255,204,0,0.18)" : "rgba(255,80,100,0.18)";
    ctx.strokeStyle = hpBorder;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(hpX - 2, hpY - 2, healthW + 4, barH + 4, Math.round(5 * s));
    ctx.stroke();

    // Fill
    ctx.fillStyle = hpFill;
    ctx.shadowBlur = Math.round(12 * s);
    ctx.shadowColor = hpFill;
    ctx.beginPath();
    ctx.roundRect(hpX, hpY, healthW * pct, barH, Math.round(4 * s));
    ctx.fill();
    ctx.shadowBlur = 0;

    // HP label (left above bar)
    ctx.font = `700 ${Math.round(12 * s)}px "Share Tech Mono", monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = pct > 0.6 ? "rgba(0,224,80,0.65)" : pct > 0.3 ? "rgba(255,204,0,0.65)" : "rgba(255,100,120,0.65)";
    ctx.fillText("HP", hpX, hpY - Math.round(4 * s));

    // HP value (center above bar)
    ctx.font = `600 ${Math.round(12 * s)}px "Inter", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = "rgba(255,255,255,0.8)";
    ctx.shadowBlur = 2;
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.fillText(`${Math.ceil(this.player.health)} / ${this.player.maxHealth}`, hpX + healthW / 2, hpY - Math.round(4 * s));
    ctx.shadowBlur = 0;

    // == SCRAP (center) ==
    const scrapX = hpX + healthW + gap;
    ctx.font = `700 ${Math.round(16 * s)}px "Share Tech Mono", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,200,80,0.95)";
    ctx.shadowBlur = Math.round(10 * s);
    ctx.shadowColor = "rgba(255,200,80,0.4)";
    ctx.fillText(`\u25C6 ${this.progression.scrap}`, scrapX + scrapW / 2, hudY - Math.round(2 * s));
    ctx.shadowBlur = 0;

    // SCRAP label below
    ctx.font = `600 ${Math.round(9 * s)}px "Share Tech Mono", monospace`;
    ctx.fillStyle = "rgba(255,200,80,0.55)";
    ctx.fillText("SCRAP", scrapX + scrapW / 2, hudY + Math.round(12 * s));

    // == XP BAR (right) ==
    const xpBarH = Math.round(12 * s);
    const xpX = scrapX + scrapW + gap;
    const xpY = hudY - xpBarH / 2;
    const xpPct = clamp(this.progression.xp / this.progression.xpToNextLevel(), 0, 1);

    // Background
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.roundRect(xpX - 1, xpY - 1, xpW + 2, xpBarH + 2, Math.round(4 * s));
    ctx.fill();

    // Border
    ctx.strokeStyle = "rgba(140,120,255,0.18)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(xpX - 1, xpY - 1, xpW + 2, xpBarH + 2, Math.round(4 * s));
    ctx.stroke();

    // Fill — purple
    if (xpPct > 0) {
      ctx.fillStyle = "#a78bfa";
      ctx.shadowBlur = Math.round(10 * s);
      ctx.shadowColor = "rgba(167,139,250,0.5)";
      ctx.beginPath();
      ctx.roundRect(xpX, xpY, xpW * xpPct, xpBarH, Math.round(3 * s));
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Level badge (left above XP bar)
    ctx.font = `700 ${Math.round(12 * s)}px "Share Tech Mono", monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "rgba(167,139,250,0.9)";
    ctx.shadowBlur = 2;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.fillText(`LV ${this.progression.level}`, xpX, xpY - Math.round(4 * s));
    ctx.shadowBlur = 0;

    // XP label (right above bar)
    ctx.textAlign = "right";
    ctx.fillStyle = "rgba(167,139,250,0.55)";
    ctx.font = `600 ${Math.round(10 * s)}px "Share Tech Mono", monospace`;
    ctx.fillText("XP", xpX + xpW, xpY - Math.round(4 * s));

    // ---- Top-left: Score + Wave (below brand corner) ----
    const tlX = Math.round(16 * s);
    const tlY = Math.round(34 * s);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";

    // Score
    ctx.font = `bold ${Math.round(20 * s)}px "Orbitron", monospace`;
    ctx.fillStyle = "#00ff88";
    ctx.shadowBlur = Math.round(10 * s);
    ctx.shadowColor = "rgba(0,255,136,0.3)";
    ctx.fillText(this.score.toLocaleString(), tlX, tlY);
    ctx.shadowBlur = 0;

    // Wave label
    ctx.font = `500 ${Math.round(12 * s)}px "Inter", sans-serif`;
    ctx.fillStyle = "rgba(0,255,136,0.45)";
    ctx.fillText(`WAVE ${this.waveSpawner.wave}`, tlX, tlY + Math.round(26 * s));

    // ---- Bottom-left: Weapon ----
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.font = `600 ${Math.round(13 * s)}px "Inter", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.shadowBlur = 2;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.fillText(this.player.weapon.name.toUpperCase(), Math.round(22 * s), bounds.height - Math.round(18 * s));
    ctx.shadowBlur = 0;

    // Weapon indicator dots
    const weapons = this.player.weapons || [];
    for (let i = 0; i < weapons.length; i++) {
      const dotX = Math.round(22 * s) + i * Math.round(16 * s);
      const dotY = bounds.height - Math.round(40 * s);
      const active = weapons[i] === this.player.weapon;
      ctx.fillStyle = active ? "#00ff88" : "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.arc(dotX + Math.round(4 * s), dotY, Math.round(3.5 * s), 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- Bottom-right: Kills ----
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.font = `600 ${Math.round(13 * s)}px "Inter", sans-serif`;
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.shadowBlur = 2;
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.fillText(`${this.player.kills} KILLS`, bounds.width - Math.round(22 * s), bounds.height - Math.round(18 * s));
    ctx.shadowBlur = 0;

    // ---- FPS counter (top-right) ----
    if (this.settings.get("showFps")) {
      let fpsY = Math.round(16 * s);
      // Push below boss indicator widget when it's visible
      if (this.state === "playing" && this.waveSpawner.wave > 0) {
        const noActiveBoss = !this.activeBoss || this.activeBoss.fsm.currentState === "DEAD";
        const wl = this.waveSpawner.wavesUntilBoss();
        if (noActiveBoss && wl !== Infinity && wl !== 0) fpsY = Math.round(78 * s);
      }
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.font = `600 ${Math.round(12 * s)}px "Share Tech Mono", monospace`;
      ctx.fillStyle = "rgba(0,255,136,0.45)";
      ctx.fillText(`${this.fpsDisplay} FPS`, bounds.width - Math.round(16 * s), fpsY);
    }

    // ---- Dev mode indicator ----
    if (this.settings.get("devMode")) {
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = `bold ${Math.round(10 * s)}px "Share Tech Mono", monospace`;
      ctx.fillStyle = "rgba(255,0,255,0.6)";
      ctx.fillText("DEV MODE", Math.round(16 * s), bounds.height - Math.round(58 * s));
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

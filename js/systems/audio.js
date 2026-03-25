const SOUND_FILES = {
  pistol: "./assets/sounds/shoot.mp3",
  scatter: "./assets/sounds/shoot.mp3",
  smg: "./assets/sounds/shootAuto.mp3",
  smgBurst: "./assets/sounds/shootAutoRapidFire.mp3",
  confirm: "./assets/sounds/loadMagazine.mp3",
  enemyHit: "./assets/sounds/enemyHitBloodSound.wav",
  enemyKilled: "./assets/sounds/enemyKilledSound.wav",
  playerHit: "./assets/sounds/playerHit.wav",
  waveStart: "./assets/sounds/newWave.wav",
  gameOver: "./assets/sounds/gameover.wav",
  backgroundMusic: "./assets/sounds/background.mp3",
  dash: "./assets/sounds/dash.wav",
};

export class AudioManager {
  constructor() {
    this.muted = false;
    this.ready = false;
    this.unlockBound = false;
    this.soundEnabled = false;
    this.buffers = new Map();
    this.activeLoops = new Map();
    this.masterVolume = 0.8;
    this.musicVolumePref = 0.5;
    this.sfxVolumePref = 0.8;
  }

  installUnlockHandlers() {
    if (this.unlockBound) return;
    this.unlockBound = true;

    const unlockOnce = async () => {
      await this.unlock();
      if (this.ready) {
        window.removeEventListener("pointerdown", unlockOnce);
        window.removeEventListener("keydown", unlockOnce);
        window.removeEventListener("touchstart", unlockOnce);
      }
    };

    window.addEventListener("pointerdown", unlockOnce, { passive: true });
    window.addEventListener("keydown", unlockOnce);
    window.addEventListener("touchstart", unlockOnce, { passive: true });
  }

  async unlock() {
    this.primeBuffers();
    this.ready = true;
    this.soundEnabled = true;
  }

  primeBuffers() {
    for (const [key, path] of Object.entries(SOUND_FILES)) {
      if (this.buffers.has(key)) continue;
      const audio = new Audio(path);
      audio.preload = "auto";
      audio.volume = this.getVolume(key);
      this.buffers.set(key, audio);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    this.syncLoopVolumes();
    return this.muted;
  }

  getVolume(key) {
    if (this.muted) return 0;
    const master = this.masterVolume;
    if (key === "backgroundMusic") return 0.24 * master * this.musicVolumePref;
    const sfx = this.sfxVolumePref;
    if (key === "smg" || key === "smgBurst") return 0.42 * master * sfx;
    if (key === "confirm") return 0.55 * master * sfx;
    if (key === "dash") return 0.9 * master * sfx;
    return 0.5 * master * sfx;
  }

  syncLoopVolumes() {
    for (const [key, audio] of this.activeLoops) {
      audio.volume = this.getVolume(key);
    }
  }

  playOneShot(key) {
    const template = this.buffers.get(key);
    if (!template || this.muted || !this.soundEnabled) return;
    const instance = template.cloneNode();
    instance.volume = this.getVolume(key);
    instance.currentTime = 0;
    instance.play().catch(() => {});
  }

  playLoop(key) {
    if (this.activeLoops.has(key) || this.muted || !this.soundEnabled) return;
    const template = this.buffers.get(key);
    if (!template) return;
    const loop = template.cloneNode();
    loop.loop = true;
    loop.volume = this.getVolume(key);
    loop.play().catch(() => {});
    this.activeLoops.set(key, loop);
  }

  stopLoop(key) {
    const loop = this.activeLoops.get(key);
    if (!loop) return;
    loop.pause();
    loop.currentTime = 0;
    this.activeLoops.delete(key);
  }

  stopAllLoops() {
    for (const key of [...this.activeLoops.keys()]) this.stopLoop(key);
  }

  startMusic() { this.playLoop("backgroundMusic"); }
  stopMusic() { this.stopAllLoops(); }

  playShoot(weaponName) {
    if (weaponName === "Vector SMG") { this.playOneShot(Math.random() > 0.45 ? "smgBurst" : "smg"); return; }
    if (weaponName === "Scatter Cannon") { this.playOneShot("scatter"); return; }
    this.playOneShot("pistol");
  }

  playEnemyHit() { this.playOneShot("enemyHit"); }
  playEnemyKill() { this.playOneShot("enemyKilled"); }
  playPlayerHit() { this.playOneShot("playerHit"); }
  playDash() { this.playOneShot("dash"); }
  playWaveStart() { this.playOneShot("waveStart"); }
  playGameOver() { this.playOneShot("gameOver"); }
  playConfirm() { this.playOneShot("confirm"); }
}

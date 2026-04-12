const STORAGE_KEY = "deadvector_settings";

const DEFAULTS = {
  masterVolume: 0.8,
  sfxVolume: 0.8,
  musicVolume: 0.5,
  screenShake: true,
  damageNumbers: true,
  blood: true,
  showFps: false,
  uiScale: 1.0,
  devMode: false,
  devInvincible: true,
  devNoclip: false,
  devShowObstacles: false,
};

export class Settings {
  constructor() {
    this.values = { ...DEFAULTS };
    this.load();
  }

  get(key) {
    return this.values[key];
  }

  set(key, value) {
    if (!(key in DEFAULTS)) return;
    this.values[key] = value;
    this.save();
  }

  reset() {
    this.values = { ...DEFAULTS };
    this.save();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      for (const key of Object.keys(DEFAULTS)) {
        if (key in parsed && typeof parsed[key] === typeof DEFAULTS[key]) {
          this.values[key] = parsed[key];
        }
      }
    } catch {
      // Corrupted data — keep defaults
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Storage full or unavailable
    }
  }
}

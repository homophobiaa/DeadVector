import { Game } from "./game.js";
import { InputManager } from "./input.js";
import { AudioManager } from "./systems/audio.js";
import { Settings } from "./systems/settings.js";
import { UIManager } from "./systems/ui.js";
import { preloadZombieParts } from "./entities/zombie-renderer.js";
import { preloadPlayerParts } from "./entities/player-renderer.js";

const bootstrap = async () => {
  const loaderBar = document.getElementById("loader-bar");
  const loaderStatus = document.getElementById("loader-status");
  const loader = document.getElementById("loader");

  const setProgress = (pct, label) => {
    loaderBar.style.width = pct + "%";
    if (label) loaderStatus.textContent = label;
  };

  const mapData = await fetch("./js/map-data.json").then(r => r.json());
  const mapObstacles = Array.isArray(mapData) ? mapData : (mapData.obstacles || []);
  const mapSpawnZones = Array.isArray(mapData) ? [] : (mapData.spawnZones || []);

  // Load optional data configs (weapons, enemies, waves, player)
  const fetchJson = (url) => fetch(url).then(r => r.json()).catch(() => null);
  const [weaponsData, enemiesData, wavesData, playerData] = await Promise.all([
    fetchJson("./js/weapons-data.json"),
    fetchJson("./js/enemies-data.json"),
    fetchJson("./js/waves-data.json"),
    fetchJson("./js/player-data.json"),
  ]);
  setProgress(25, "LOADING ASSETS");

  await Promise.all([
    preloadZombieParts(),
    preloadPlayerParts(),
  ]);
  setProgress(60, "LOADING MAP");

  await new Promise(resolve => {
    const img = new Image();
    img.onload = img.onerror = resolve;
    img.src = "./assets/images/background.png";
  });
  setProgress(85, "STARTING UP");

  const canvas = document.getElementById("game-canvas");

  const ui = new UIManager({
    menuScreen: document.getElementById("menu-screen"),
    pauseScreen: document.getElementById("pause-screen"),
    gameOverScreen: document.getElementById("game-over-screen"),
    settingsScreen: document.getElementById("settings-screen"),
    finalSummary: document.getElementById("final-summary"),
    playButton: document.getElementById("play-button"),
    resumeButton: document.getElementById("resume-button"),
    restartButton: document.getElementById("restart-button"),
    muteButton: document.getElementById("mute-button"),
    settingsButton: document.getElementById("settings-button"),
    pauseSettingsButton: document.getElementById("pause-settings-button"),
    settingsBack: document.getElementById("settings-back"),
    setMasterVol: document.getElementById("set-master-vol"),
    setMusicVol: document.getElementById("set-music-vol"),
    setSfxVol: document.getElementById("set-sfx-vol"),
    setScreenShake: document.getElementById("set-screen-shake"),
    setDamageNumbers: document.getElementById("set-damage-numbers"),
    setBlood: document.getElementById("set-blood"),
    setShowFps: document.getElementById("set-show-fps"),
    setDevMode: document.getElementById("set-dev-mode"),
    devSubOptions: document.getElementById("dev-sub-options"),
    setDevInvincible: document.getElementById("set-dev-invincible"),
    setDevNoclip: document.getElementById("set-dev-noclip"),
    setDevObstacles: document.getElementById("set-dev-obstacles"),
    devWaveControls: document.getElementById("dev-wave-controls"),
    devSkipWave: document.getElementById("dev-skip-wave"),
    devSkipToInput: document.getElementById("dev-skip-to-input"),
    devSkipToGo: document.getElementById("dev-skip-to-go"),
    // Progression screens
    levelupScreen: document.getElementById("levelup-screen"),
    levelupCards: document.getElementById("levelup-cards"),
    bossRewardScreen: document.getElementById("boss-reward-screen"),
    bossRewardCards: document.getElementById("boss-reward-cards"),
    loadoutScreen: document.getElementById("loadout-screen"),
    loadoutColumns: document.getElementById("loadout-columns"),
    loadoutStats: document.getElementById("loadout-stats"),
    hudHint: document.getElementById("hud-hint"),
  });

  const input = new InputManager(canvas);
  const audio = new AudioManager();
  const settings = new Settings();
  audio.installUnlockHandlers();
  const game = new Game({ canvas, input, ui, audio, settings, mapObstacles, mapSpawnZones,
                          weaponsData, enemiesData, wavesData, playerData });

  ui.bindGame(game);
  ui.bindSettings(settings);
  game.applySettings();
  game.resize();
  game.render();

  setProgress(100, "READY");

  // Show menu then fade out loader simultaneously for a seamless reveal
  const menuScreen = document.getElementById("menu-screen");
  menuScreen.classList.remove("hidden");
  menuScreen.classList.add("visible");

  await new Promise(res => setTimeout(res, 180));
  loader.classList.add("fade-out");
  loader.addEventListener("transitionend", () => loader.remove(), { once: true });
};

window.addEventListener("load", bootstrap);

import { Game } from "./game.js";
import { InputManager } from "./input.js";
import { AudioManager } from "./systems/audio.js";
import { Settings } from "./systems/settings.js";
import { UIManager } from "./systems/ui.js";
import { preloadZombieParts } from "./entities/zombie-renderer.js";

const bootstrap = async () => {
  const mapData = await fetch("./js/map-data.json").then(r => r.json());
  const mapObstacles = Array.isArray(mapData) ? mapData : (mapData.obstacles || []);
  const mapSpawnZones = Array.isArray(mapData) ? [] : (mapData.spawnZones || []);
  const [,] = await Promise.all([
    Promise.resolve(),
    preloadZombieParts(),
  ]);

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
  });

  const input = new InputManager(canvas);
  const audio = new AudioManager();
  const settings = new Settings();
  audio.installUnlockHandlers();
  const game = new Game({ canvas, input, ui, audio, settings, mapObstacles, mapSpawnZones });

  ui.bindGame(game);
  ui.bindSettings(settings);
  game.applySettings();
  game.resize();
  game.render();
};

window.addEventListener("load", bootstrap);

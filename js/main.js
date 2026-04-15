import { Game } from "./game.js";
import { InputManager } from "./input.js";
import { AudioManager } from "./systems/audio.js";
import { Settings } from "./systems/settings.js";
import { UIManager } from "./systems/ui.js";
import { DevMenu } from "./systems/dev-menu.js";
import { Guide } from "./systems/guide.js";
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
    quitToMenu: document.getElementById("quit-to-menu"),
    confirmQuitScreen: document.getElementById("confirm-quit-screen"),
    confirmQuitYes: document.getElementById("confirm-quit-yes"),
    confirmQuitCancel: document.getElementById("confirm-quit-cancel"),
    guideButton: document.getElementById("guide-button"),
    guideScreen: document.getElementById("guide-screen"),
    guideTabs: document.getElementById("guide-tabs"),
    guideContent: document.getElementById("guide-content"),
    guideBack: document.getElementById("guide-back"),
    setMasterVol: document.getElementById("set-master-vol"),
    setMusicVol: document.getElementById("set-music-vol"),
    setSfxVol: document.getElementById("set-sfx-vol"),
    setScreenShake: document.getElementById("set-screen-shake"),
    setDamageNumbers: document.getElementById("set-damage-numbers"),
    setBlood: document.getElementById("set-blood"),
    setShowFps: document.getElementById("set-show-fps"),
    setDevMode: document.getElementById("set-dev-mode"),
    // Progression screens
    levelupScreen: document.getElementById("levelup-screen"),
    levelupCards: document.getElementById("levelup-cards"),
    bossRewardScreen: document.getElementById("boss-reward-screen"),
    bossRewardCards: document.getElementById("boss-reward-cards"),
    loadoutScreen: document.getElementById("loadout-screen"),
    loadoutColumns: document.getElementById("loadout-columns"),
    loadoutWeaponLabel: document.getElementById("loadout-weapon-label"),
    loadoutStats: document.getElementById("loadout-stats"),
    hudHint: document.getElementById("hud-hint"),
    setUiScale: document.getElementById("set-ui-scale"),
    uiScaleVal: document.getElementById("ui-scale-val"),
    // Upgrade countdown DOM
    upgradeCountdown: document.getElementById("upgrade-countdown"),
    ucNumber: document.getElementById("uc-number"),
    ucLabel: document.getElementById("uc-label"),
    ucBarFill: document.getElementById("uc-bar-fill"),
    ucQueue: document.getElementById("uc-queue"),
  });

  const input = new InputManager(canvas);
  const audio = new AudioManager();
  const settings = new Settings();
  audio.installUnlockHandlers();
  const game = new Game({ canvas, input, ui, audio, settings, mapObstacles, mapSpawnZones,
                          weaponsData, enemiesData, wavesData, playerData });

  ui.bindGame(game);
  ui.bindSettings(settings);

  const devMenu = new DevMenu({
    root:          document.getElementById("dev-menu"),
    header:        document.getElementById("dev-menu-header"),
    closeBtn:      document.getElementById("dev-menu-close"),
    resize:        document.getElementById("dev-menu-resize"),
    info:          document.getElementById("dm-info"),
    skipWave:      document.getElementById("dm-skip-wave"),
    skip5:         document.getElementById("dm-skip5"),
    gotoInput:     document.getElementById("dm-goto-input"),
    gotoGo:        document.getElementById("dm-goto-go"),
    unlockAll:     document.getElementById("dm-unlock-all"),
    levelUp:       document.getElementById("dm-level-up"),
    giveScrap:     document.getElementById("dm-give-scrap"),
    heal:          document.getElementById("dm-heal"),
    spawnShambler: document.getElementById("dm-spawn-shambler"),
    spawnSprinter: document.getElementById("dm-spawn-sprinter"),
    spawnSpitter:  document.getElementById("dm-spawn-spitter"),
    spawnBrute:    document.getElementById("dm-spawn-brute"),
    spawnScreamer: document.getElementById("dm-spawn-screamer"),
    killAll:       document.getElementById("dm-kill-all"),
    togInvincible: document.getElementById("dm-tog-invincible"),
    togNoclip:     document.getElementById("dm-tog-noclip"),
    togObstacles:  document.getElementById("dm-tog-obstacles"),
  });
  devMenu.bindGame(game);
  devMenu.bindSettings(settings);
  game.devMenu = devMenu;

  // Field Guide
  new Guide({
    tabs: document.getElementById("guide-tabs"),
    content: document.getElementById("guide-content"),
  });

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

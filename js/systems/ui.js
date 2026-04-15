export class UIManager {
  constructor(elements) {
    this.elements = elements;
    this.game = null;
    this.settings = null;
    this.settingsOrigin = "menu";
    this.toasts = [];
    this.maxToasts = 4;

    window.addEventListener("gameStart", () => this.pushEvent("First wave inbound."));
    window.addEventListener("waveComplete", (e) =>
      this.pushEvent(`Wave ${e.detail.wave} cleared.`),
    );
    window.addEventListener("levelUp", (e) =>
      this.pushEvent(`Wave ${e.detail.wave} engaged.`),
    );
    window.addEventListener("gameOver", (e) =>
      this.pushEvent(`Operator down. Score: ${e.detail.score}.`),
    );
  }

  bindGame(game) {
    this.game = game;

    this.elements.playButton.addEventListener("click", async () => {
      await this.game.startNewRun();
    });

    this.elements.resumeButton.addEventListener("click", () => {
      this.game.resume();
    });

    this.elements.restartButton.addEventListener("click", async () => {
      await this.game.startNewRun();
    });

    this.elements.muteButton.addEventListener("click", () => {
      const muted = this.game.toggleMute();
      this.setMuteLabel(muted);
    });

    this.elements.settingsButton.addEventListener("click", () => {
      this.settingsOrigin = "menu";
      this.showMenu(false);
      this.showSettings(true);
    });

    this.elements.pauseSettingsButton.addEventListener("click", () => {
      this.settingsOrigin = "pause";
      this.showPause(false);
      this.showSettings(true);
    });

    this.elements.settingsBack.addEventListener("click", () => {
      this.showSettings(false);
      if (this.settingsOrigin === "pause") {
        this.showPause(true);
      } else {
        this.showMenu(true);
      }
    });

    // Quit to menu — show confirmation
    this.elements.quitToMenu.addEventListener("click", () => {
      this.showPause(false);
      this.showConfirmQuit(true);
    });

    this.elements.confirmQuitYes.addEventListener("click", () => {
      this.showConfirmQuit(false);
      this.game.returnToMenu();
    });

    this.elements.confirmQuitCancel.addEventListener("click", () => {
      this.showConfirmQuit(false);
      this.showPause(true);
    });

    // Guide
    this.elements.guideButton.addEventListener("click", () => {
      this.showMenu(false);
      this.showGuide(true);
    });

    this.elements.guideBack.addEventListener("click", () => {
      this.showGuide(false);
      this.showMenu(true);
    });
  }

  bindSettings(settings) {
    this.settings = settings;
    const el = this.elements;

    // Initialize controls from saved settings
    el.setMasterVol.value = Math.round(settings.get("masterVolume") * 100);
    el.setMusicVol.value = Math.round(settings.get("musicVolume") * 100);
    el.setSfxVol.value = Math.round(settings.get("sfxVolume") * 100);
    el.setScreenShake.checked = settings.get("screenShake");
    el.setDamageNumbers.checked = settings.get("damageNumbers");
    el.setBlood.checked = settings.get("blood");
    el.setShowFps.checked = settings.get("showFps");
    el.setDevMode.checked = settings.get("devMode");

    // UI Scale
    const uiScalePercent = Math.round(settings.get("uiScale") * 100);
    el.setUiScale.value = uiScalePercent;
    el.uiScaleVal.textContent = settings.get("uiScale").toFixed(1) + "x";
    this._applyUiScale(settings.get("uiScale"));

    // Slider handlers
    el.setMasterVol.addEventListener("input", () => {
      settings.set("masterVolume", el.setMasterVol.value / 100);
      if (this.game) this.game.applySettings();
    });
    el.setMusicVol.addEventListener("input", () => {
      settings.set("musicVolume", el.setMusicVol.value / 100);
      if (this.game) this.game.applySettings();
    });
    el.setSfxVol.addEventListener("input", () => {
      settings.set("sfxVolume", el.setSfxVol.value / 100);
      if (this.game) this.game.applySettings();
    });

    // UI Scale handler
    el.setUiScale.addEventListener("input", () => {
      const scale = el.setUiScale.value / 100;
      settings.set("uiScale", scale);
      el.uiScaleVal.textContent = scale.toFixed(1) + "x";
      this._applyUiScale(scale);
    });

    // Toggle handlers
    el.setScreenShake.addEventListener("change", () => {
      settings.set("screenShake", el.setScreenShake.checked);
    });
    el.setDamageNumbers.addEventListener("change", () => {
      settings.set("damageNumbers", el.setDamageNumbers.checked);
    });
    el.setBlood.addEventListener("change", () => {
      settings.set("blood", el.setBlood.checked);
    });
    el.setShowFps.addEventListener("change", () => {
      settings.set("showFps", el.setShowFps.checked);
    });
    el.setDevMode.addEventListener("change", () => {
      settings.set("devMode", el.setDevMode.checked);
      if (this.game) this.game.applySettings();
    });
  }

  setMuteLabel(muted) {
    this.elements.muteButton.textContent = muted ? "\u266B" : "\u266A";
    this.elements.muteButton.style.opacity = muted ? "0.4" : "1";
  }

  updateHud() { /* HUD is now rendered on canvas by Game */ }

  showMenu(visible) { this.toggleElement(this.elements.menuScreen, visible); }
  showPause(visible) {
    this.toggleElement(this.elements.pauseScreen, visible);
  }
  showSettings(visible) { this.toggleElement(this.elements.settingsScreen, visible); }
  showConfirmQuit(visible) { this.toggleElement(this.elements.confirmQuitScreen, visible); }
  showGuide(visible) { this.toggleElement(this.elements.guideScreen, visible); }

  showLevelUp(visible) { this.toggleElement(this.elements.levelupScreen, visible); }
  showBossReward(visible) { this.toggleElement(this.elements.bossRewardScreen, visible); }
  showLoadout(visible) { this.toggleElement(this.elements.loadoutScreen, visible); }
  showHudHint(visible) { this.toggleElement(this.elements.hudHint, visible); }

  showGameOver(visible, summary = "") {
    this.toggleElement(this.elements.gameOverScreen, visible);
    if (summary) this.elements.finalSummary.textContent = summary;
  }

  toggleElement(element, visible) {
    element.classList.toggle("hidden", !visible);
    element.classList.toggle("visible", visible);
  }

  pushEvent(message) {
    this.toasts.push({ text: message, life: 3.5 });
    while (this.toasts.length > this.maxToasts) {
      this.toasts.shift();
    }
  }

  updateToasts(delta) {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      this.toasts[i].life -= delta;
      if (this.toasts[i].life <= 0) this.toasts.splice(i, 1);
    }
  }

  _applyUiScale(scale) {
    document.documentElement.style.setProperty("--ui-scale", scale);
  }

  getUiScale() {
    return this.settings ? this.settings.get("uiScale") : 1.0;
  }
}

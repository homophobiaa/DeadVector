export class UIManager {
  constructor(elements) {
    this.elements = elements;
    this.game = null;
    this.maxFeedItems = 6;

    window.addEventListener("gameStart", () => this.pushEvent("Containment breach opened. First wave inbound."));
    window.addEventListener("waveComplete", (e) =>
      this.pushEvent(`Wave ${e.detail.wave} cleared. Med-kit delivered.`),
    );
    window.addEventListener("levelUp", (e) =>
      this.pushEvent(`Wave ${e.detail.wave} engaged. Threat level rising.`),
    );
    window.addEventListener("gameOver", (e) =>
      this.pushEvent(`Operator down. Score: ${e.detail.score}. Wave: ${e.detail.wave}.`),
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
  }

  setMuteLabel(muted) {
    this.elements.muteButton.textContent = muted ? "Sound: Off" : "Sound: On";
  }

  updateHud(snapshot) {
    this.elements.health.textContent = `${Math.ceil(snapshot.health)} / ${snapshot.maxHealth}`;
    this.elements.score.textContent = snapshot.score.toLocaleString();
    this.elements.wave.textContent = snapshot.wave.toString();
    this.elements.weapon.textContent = snapshot.weapon;
    this.elements.zombies.textContent = `${snapshot.activeZombies} active`;
    this.elements.state.textContent = snapshot.state;
    this.elements.kills.textContent = snapshot.kills.toString();
    this.elements.combo.textContent = snapshot.combo > 1
      ? `${snapshot.combo}x (${snapshot.comboMultiplier.toFixed(1)}x)`
      : "---";

    // Health bar fill
    const healthBar = this.elements.healthBar;
    if (healthBar) {
      const pct = (snapshot.health / snapshot.maxHealth) * 100;
      healthBar.style.width = `${pct}%`;
      healthBar.style.background = pct > 60
        ? "linear-gradient(90deg, #5a5, #6c6)"
        : pct > 30
          ? "linear-gradient(90deg, #c90, #da5)"
          : "linear-gradient(90deg, #c33, #e55)";
    }
  }

  showMenu(visible) { this.toggleElement(this.elements.menuScreen, visible); }
  showPause(visible) { this.toggleElement(this.elements.pauseScreen, visible); }

  showGameOver(visible, summary = "") {
    this.toggleElement(this.elements.gameOverScreen, visible);
    if (summary) this.elements.finalSummary.textContent = summary;
  }

  toggleElement(element, visible) {
    element.classList.toggle("hidden", !visible);
    element.classList.toggle("visible", visible);
  }

  pushEvent(message) {
    const item = document.createElement("li");
    item.textContent = message;
    this.elements.eventFeed.prepend(item);
    while (this.elements.eventFeed.children.length > this.maxFeedItems) {
      this.elements.eventFeed.removeChild(this.elements.eventFeed.lastElementChild);
    }
  }
}

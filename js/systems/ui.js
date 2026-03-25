export class UIManager {
  constructor(elements) {
    this.elements = elements;
    this.game = null;
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
  }

  setMuteLabel(muted) {
    this.elements.muteButton.textContent = muted ? "\u266B" : "\u266A";
    this.elements.muteButton.style.opacity = muted ? "0.4" : "1";
  }

  updateHud() { /* HUD is now rendered on canvas by Game */ }

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
}

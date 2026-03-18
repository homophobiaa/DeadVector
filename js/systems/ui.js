export class UIManager {
  constructor(elements) {
    this.elements = elements;
    this.game = null;
    this.maxFeedItems = 6;

    window.addEventListener("gameStart", () => this.pushEvent("Containment breach opened. First wave inbound."));
    window.addEventListener("waveComplete", (event) =>
      this.pushEvent(`Wave ${event.detail.wave} cleared. Field med-kit delivered.`),
    );
    window.addEventListener("levelUp", (event) =>
      this.pushEvent(`Wave ${event.detail.wave} engaged. Threat rating rising.`),
    );
    window.addEventListener("gameOver", (event) =>
      this.pushEvent(`Operator down. Final score ${event.detail.score}.`),
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
    this.elements.muteButton.textContent = muted ? "Mute: On" : "Mute: Off";
  }

  updateHud(snapshot) {
    this.elements.health.textContent = `${Math.ceil(snapshot.health)} / ${snapshot.maxHealth}`;
    this.elements.score.textContent = snapshot.score.toString();
    this.elements.wave.textContent = snapshot.wave.toString();
    this.elements.weapon.textContent = snapshot.weapon;
    this.elements.zombies.textContent = `${snapshot.activeZombies} active`;
    this.elements.state.textContent = snapshot.state;
  }

  showMenu(visible) {
    this.toggleElement(this.elements.menuScreen, visible);
  }

  showPause(visible) {
    this.toggleElement(this.elements.pauseScreen, visible);
  }

  showGameOver(visible, summary = "") {
    this.toggleElement(this.elements.gameOverScreen, visible);

    if (summary) {
      this.elements.finalSummary.textContent = summary;
    }
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

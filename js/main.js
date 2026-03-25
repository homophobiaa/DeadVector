import { Game } from "./game.js";
import { InputManager } from "./input.js";
import { AudioManager } from "./systems/audio.js";
import { UIManager } from "./systems/ui.js";

const bootstrap = () => {
  const canvas = document.getElementById("game-canvas");

  const ui = new UIManager({
    menuScreen: document.getElementById("menu-screen"),
    pauseScreen: document.getElementById("pause-screen"),
    gameOverScreen: document.getElementById("game-over-screen"),
    finalSummary: document.getElementById("final-summary"),
    playButton: document.getElementById("play-button"),
    resumeButton: document.getElementById("resume-button"),
    restartButton: document.getElementById("restart-button"),
    muteButton: document.getElementById("mute-button"),
  });

  const input = new InputManager(canvas);
  const audio = new AudioManager();
  audio.installUnlockHandlers();
  const game = new Game({ canvas, input, ui, audio });

  ui.bindGame(game);
  game.resize();
  game.render();
};

window.addEventListener("load", bootstrap);

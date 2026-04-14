/**
 * dev-menu.js — Floating draggable/resizable dev panel.
 *
 * Only visible when devMode is enabled in settings.
 * Toggle with F1 while devMode is on. Does NOT pause the game.
 *
 * Input isolation strategy:
 *   Root uses stopPropagation in the BUBBLE phase so child elements
 *   (buttons, inputs, close button) still receive events normally,
 *   but the window-level InputManager listeners never fire.
 *   Drag / resize use document-level CAPTURE listeners so they work
 *   even when the cursor is over the panel (where bubble is stopped)
 *   or outside it.
 */

import { getUpgradePool, getBossUpgradePool } from "./progression.js";

export class DevMenu {
  constructor(elements) {
    this.el = elements;
    this.game = null;
    this.settings = null;
    this.visible = false;
    this._dragging = false;
    this._resizing = false;

    this._blockInput();
    this._initDrag();
    this._initResize();
    this._bindButtons();
  }

  bindGame(game) {
    this.game = game;
  }

  bindSettings(settings) {
    this.settings = settings;
    this._syncToggles();
  }

  // ── Visibility ──────────────────────────────────────────────

  toggle() {
    this.visible ? this.hide() : this.show();
  }

  show() {
    this.visible = true;
    this.el.root.classList.remove("hidden");
    this._syncToggles();
    this._updateInfo();
  }

  hide() {
    this.visible = false;
    this.el.root.classList.add("hidden");
  }

  // ── Sync toggle state from settings ─────────────────────────

  _syncToggles() {
    if (!this.settings) return;
    this.el.togInvincible.checked = this.settings.get("devInvincible");
    this.el.togNoclip.checked = this.settings.get("devNoclip");
    this.el.togObstacles.checked = this.settings.get("devShowObstacles");
  }

  // ── Info line ───────────────────────────────────────────────

  _updateInfo() {
    if (!this.game || !this.el.info) return;
    const g = this.game;
    const wave = g.waveSpawner ? g.waveSpawner.wave : 0;
    const enemies = g.enemies ? g.enemies.length : 0;
    const level = g.progression ? g.progression.level : 0;
    const scrap = g.progression ? g.progression.scrap : 0;
    this.el.info.textContent =
      `Wave ${wave} | Enemies ${enemies} | Lv ${level} | Scrap ${scrap}`;
  }

  // ── Input blocking ─────────────────────────────────────────
  // Bubble-phase stopPropagation: children handle events first,
  // then root stops them from reaching window (game InputManager).

  _blockInput() {
    const stop = (e) => e.stopPropagation();
    const events = [
      "mousedown", "mouseup", "mousemove",
      "click", "contextmenu", "wheel",
    ];
    for (const evt of events) {
      this.el.root.addEventListener(evt, stop); // bubble phase
    }

    // Block keyboard while typing in the goto input
    const stopKb = (e) => e.stopPropagation();
    this.el.gotoInput.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); this.el.gotoGo.click(); }
    });
    this.el.gotoInput.addEventListener("keyup", stopKb);
    this.el.gotoInput.addEventListener("keypress", stopKb);
  }

  // ── Drag ────────────────────────────────────────────────────
  // mousedown on header starts drag.
  // document-level capture listeners for move/up so events are
  // received regardless of cursor position.

  _initDrag() {
    let startX, startY, origLeft, origTop;

    this.el.header.addEventListener("mousedown", (e) => {
      // Don't start drag from the close button
      if (e.target.closest(".dev-menu-close")) return;
      this._dragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.el.root.getBoundingClientRect();
      origLeft = rect.left;
      origTop = rect.top;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!this._dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      this.el.root.style.left = (origLeft + dx) + "px";
      this.el.root.style.top = (origTop + dy) + "px";
      this.el.root.style.right = "auto";
    }, true); // capture phase

    document.addEventListener("mouseup", () => {
      this._dragging = false;
    }, true); // capture phase
  }

  // ── Resize ──────────────────────────────────────────────────

  _initResize() {
    let startX, startY, origW, origH;

    this.el.resize.addEventListener("mousedown", (e) => {
      this._resizing = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.el.root.getBoundingClientRect();
      origW = rect.width;
      origH = rect.height;
      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!this._resizing) return;
      const w = Math.max(220, origW + (e.clientX - startX));
      const h = Math.max(200, origH + (e.clientY - startY));
      this.el.root.style.width = w + "px";
      this.el.root.style.height = h + "px";
    }, true); // capture phase

    document.addEventListener("mouseup", () => {
      this._resizing = false;
    }, true); // capture phase
  }

  // ── Buttons & Toggles ──────────────────────────────────────

  _bindButtons() {
    // Close
    this.el.closeBtn.addEventListener("click", () => this.hide());

    // ── Wave controls ─────────────────────────────────────────
    this.el.skipWave.addEventListener("click", () => {
      if (!this.game) return;
      this.game.devSkipWave();
      this._updateInfo();
    });

    this.el.skip5.addEventListener("click", () => {
      if (!this.game) return;
      const target = (this.game.waveSpawner.wave || 0) + 5;
      this.game.devSkipToWave(target);
      this._updateInfo();
    });

    this.el.gotoGo.addEventListener("click", () => {
      if (!this.game) return;
      const target = parseInt(this.el.gotoInput.value, 10);
      if (target >= 1) {
        this.game.devSkipToWave(target);
        this._updateInfo();
      }
    });

    // ── Progression ───────────────────────────────────────────
    this.el.unlockAll.addEventListener("click", () => {
      if (!this.game) return;
      const prog = this.game.progression;
      for (const u of [...getUpgradePool(), ...getBossUpgradePool()]) {
        prog.acquire(u.id);
      }
      this.game.syncWeaponsFromProgression();
      this._updateInfo();
    });

    this.el.levelUp.addEventListener("click", () => {
      if (!this.game) return;
      const prog = this.game.progression;
      prog.level += 1;
      this.game.levelUpQueue = (this.game.levelUpQueue || 0) + 1;
      if (!prog.levelUpActive && !prog.bossRewardActive) {
        this.game.triggerLevelUp();
      }
      this._updateInfo();
    });

    this.el.giveScrap.addEventListener("click", () => {
      if (!this.game) return;
      this.game.progression.scrap += 50;
      this._updateInfo();
    });

    this.el.heal.addEventListener("click", () => {
      if (!this.game) return;
      this.game.devHeal();
      this._updateInfo();
    });

    // ── Spawn ─────────────────────────────────────────────────
    const spawnBtn = (btn, type) => {
      btn.addEventListener("click", () => {
        if (!this.game) return;
        this.game.devSpawnEnemy(type);
        this._updateInfo();
      });
    };
    spawnBtn(this.el.spawnShambler, "shambler");
    spawnBtn(this.el.spawnSprinter, "sprinter");
    spawnBtn(this.el.spawnSpitter, "spitter");
    spawnBtn(this.el.spawnBrute, "brute");
    spawnBtn(this.el.spawnScreamer, "screamer");

    this.el.killAll.addEventListener("click", () => {
      if (!this.game) return;
      this.game.devKillAll();
      this._updateInfo();
    });

    // ── Debug toggles (moved from Settings) ───────────────────
    this.el.togInvincible.addEventListener("change", () => {
      if (!this.settings) return;
      this.settings.set("devInvincible", this.el.togInvincible.checked);
      if (this.game) this.game.applySettings();
    });

    this.el.togNoclip.addEventListener("change", () => {
      if (!this.settings) return;
      this.settings.set("devNoclip", this.el.togNoclip.checked);
    });

    this.el.togObstacles.addEventListener("change", () => {
      if (!this.settings) return;
      this.settings.set("devShowObstacles", this.el.togObstacles.checked);
    });
  }
}

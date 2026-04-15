/* ============================================================
   guide.js — Field Guide data & tab rendering
   Uses actual zombie sprite parts with in-game tint filters
   for accurate enemy/boss previews with idle animation.
   ============================================================ */

/* ---- zombie sprite loader (mirrors zombie-renderer.js) ---- */

const zombieImgs = {};
let zombieReady = false;

function ensureZombieSprites() {
  if (zombieReady) return Promise.resolve();
  const files = { head: "Head.png", torso: "Torso.png", armL: "Left-arm.png", armR: "Right-arm.png" };
  let loaded = 0;
  const total = Object.keys(files).length;
  return new Promise(resolve => {
    for (const [key, file] of Object.entries(files)) {
      if (zombieImgs[key]) { if (++loaded === total) { zombieReady = true; resolve(); } continue; }
      const img = new Image();
      img.onload = () => { zombieImgs[key] = img; if (++loaded === total) { zombieReady = true; resolve(); } };
      img.onerror = () => { if (++loaded === total) resolve(); };
      img.src = "assets/images/enemies/" + file;
    }
  });
}

/* ---- animated canvas preview (matches in-game zombie-renderer.js) ---- */

class AnimatedPreview {
  constructor(container, radius, tintFilter, isBoss, bossGlowColor) {
    // Scale up small enemies so previews are legible in the guide
    const displayRadius = isBoss ? Math.max(radius, 30) : Math.max(radius * 1.6, 22);
    this.radius = displayRadius;
    this.tintFilter = tintFilter;
    this.isBoss = isBoss;
    this.bossGlowColor = bossGlowColor;
    this.wobble = Math.random() * Math.PI * 2;

    const pad = isBoss ? displayRadius * 2.0 : displayRadius * 1.5;
    this.size = Math.ceil((displayRadius + pad) * 2);
    this.canvas = document.createElement("canvas");
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.size * this.dpr;
    this.canvas.height = this.size * this.dpr;
    this.canvas.style.width = this.size + "px";
    this.canvas.style.height = this.size + "px";
    this.canvas.className = "guide-preview-canvas";
    this.ctx = this.canvas.getContext("2d");
    container.appendChild(this.canvas);
  }

  draw(time) {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const size = this.size;
    const radius = this.radius;
    ctx.clearRect(0, 0, size * dpr, size * dpr);
    ctx.save();
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;

    this.wobble += 0.03;
    const w = this.wobble;

    // Boss aura (pulsing glow + orbiting particles)
    if (this.isBoss && this.bossGlowColor) {
      const gc = this.bossGlowColor;
      const r = parseInt(gc.slice(1, 3), 16);
      const g = parseInt(gc.slice(3, 5), 16);
      const b = parseInt(gc.slice(5, 7), 16);
      const pulse = 0.5 + Math.sin(time * 0.0025) * 0.25;

      const aura = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 3.0);
      aura.addColorStop(0, `rgba(${r},${g},${b},${0.18 * pulse})`);
      aura.addColorStop(0.5, `rgba(${r},${g},${b},${0.05 * pulse})`);
      aura.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 3.0, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(${r},${g},${b},${0.25 + pulse * 0.25})`;
      ctx.lineWidth = 1.5 + Math.sin(time * 0.004) * 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 5 + Math.sin(time * 0.003) * 2, 0, Math.PI * 2);
      ctx.stroke();

      for (let i = 0; i < 3; i++) {
        const a = time * 0.0018 + (i * Math.PI * 2) / 3;
        const orbitR = radius + 8 + Math.sin(time * 0.002 + i) * 3;
        const px = cx + Math.cos(a) * orbitR;
        const py = cy + Math.sin(a) * orbitR;
        const pAlpha = 0.35 + Math.sin(time * 0.005 + i * 1.2) * 0.2;
        ctx.fillStyle = `rgba(${r},${g},${b},${pAlpha})`;
        ctx.beginPath();
        ctx.arc(px, py, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Drop shadow (animated with bob)
    const bobScale = radius / 16;
    const bob = Math.sin(w * 1.4) * 1.2 * bobScale;
    ctx.fillStyle = "rgba(0,0,0,0.16)";
    ctx.beginPath();
    ctx.ellipse(cx + 1.5, cy + radius + 3 - bob * 0.4, radius * 0.8, radius * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();

    if (!zombieReady) { ctx.restore(); return; }

    // Scale parts (same formula as zombie-renderer.js)
    const s = (radius * 2.2) / Math.max(zombieImgs.torso.width, zombieImgs.torso.height);
    const tw = zombieImgs.torso.width * s;
    const th = zombieImgs.torso.height * s;
    const hw = zombieImgs.head.width * s * 0.85;
    const hh = zombieImgs.head.height * s * 0.85;
    const aw = zombieImgs.armL.width * s * 0.8;
    const ah = zombieImgs.armL.height * s * 0.8;

    ctx.save();
    ctx.translate(cx, cy);

    if (this.tintFilter) ctx.filter = this.tintFilter;

    // Idle animation — same layered sine formula as zombie-renderer.js
    const amp = 0.22;
    const lSwing = (Math.sin(w) * 0.6 + Math.sin(w * 1.618) * 0.25 + Math.sin(w * 0.437) * 0.15) * amp;
    const rSwing = -(Math.sin(w + 0.3) * 0.6 + Math.sin(w * 1.382 + 1.1) * 0.25 + Math.sin(w * 0.531 + 2.0) * 0.15) * amp;

    const sway = Math.sin(w * 0.5) * 0.035;
    const headRot = Math.sin(w * 0.6) * 0.07;
    const jx = Math.sin(w * 7.1) * 0.3;
    const jy = Math.cos(w * 5.3) * 0.3;

    // Face upward (π/2 maps image-up → screen-up)
    ctx.rotate(Math.PI / 2 + sway);
    ctx.translate(jx, jy + bob);

    const shX = tw * 0.30;
    const shY = -th * 0.10;

    const drawArm = (img, sx, sy, angle) => {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(angle);
      ctx.drawImage(img, -aw / 2, -ah, aw, ah);
      ctx.restore();
    };

    drawArm(zombieImgs.armL, -shX, shY, lSwing);
    drawArm(zombieImgs.armR, shX, shY, rSwing);
    ctx.drawImage(zombieImgs.torso, -tw / 2, -th / 2, tw, th);

    ctx.save();
    ctx.translate(0, -th * 0.28);
    ctx.rotate(headRot);
    ctx.drawImage(zombieImgs.head, -hw / 2, -hh / 2, hw, hh);
    ctx.restore();

    ctx.restore(); // tint / translate
    ctx.restore(); // dpr scale
  }
}

/* ============================================================
   Game data
   ============================================================ */

const ENEMIES = [
  {
    name: "Shambler", role: "Scout", radius: 16,
    tintFilter: "hue-rotate(-110deg) saturate(1.1)",
    desc: "The standard undead. Slow but relentless, shamblers close in for melee strikes. Easy alone — deadly in hordes.",
    stats: { HP: 68, DMG: 16, SPD: 108, PTS: 18 },
    tags: ["Melee"],
  },
  {
    name: "Sprinter", role: "Fast Scout", radius: 12,
    tintFilter: "hue-rotate(-80deg) saturate(1.3) brightness(1.1)",
    desc: "Blazing fast and hard to track. Sprinters rush in with quick melee jabs before you can react.",
    stats: { HP: 42, DMG: 12, SPD: 165, PTS: 22 },
    tags: ["Melee", "Fast"],
  },
  {
    name: "Spitter", role: "Ranged Gunner", radius: 14,
    tintFilter: "saturate(1.5) brightness(1.05)",
    desc: "Keeps distance and fires toxic projectiles. Prioritize these before they chip away your health from afar.",
    stats: { HP: 54, DMG: 14, SPD: 82, PTS: 28 },
    tags: ["Ranged"],
  },
  {
    name: "Brute", role: "Tank", radius: 22,
    tintFilter: "hue-rotate(-130deg) saturate(1.1) brightness(0.8)",
    desc: "Massive and heavily armored. Brutes hit like a truck and absorb enormous punishment. Keep your distance.",
    stats: { HP: 140, DMG: 26, SPD: 72, PTS: 44 },
    tags: ["Melee", "Heavy"],
  },
  {
    name: "Screamer", role: "Support", radius: 13,
    tintFilter: "hue-rotate(160deg) saturate(1.4)",
    desc: "Emits a buff aura that speeds up nearby allies by 22%. Also fires purple projectiles from range. Kill first.",
    stats: { HP: 48, DMG: 10, SPD: 80, PTS: 34 },
    tags: ["Ranged", "Buffer"],
  },
];

const BOSSES = [
  {
    name: "Juggernaut", role: "Melee Tank", wave: 5, radius: 36,
    tintFilter: "hue-rotate(-140deg) saturate(1.5) brightness(0.7)",
    bossGlow: "#ff3030",
    desc: "A towering brute that charges in for devastating ground slams. Stay mobile and dodge the AoE impact zone.",
    stats: { HP: 900, DMG: 45, SPD: 82, PTS: 500 },
    tags: ["Melee", "AoE Slam"],
  },
  {
    name: "Brood Mother", role: "Ranged Caster", wave: 10, radius: 30,
    tintFilter: "hue-rotate(40deg) saturate(2.0) brightness(0.9)",
    bossGlow: "#44ff22",
    desc: "Hangs back and unleashes 6-projectile bursts. Her rapid fire rate demands constant repositioning.",
    stats: { HP: 750, DMG: 18, SPD: 62, PTS: 600 },
    tags: ["Ranged", "Burst Fire"],
  },
  {
    name: "Titan", role: "Hybrid Destroyer", wave: 15, radius: 42,
    tintFilter: "hue-rotate(180deg) saturate(1.8) brightness(0.75)",
    bossGlow: "#aa44ff",
    desc: "The ultimate threat. Combines devastating melee slams with 14-projectile radial shockwaves. The arena's true apex predator.",
    stats: { HP: 1400, DMG: 55, SPD: 98, PTS: 800 },
    tags: ["Melee", "AoE Slam", "Shockwave"],
  },
  {
    name: "Warlord Grim", role: "Evolved Juggernaut", wave: 20, radius: 36,
    tintFilter: "hue-rotate(-140deg) saturate(1.5) brightness(0.7)",
    bossGlow: "#ff3030",
    desc: "A hardened Juggernaut with enhanced slam radius and higher damage. Faster and far more aggressive.",
    stats: { HP: 1500, DMG: 55, SPD: 100 },
    tags: ["Melee", "AoE Slam"],
  },
  {
    name: "Queen Vespera", role: "Evolved Brood Mother", wave: 25, radius: 30,
    tintFilter: "hue-rotate(40deg) saturate(2.0) brightness(0.9)",
    bossGlow: "#44ff22",
    desc: "Fires devastating 9-projectile bursts with a faster cycle. Far deadlier at range than her predecessor.",
    stats: { HP: 1300, DMG: 24, SPD: 72 },
    tags: ["Ranged", "9-Burst"],
  },
  {
    name: "The Monolith", role: "Evolved Titan", wave: 30, radius: 42,
    tintFilter: "hue-rotate(180deg) saturate(1.8) brightness(0.75)",
    bossGlow: "#aa44ff",
    desc: "Expanded slam radius, 18-projectile shockwaves, and extreme durability. A walking catastrophe.",
    stats: { HP: 2200, DMG: 70, SPD: 110 },
    tags: ["Melee", "AoE Slam", "18-Shockwave"],
  },
  {
    name: "The Amalgam", role: "Dual-Mode Brood Mother", wave: 35, radius: 30,
    tintFilter: "hue-rotate(40deg) saturate(2.0) brightness(0.9)",
    bossGlow: "#44ff22",
    desc: "Dual-mode nightmare: ranged burst fire AND ground slams with 8-projectile shockwaves. No safe distance.",
    stats: { HP: 2800, DMG: 30, SPD: 90 },
    tags: ["Ranged", "Melee", "Burst + Slam"],
  },
  {
    name: "Omega", role: "Final Titan", wave: 40, radius: 42,
    tintFilter: "hue-rotate(180deg) saturate(1.8) brightness(0.75)",
    bossGlow: "#aa44ff",
    desc: "The ultimate boss. Massive slam radius, 20-projectile shockwaves, near-zero cooldowns. Survive this and prove your worth.",
    stats: { HP: 3800, DMG: 70, SPD: 115 },
    tags: ["Melee", "AoE Slam", "20-Shockwave"],
  },
];

const WEAPONS = [
  {
    name: "Service Pistol", role: "Precision",
    desc: "Semi-automatic sidearm. Low spread, reliable damage. Your starting weapon — never underestimate it.",
    img: "assets/images/guns/pistol.png", color: "#ffd17b",
    stats: { DMG: 24, RPM: 272, SPD: 860, SPREAD: "Low" },
    tags: ["Semi-Auto", "Starter"],
  },
  {
    name: "Vector SMG", role: "Rapid Fire",
    desc: "Fully automatic with insane fire rate. Low per-bullet damage but overwhelming DPS at close-mid range.",
    img: "assets/images/guns/smg.png", color: "#6be0d6",
    stats: { DMG: 10, RPM: 706, SPD: 920, SPREAD: "Med" },
    tags: ["Full-Auto", "Unlock"],
  },
  {
    name: "Scatter Cannon", role: "Crowd Control",
    desc: "Fires 7 pellets in a wide spread. Devastating point-blank but loses effectiveness at range.",
    img: "assets/images/guns/shotgun.png", color: "#ff9d6f",
    stats: { "DMG/pellet": 11, PELLETS: 7, SPD: 720, SPREAD: "Wide" },
    tags: ["Semi-Auto", "Shotgun", "Unlock"],
  },
];

const ITEMS = [
  {
    name: "Health Pack",
    desc: "Restores a portion of your health. Occasionally dropped by defeated enemies.",
    img: "assets/images/dropables/hp.png",
    glow: "rgba(80, 255, 130, 0.3)",
  },
  {
    name: "Scrap",
    desc: "Currency used to unlock new weapons and purchase certain upgrades. Collect from fallen enemies.",
    img: "assets/images/dropables/scrap.png",
    glow: "rgba(255, 200, 80, 0.3)",
  },
];

const CONTROL_GROUPS = [
  {
    label: "MOVEMENT",
    controls: [
      [["W", "A", "S", "D"], "Move"],
      [["Mouse"], "Aim"],
      [["RMB"], "Dash"],
    ],
  },
  {
    label: "COMBAT",
    controls: [
      [["LMB"], "Shoot"],
      [["1", "2", "3", "4"], "Switch Weapon"],
      [["Scroll"], "Cycle Weapon"],
    ],
  },
  {
    label: "INTERFACE",
    controls: [
      [["TAB", "E"], "Open Stats / Loadout"],
      [["Esc"], "Pause Menu"],
      [["R"], "Restart (menu / game over)"],
    ],
  },
];

/* ============================================================
   HTML rendering helpers
   ============================================================ */

function statPills(stats) {
  return Object.entries(stats)
    .map(([k, v]) => `<span class="guide-stat"><span class="guide-stat-val">${v}</span> ${k}</span>`)
    .join("");
}

function tagPills(tags) {
  return tags
    .map(t => `<span class="guide-stat guide-tag">${t}</span>`)
    .join("");
}

function renderEnemies() {
  const cards = ENEMIES.map((e, i) => `
    <div class="guide-card" data-preview="enemy" data-index="${i}">
      <div class="guide-preview" data-type="enemy" data-idx="${i}"></div>
      <div class="guide-card-body">
        <div class="guide-card-name">${e.name}</div>
        <div class="guide-card-role">${e.role}</div>
        <div class="guide-card-desc">${e.desc}</div>
        <div class="guide-stats">${statPills(e.stats)} ${tagPills(e.tags)}</div>
      </div>
    </div>`).join("");
  return `<div class="guide-grid">${cards}</div>`;
}

function renderBosses() {
  const cards = BOSSES.map((b, i) => `
    <div class="guide-card boss-card" data-preview="boss" data-index="${i}">
      <div class="guide-preview boss-preview" data-type="boss" data-idx="${i}"></div>
      <div class="guide-card-body">
        <div class="guide-card-name">${b.name} <span class="guide-boss-wave">WAVE ${b.wave}</span></div>
        <div class="guide-card-role">${b.role}</div>
        <div class="guide-card-desc">${b.desc}</div>
        <div class="guide-stats">${statPills(b.stats)} ${tagPills(b.tags)}</div>
      </div>
    </div>`).join("");
  return `<div class="guide-grid bosses">${cards}</div>`;
}

function renderWeapons() {
  const cards = WEAPONS.map(w => `
    <div class="guide-card">
      <img class="guide-weapon-icon" src="${w.img}" alt="${w.name}" style="--avatar-glow:${w.color}40">
      <div class="guide-card-body">
        <div class="guide-card-name">${w.name}</div>
        <div class="guide-card-role">${w.role}</div>
        <div class="guide-card-desc">${w.desc}</div>
        <div class="guide-stats">${statPills(w.stats)} ${tagPills(w.tags)}</div>
      </div>
    </div>`).join("");
  return `<div class="guide-grid weapons">${cards}</div>`;
}

function renderItems() {
  const cards = ITEMS.map(it => `
    <div class="guide-card">
      <img class="guide-item-icon" src="${it.img}" alt="${it.name}" style="filter:drop-shadow(0 0 6px ${it.glow})">
      <div class="guide-card-body">
        <div class="guide-card-name">${it.name}</div>
        <div class="guide-card-desc">${it.desc}</div>
      </div>
    </div>`).join("");
  return `<div class="guide-grid items">${cards}</div>`;
}

function renderControls() {
  const groups = CONTROL_GROUPS.map(group => {
    const rows = group.controls.map(([keys, action]) => {
      const keyCaps = keys.map(k => `<kbd>${k}</kbd>`).join(" ");
      return `<div class="guide-ctrl-row">
        <span class="guide-ctrl-keys">${keyCaps}</span>
        <span class="guide-ctrl-arrow">\u2192</span>
        <span class="guide-ctrl-action">${action}</span>
      </div>`;
    }).join("");
    return `<div class="guide-ctrl-group">
      <div class="guide-ctrl-group-label">${group.label}</div>
      ${rows}
    </div>`;
  }).join("");
  return `<div class="guide-controls-structured">${groups}</div>`;
}

const TAB_RENDERERS = {
  enemies: renderEnemies,
  bosses: renderBosses,
  weapons: renderWeapons,
  items: renderItems,
  controls: renderControls,
};

/* ============================================================
   Guide controller
   ============================================================ */

export class Guide {
  constructor({ tabs, content }) {
    this.tabsEl = tabs;
    this.contentEl = content;
    this.currentTab = "enemies";
    this.previews = [];       // active AnimatedPreview instances
    this._animFrame = null;

    this.tabsEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".guide-tab");
      if (!btn) return;
      this.switchTab(btn.dataset.tab);
    });

    // Load sprites then render
    ensureZombieSprites().then(() => this.render());
  }

  switchTab(tab) {
    if (!TAB_RENDERERS[tab] || tab === this.currentTab) return;
    this.currentTab = tab;

    for (const btn of this.tabsEl.querySelectorAll(".guide-tab")) {
      btn.classList.toggle("active", btn.dataset.tab === tab);
    }

    this.render();
  }

  render() {
    // Stop previous animation loop
    this._stopAnimation();
    this.previews = [];

    const renderer = TAB_RENDERERS[this.currentTab];
    if (renderer) this.contentEl.innerHTML = renderer();

    // Attach canvas previews for enemies/bosses
    if (this.currentTab === "enemies" || this.currentTab === "bosses") {
      this._attachPreviews();
      this._startAnimation();
    }
  }

  _attachPreviews() {
    const containers = this.contentEl.querySelectorAll(".guide-preview");
    for (const el of containers) {
      const type = el.dataset.type;
      const idx = parseInt(el.dataset.idx, 10);
      const data = type === "boss" ? BOSSES[idx] : ENEMIES[idx];
      if (!data) continue;

      const isBoss = type === "boss";
      const preview = new AnimatedPreview(
        el,
        data.radius,
        data.tintFilter,
        isBoss,
        isBoss ? data.bossGlow : null,
      );
      this.previews.push(preview);
    }
  }

  _startAnimation() {
    const tick = (time) => {
      for (const p of this.previews) p.draw(time);
      this._animFrame = requestAnimationFrame(tick);
    };
    this._animFrame = requestAnimationFrame(tick);
  }

  _stopAnimation() {
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
  }

  onShow() {
    // Re-render current tab's previews and start animation
    if ((this.currentTab === "enemies" || this.currentTab === "bosses") && this.previews.length > 0) {
      this._startAnimation();
    }
  }

  onHide() {
    this._stopAnimation();
  }
}

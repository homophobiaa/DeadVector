import { Bullet } from "./bullet.js";
import { clamp, keepCircleInBounds, normalize } from "../systems/collision.js";
import { renderPlayerParts, playerPartsReady, getMuzzleOffset } from "./player-renderer.js";

let BASE_WEAPONS = [
  {
    name: "Service Pistol",
    auto: false,
    cooldown: 0.22,
    projectileSpeed: 860,
    damage: 24,
    radius: 4,
    pellets: 1,
    spread: 0.02,
    color: "#ffd17b",
    recoil: 12,
  },
  {
    name: "Vector SMG",
    auto: true,
    cooldown: 0.085,
    projectileSpeed: 920,
    damage: 10,
    radius: 3,
    pellets: 1,
    spread: 0.08,
    color: "#6be0d6",
    recoil: 8,
  },
  {
    name: "Scatter Cannon",
    auto: false,
    cooldown: 0.6,
    projectileSpeed: 720,
    damage: 11,
    radius: 3,
    pellets: 7,
    spread: 0.38,
    color: "#ff9d6f",
    recoil: 20,
  },
];

export const DEV_WEAPON = {
  name: "DEV Laser",
  auto: true,
  cooldown: 0.025,
  projectileSpeed: 2000,
  damage: 300,
  radius: 5,
  pellets: 3,
  spread: 0.12,
  color: "#ff00ff",
  recoil: 2,
  pierce: true,
};

/** Replace base weapons list at runtime (dev panel). */
export function setBaseWeapons(weapons) { BASE_WEAPONS = weapons; }
/** Return current base weapons (for export). */
export function getBaseWeapons() { return BASE_WEAPONS; }

// Default player stats — configurable from dev panel
let PLAYER_STATS = {
  maxHealth: 100,
  radius: 17,
  speed: 280,
  maxEnergy: 100,
  energyRegen: 28,
  dashCost: 35,
  dashDistance: 135,
  dashCooldown: 1.25,
  dashInvulnerability: 0.24,
};

export function setPlayerStats(stats) { PLAYER_STATS = stats; }
export function getPlayerStats() { return PLAYER_STATS; }

export class Player {
  constructor(x, y) {
    this.maxHealth = PLAYER_STATS.maxHealth;
    this.radius = PLAYER_STATS.radius;
    this.speed = PLAYER_STATS.speed;
    this.devMode = false;
    this.devInvincible = false;
    this.weapons = [...BASE_WEAPONS];
    this.reset(x, y);
  }

  setDevMode(enabled) {
    this.devMode = enabled;
    if (!enabled) this.devInvincible = false;
    if (enabled) {
      if (!this.weapons.includes(DEV_WEAPON)) {
        this.weapons = [...BASE_WEAPONS, DEV_WEAPON];
      }
      this.maxHealth = 10000;
      this.health = this.maxHealth;
    } else {
      this.weapons = [...BASE_WEAPONS];
      this.maxHealth = PLAYER_STATS.maxHealth;
      this.health = Math.min(this.health, this.maxHealth);
    }
    if (this.weaponIndex >= this.weapons.length) {
      this.weaponIndex = 0;
    }
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.health = this.maxHealth;
    this.energy = PLAYER_STATS.maxEnergy;
    this.aimAngle = 0;
    this.weaponIndex = 0;
    this.fireCooldown = 0;
    this.dashCooldown = 0;
    this.damageFlash = 0;
    this.invulnerability = 0;
    this.muzzleFlash = 0;
    this.afterImages = [];
    this.kills = 0;
  }

  update(delta, input, bounds) {
    const horizontal = Number(input.isDown("d", "arrowright")) - Number(input.isDown("a", "arrowleft"));
    const vertical = Number(input.isDown("s", "arrowdown")) - Number(input.isDown("w", "arrowup"));
    const movement = normalize(horizontal, vertical);

    this.vx = movement.x * this.speed;
    this.vy = movement.y * this.speed;
    this.x += this.vx * delta;
    this.y += this.vy * delta;

    keepCircleInBounds(this, bounds);

    const aimX = input.mouse.x - this.x;
    const aimY = input.mouse.y - this.y;
    this.aimAngle = Math.atan2(aimY, aimX);

    this.fireCooldown = Math.max(0, this.fireCooldown - delta);
    this.dashCooldown = Math.max(0, this.dashCooldown - delta);
    this.invulnerability = Math.max(0, this.invulnerability - delta);
    this.damageFlash = Math.max(0, this.damageFlash - delta * 2.4);
    this.muzzleFlash = Math.max(0, this.muzzleFlash - delta * 12);
    this.energy = clamp(this.energy + PLAYER_STATS.energyRegen * delta, 0, PLAYER_STATS.maxEnergy);

    // Fade afterimages
    for (let i = this.afterImages.length - 1; i >= 0; i--) {
      this.afterImages[i].alpha -= delta * 3;
      if (this.afterImages[i].alpha <= 0) this.afterImages.splice(i, 1);
    }
  }

  get weapon() {
    return this.weapons[this.weaponIndex];
  }

  switchWeaponByStep(step) {
    const total = this.weapons.length;
    this.weaponIndex = (this.weaponIndex + step + total) % total;
    return this.weapon;
  }

  selectWeapon(index) {
    if (index < 0 || index >= this.weapons.length) return this.weapon;
    this.weaponIndex = index;
    return this.weapon;
  }

  tryShoot(targetX, targetY) {
    if (this.fireCooldown > 0) return [];

    const angle = Math.atan2(targetY - this.y, targetX - this.x);
    const bullets = [];
    const weapon = this.weapon;

    this.fireCooldown = weapon.cooldown;
    this.muzzleFlash = 1;

    // Spawn bullets from the gun muzzle tip, not the player's chest
    const muzzleOff = getMuzzleOffset(this);
    const spawnX = muzzleOff ? this.x + muzzleOff.x : this.x + Math.cos(angle) * (this.radius + 12);
    const spawnY = muzzleOff ? this.y + muzzleOff.y : this.y + Math.sin(angle) * (this.radius + 12);

    for (let i = 0; i < weapon.pellets; i++) {
      const spreadOffset = (Math.random() - 0.5) * weapon.spread;
      const a = angle + spreadOffset;
      const vx = Math.cos(a) * weapon.projectileSpeed;
      const vy = Math.sin(a) * weapon.projectileSpeed;

      bullets.push(
        new Bullet({
          x: spawnX,
          y: spawnY,
          vx, vy,
          radius: weapon.radius,
          damage: weapon.damage,
          life: 0.9,
          color: weapon.color,
          friendly: true,
        }),
      );
    }
    return bullets;
  }

  useDash(targetX, targetY, bounds) {
    if (this.dashCooldown > 0 || this.energy < PLAYER_STATS.dashCost) return false;

    // Store afterimage
    this.afterImages.push({ x: this.x, y: this.y, angle: this.aimAngle, alpha: 0.6 });

    const direction = normalize(targetX - this.x, targetY - this.y);
    this.x += direction.x * PLAYER_STATS.dashDistance;
    this.y += direction.y * PLAYER_STATS.dashDistance;
    keepCircleInBounds(this, bounds);

    // Second afterimage at midpoint
    this.afterImages.push({
      x: (this.afterImages[this.afterImages.length - 1].x + this.x) / 2,
      y: (this.afterImages[this.afterImages.length - 1].y + this.y) / 2,
      angle: this.aimAngle,
      alpha: 0.35,
    });

    this.energy -= PLAYER_STATS.dashCost;
    this.dashCooldown = PLAYER_STATS.dashCooldown;
    this.invulnerability = PLAYER_STATS.dashInvulnerability;
    return true;
  }

  /** Re-read PLAYER_STATS into live properties (dev panel hot-reload). */
  applyStats() {
    if (!this.devMode) {
      this.maxHealth = PLAYER_STATS.maxHealth;
      this.health = Math.min(this.health, this.maxHealth);
    }
    this.radius = PLAYER_STATS.radius;
    this.speed = PLAYER_STATS.speed;
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, this.maxHealth);
  }

  setDevInvincible(enabled) {
    this.devInvincible = enabled;
  }

  takeDamage(amount) {
    if (this.invulnerability > 0) return false;
    if (this.devInvincible) return false;
    this.health = clamp(this.health - amount, 0, this.maxHealth);
    this.invulnerability = 0.42;
    this.damageFlash = 1;
    return true;
  }

  renderAfterImages(ctx) {
    for (const img of this.afterImages) {
      ctx.save();
      ctx.globalAlpha = img.alpha * 0.4;
      ctx.translate(img.x, img.y);
      ctx.rotate(img.angle);
      ctx.fillStyle = "#6be0d6";
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  render(ctx) {
    // Afterimages first (behind player)
    this.renderAfterImages(ctx);

    ctx.save();
    ctx.translate(this.x, this.y);

    // Drop shadow (world-aligned, not rotated)
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.ellipse(3, 6, this.radius * 1.05, this.radius * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.rotate(this.aimAngle);

    // Try PNG body-part renderer first
    const usedPng = renderPlayerParts(ctx, this);

    if (!usedPng) {
      // Fallback: procedural draw
      this._renderProcedural(ctx);
    }

    ctx.restore();

    // UI rings (not rotated)
    this._renderRings(ctx);
  }

  _renderProcedural(ctx) {
    const isHurt = this.damageFlash > 0;
    ctx.shadowBlur = isHurt ? 35 : 22;
    ctx.shadowColor = isHurt ? "rgba(255,100,70,0.5)" : "rgba(107,224,214,0.2)";

    // Main body
    const bodyGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, this.radius);
    bodyGrad.addColorStop(0, isHurt ? "#ffd8c8" : "#e8e4de");
    bodyGrad.addColorStop(0.65, isHurt ? "#c47060" : "#bbb5ab");
    bodyGrad.addColorStop(1, isHurt ? "#a05040" : "#8a857d");
    ctx.fillStyle = bodyGrad;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Shoulder pads
    ctx.fillStyle = "#555";
    ctx.beginPath();
    ctx.arc(-4, -10, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-4, 10, 5.5, 0, Math.PI * 2);
    ctx.fill();

    // Armor trim
    ctx.strokeStyle = "rgba(107,224,214,0.15)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius - 1, 0, Math.PI * 2);
    ctx.stroke();

    // Weapon barrel
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(10, -3.5, 22, 7);
    ctx.fillStyle = "#555";
    ctx.fillRect(10, -3.5, 4, 7);

    // Muzzle tip
    ctx.fillStyle = this.weapon.color;
    ctx.fillRect(28, -2.5, 6, 5);

    // Muzzle flash
    if (this.muzzleFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this.muzzleFlash;
      ctx.shadowBlur = 30;
      ctx.shadowColor = this.weapon.color;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(36, 0, 4 + this.muzzleFlash * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = this.weapon.color;
      ctx.beginPath();
      ctx.arc(36, 0, 2 + this.muzzleFlash * 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Head / visor
    const visorGrad = ctx.createRadialGradient(2, 0, 1, 2, 0, 7);
    visorGrad.addColorStop(0, "#9ffffa");
    visorGrad.addColorStop(0.6, "#6be0d6");
    visorGrad.addColorStop(1, "#3cb5ab");
    ctx.fillStyle = visorGrad;
    ctx.shadowBlur = 14;
    ctx.shadowColor = "rgba(107,224,214,0.4)";
    ctx.beginPath();
    ctx.arc(3, 0, 6, 0, Math.PI * 2);
    ctx.fill();

    // Visor slit
    ctx.strokeStyle = "#1a3530";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(6, -3);
    ctx.lineTo(8, 0);
    ctx.lineTo(6, 3);
    ctx.stroke();
  }

  _renderRings(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);

    // Health ring — thin, subtle arc
    const healthRatio = this.health / this.maxHealth;
    const hColor = healthRatio > 0.6 ? "#78ff78" : healthRatio > 0.3 ? "#ffc850" : "#ff5040";
    ctx.strokeStyle = hColor;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * healthRatio);
    ctx.stroke();

    // Energy ring — barely visible when idle
    const energyRatio = this.energy / 100;
    ctx.strokeStyle = this.dashCooldown > 0 ? "rgba(255,255,255,0.04)" : "rgba(107,224,214,0.12)";
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * energyRatio);
    ctx.stroke();

    // Invulnerability flash
    if (this.invulnerability > 0) {
      ctx.globalAlpha = Math.sin(this.invulnerability * 30) * 0.08 + 0.03;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}

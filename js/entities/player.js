import { Bullet } from "./bullet.js";
import { clamp, keepCircleInBounds, normalize } from "../systems/collision.js";

const WEAPONS = [
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

export class Player {
  constructor(x, y) {
    this.maxHealth = 100;
    this.radius = 17;
    this.speed = 280;
    this.weapons = WEAPONS;
    this.reset(x, y);
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.health = this.maxHealth;
    this.energy = 100;
    this.aimAngle = 0;
    this.weaponIndex = 0;
    this.fireCooldown = 0;
    this.dashCooldown = 0;
    this.damageFlash = 0;
    this.invulnerability = 0;
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
    this.energy = clamp(this.energy + 28 * delta, 0, 100);
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
    if (index < 0 || index >= this.weapons.length) {
      return this.weapon;
    }

    this.weaponIndex = index;
    return this.weapon;
  }

  tryShoot(targetX, targetY) {
    if (this.fireCooldown > 0) {
      return [];
    }

    const angle = Math.atan2(targetY - this.y, targetX - this.x);
    const bullets = [];
    const weapon = this.weapon;

    this.fireCooldown = weapon.cooldown;

    for (let index = 0; index < weapon.pellets; index += 1) {
      const spreadOffset = (Math.random() - 0.5) * weapon.spread;
      const bulletAngle = angle + spreadOffset;
      const velocityX = Math.cos(bulletAngle) * weapon.projectileSpeed;
      const velocityY = Math.sin(bulletAngle) * weapon.projectileSpeed;

      bullets.push(
        new Bullet({
          x: this.x + Math.cos(bulletAngle) * (this.radius + 10),
          y: this.y + Math.sin(bulletAngle) * (this.radius + 10),
          vx: velocityX,
          vy: velocityY,
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
    if (this.dashCooldown > 0 || this.energy < 35) {
      return false;
    }

    const direction = normalize(targetX - this.x, targetY - this.y);

    this.x += direction.x * 130;
    this.y += direction.y * 130;
    keepCircleInBounds(this, bounds);

    this.energy -= 35;
    this.dashCooldown = 1.25;
    this.invulnerability = 0.24;

    return true;
  }

  heal(amount) {
    this.health = clamp(this.health + amount, 0, this.maxHealth);
  }

  takeDamage(amount) {
    if (this.invulnerability > 0) {
      return false;
    }

    this.health = clamp(this.health - amount, 0, this.maxHealth);
    this.invulnerability = 0.42;
    this.damageFlash = 1;
    return true;
  }

  render(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aimAngle);

    ctx.shadowBlur = 24;
    ctx.shadowColor = "rgba(107, 224, 214, 0.34)";

    ctx.fillStyle = this.damageFlash > 0 ? "#ffd1c3" : "#f7f6f1";
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(-10, 12);
    ctx.lineTo(-14, 0);
    ctx.lineTo(-10, -12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#6be0d6";
    ctx.beginPath();
    ctx.arc(-4, 0, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = this.weapon.color;
    ctx.fillRect(12, -3, 18, 6);

    ctx.restore();

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 6, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * this.energy) / 100);
    ctx.stroke();
    ctx.restore();
  }
}

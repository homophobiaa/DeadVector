export class Bullet {
  constructor({ x, y, vx, vy, radius, damage, life, color, friendly = true,
                _ricochet = 0, _knockback = false, _blastRadius = 0, _isCrit = false,
                _damageFalloff = 0 }) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = radius;
    this.damage = damage;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.friendly = friendly;
    this.alive = true;
    this.trail = [];
    this.trailMax = 8;
    // Progression-driven properties
    this._ricochet = _ricochet;
    this._knockback = _knockback;
    this._blastRadius = _blastRadius;
    this._isCrit = _isCrit;
    this._damageFalloff = _damageFalloff; // 0 = none, 1 = full falloff by end of life
  }

  update(delta, bounds) {
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > this.trailMax) this.trail.shift();

    this.x += this.vx * delta;
    this.y += this.vy * delta;
    this.life -= delta;

    const margin = 60;
    if (
      this.x < -margin || this.y < -margin ||
      this.x > bounds.width + margin || this.y > bounds.height + margin ||
      this.life <= 0
    ) {
      this.alive = false;
    }
  }

  /** Get effective damage accounting for distance falloff. */
  getEffectiveDamage() {
    if (this._damageFalloff <= 0) return this.damage;
    // 0 = just spawned (full damage), 1 = end of life (minimum damage)
    const travelled = 1 - (this.life / this.maxLife);
    // Falloff starts at 40% of bullet life, scales to minimum of 30% damage
    const falloffStart = 0.4;
    if (travelled <= falloffStart) return this.damage;
    const t = (travelled - falloffStart) / (1 - falloffStart);
    const mult = 1 - t * 0.7; // drops to 30% damage at max range
    return Math.round(this.damage * Math.max(0.3, mult));
  }

  render(ctx) {
    if (!this.alive) return;

    // Trail
    if (this.trail.length > 1) {
      ctx.save();
      ctx.lineCap = "round";
      for (let i = 1; i < this.trail.length; i++) {
        const t = i / this.trail.length;
        ctx.globalAlpha = t * 0.35;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = t * this.radius * 2;
        ctx.beginPath();
        ctx.moveTo(this.trail[i - 1].x, this.trail[i - 1].y);
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Glow
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.shadowBlur = 20;
    ctx.shadowColor = this.color;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Hot core
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

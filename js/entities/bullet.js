export class Bullet {
  constructor({
    x,
    y,
    vx,
    vy,
    radius,
    damage,
    life,
    color,
    friendly = true,
  }) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.radius = radius;
    this.damage = damage;
    this.life = life;
    this.color = color;
    this.friendly = friendly;
    this.alive = true;
  }

  update(delta, bounds) {
    this.x += this.vx * delta;
    this.y += this.vy * delta;
    this.life -= delta;

    const margin = 60;
    const outsideBounds =
      this.x < -margin ||
      this.y < -margin ||
      this.x > bounds.width + margin ||
      this.y > bounds.height + margin;

    if (this.life <= 0 || outsideBounds) {
      this.alive = false;
    }
  }

  render(ctx) {
    if (!this.alive) {
      return;
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.shadowBlur = 16;
    ctx.shadowColor = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

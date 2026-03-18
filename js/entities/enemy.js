import { FiniteStateMachine } from "../ai/fsm.js";
import { Bullet } from "./bullet.js";
import {
  clamp,
  distanceBetween,
  keepCircleInBounds,
  normalize,
  randomRange,
} from "../systems/collision.js";

const ENEMY_TYPES = {
  shambler: {
    label: "Shambler",
    radius: 16,
    speed: 84,
    maxHealth: 58,
    damage: 14,
    attackRange: 34,
    attackWindup: 0.42,
    attackRecovery: 0.28,
    attackCooldown: 1.05,
    noticeRange: 250,
    retreatThreshold: 0.18,
    retreatTime: [0.75, 1.1],
    retreatCooldown: 3.1,
    color: "#c8594b",
    glow: "#ffcc85",
    score: 18,
    ranged: false,
  },
  sprinter: {
    label: "Sprinter",
    radius: 12,
    speed: 144,
    maxHealth: 36,
    damage: 10,
    attackRange: 28,
    attackWindup: 0.26,
    attackRecovery: 0.18,
    attackCooldown: 0.75,
    noticeRange: 315,
    retreatThreshold: 0.08,
    retreatTime: [0.45, 0.7],
    retreatCooldown: 2.2,
    color: "#f18e4a",
    glow: "#ffe08e",
    score: 22,
    ranged: false,
  },
  spitter: {
    label: "Spitter",
    radius: 14,
    speed: 76,
    maxHealth: 46,
    damage: 12,
    attackRange: 190,
    preferredDistance: 150,
    attackWindup: 0.6,
    attackRecovery: 0.28,
    attackCooldown: 1.45,
    noticeRange: 360,
    retreatThreshold: 0.74,
    retreatTime: [0.8, 1.2],
    retreatCooldown: 2.6,
    color: "#7bcf78",
    glow: "#d2ffb9",
    score: 28,
    ranged: true,
    projectileSpeed: 360,
  },
  brute: {
    label: "Brute",
    radius: 22,
    speed: 63,
    maxHealth: 118,
    damage: 22,
    attackRange: 44,
    attackWindup: 0.72,
    attackRecovery: 0.36,
    attackCooldown: 1.55,
    noticeRange: 270,
    retreatThreshold: 0.12,
    retreatTime: [0.55, 0.85],
    retreatCooldown: 3.4,
    color: "#8d4650",
    glow: "#ffc49f",
    score: 44,
    ranged: false,
  },
};

export class Enemy {
  constructor({ x, y, type, wave }) {
    this.type = type;
    this.config = ENEMY_TYPES[type];
    this.x = x;
    this.y = y;
    this.wave = wave;
    this.radius = this.config.radius;
    this.maxHealth = this.config.maxHealth + wave * 3;
    this.health = this.maxHealth;
    this.speed = this.config.speed * (1 + wave * 0.018);
    this.attackCooldown = 0;
    this.damageFlash = 0;
    this.opacity = 1;
    this.stateLabel = "SPAWN";
    this.retreatTimer = 0;
    this.retreatCooldown = 0;
    this.wanderTimer = 0;
    this.wanderTarget = { x, y };
    this.deathTimer = 1.1;
    this.expired = false;
    this.hasDeathBurst = false;
    this.facing = 0;

    this.fsm = new FiniteStateMachine({
      owner: this,
      initialState: "SPAWN",
      states: this.buildStates(),
      anyTransitions: [
        {
          to: "DEAD",
          when: (owner, context, machine) => owner.health <= 0 && machine.currentState !== "DEAD",
        },
      ],
    });
  }

  buildStates() {
    return {
      SPAWN: {
        enter: (owner) => {
          owner.stateLabel = "SPAWN";
          owner.spawnTimer = randomRange(0.45, 0.9);
          owner.opacity = 0.2;
        },
        update: (owner, context, delta) => {
          owner.spawnTimer -= delta;
          owner.opacity = clamp(1 - owner.spawnTimer / 0.9, 0.2, 1);
          owner.facePlayer(context.player);
        },
        transitions: [
          {
            to: "CHASE",
            when: (owner, context) =>
              owner.spawnTimer <= 0 && owner.distanceToPlayer(context.player) < owner.config.noticeRange,
          },
          {
            to: "WANDER",
            when: (owner) => owner.spawnTimer <= 0,
          },
        ],
      },
      WANDER: {
        enter: (owner, context) => {
          owner.stateLabel = "WANDER";
          owner.wanderTimer = randomRange(0.9, 1.8);
          owner.pickWanderTarget(context.bounds);
        },
        update: (owner, context, delta) => {
          owner.wanderTimer -= delta;

          if (owner.wanderTimer <= 0 || owner.distanceTo(owner.wanderTarget) < 12) {
            owner.pickWanderTarget(context.bounds);
            owner.wanderTimer = randomRange(0.9, 1.8);
          }

          owner.moveToward(owner.wanderTarget.x, owner.wanderTarget.y, owner.speed * 0.52, delta, context.bounds);
        },
        transitions: [
          {
            to: "CHASE",
            when: (owner, context) => owner.distanceToPlayer(context.player) < owner.config.noticeRange,
          },
          {
            to: "RETREAT",
            when: (owner, context) => owner.shouldRetreat(context.player),
          },
        ],
      },
      CHASE: {
        enter: (owner) => {
          owner.stateLabel = "CHASE";
        },
        update: (owner, context, delta) => {
          const playerDistance = owner.distanceToPlayer(context.player);

          if (owner.config.ranged && playerDistance < owner.config.preferredDistance * 0.72) {
            owner.moveAway(context.player.x, context.player.y, owner.speed * 0.95, delta, context.bounds);
          } else if (owner.config.ranged && playerDistance < owner.config.attackRange) {
            owner.strafe(context.player, owner.speed * 0.8, delta, context.bounds);
          } else {
            owner.moveToward(context.player.x, context.player.y, owner.speed, delta, context.bounds);
          }
        },
        transitions: [
          {
            to: "ATTACK",
            when: (owner, context) =>
              owner.attackCooldown <= 0 && owner.distanceToPlayer(context.player) <= owner.config.attackRange,
          },
          {
            to: "RETREAT",
            when: (owner, context) => owner.shouldRetreat(context.player),
          },
          {
            to: "WANDER",
            when: (owner, context, machine) =>
              machine.stateTime > 1.3 &&
              owner.distanceToPlayer(context.player) > owner.config.noticeRange * 1.65,
          },
        ],
      },
      ATTACK: {
        enter: (owner) => {
          owner.stateLabel = "ATTACK";
          owner.attackWindup = owner.config.attackWindup;
          owner.attackRecovery = owner.config.attackRecovery;
          owner.attackPerformed = false;
        },
        update: (owner, context, delta) => {
          owner.facePlayer(context.player);

          if (!owner.attackPerformed) {
            owner.attackWindup -= delta;

            if (owner.attackWindup <= 0) {
              owner.performAttack(context);
              owner.attackPerformed = true;
            }

            return;
          }

          owner.attackRecovery -= delta;

          if (owner.config.ranged) {
            owner.moveAway(context.player.x, context.player.y, owner.speed * 0.75, delta, context.bounds);
          }
        },
        transitions: [
          {
            to: "RETREAT",
            when: (owner) => owner.attackPerformed && owner.attackRecovery <= 0 && owner.retreatTimer > 0,
          },
          {
            to: "CHASE",
            when: (owner, context) =>
              owner.attackPerformed &&
              owner.attackRecovery <= 0 &&
              owner.distanceToPlayer(context.player) <= owner.config.noticeRange * 1.4,
          },
          {
            to: "WANDER",
            when: (owner) => owner.attackPerformed && owner.attackRecovery <= 0,
          },
        ],
      },
      RETREAT: {
        enter: (owner) => {
          owner.stateLabel = "RETREAT";
          owner.retreatTimer = randomRange(owner.config.retreatTime[0], owner.config.retreatTime[1]);
          owner.retreatCooldown = owner.config.retreatCooldown;
        },
        update: (owner, context, delta) => {
          owner.retreatTimer -= delta;
          owner.moveAway(context.player.x, context.player.y, owner.speed * 1.05, delta, context.bounds);
        },
        transitions: [
          {
            to: "ATTACK",
            when: (owner, context) =>
              owner.retreatTimer <= 0 &&
              owner.attackCooldown <= 0 &&
              owner.distanceToPlayer(context.player) <= owner.config.attackRange,
          },
          {
            to: "CHASE",
            when: (owner, context) =>
              owner.retreatTimer <= 0 &&
              owner.distanceToPlayer(context.player) <= owner.config.noticeRange,
          },
          {
            to: "WANDER",
            when: (owner) => owner.retreatTimer <= 0,
          },
        ],
      },
      DEAD: {
        enter: (owner, context) => {
          owner.stateLabel = "DEAD";
          owner.deathTimer = 1.1;

          if (!owner.hasDeathBurst) {
            owner.hasDeathBurst = true;
            context.spawnBurst(owner.x, owner.y, owner.config.color, 12, 40, 120);
            context.leaveBlood(owner.x, owner.y, owner.radius * 0.9);
          }
        },
        update: (owner, context, delta) => {
          owner.deathTimer -= delta;
          owner.opacity = clamp(owner.deathTimer / 1.1, 0, 0.85);

          if (owner.deathTimer <= 0) {
            owner.expired = true;
          }
        },
      },
    };
  }

  update(delta, context) {
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.damageFlash = Math.max(0, this.damageFlash - delta * 4);
    this.retreatCooldown = Math.max(0, this.retreatCooldown - delta);
    this.fsm.update(delta, context);
  }

  takeDamage(amount) {
    if (this.fsm.currentState === "DEAD") {
      return { hit: false, killed: false };
    }

    const wasAlive = this.health > 0;
    this.health -= amount;
    this.damageFlash = 1;

    return {
      hit: true,
      killed: wasAlive && this.health <= 0,
    };
  }

  shouldRetreat(player) {
    return (
      this.retreatCooldown <= 0 &&
      this.health / this.maxHealth <= this.config.retreatThreshold &&
      this.distanceToPlayer(player) < this.config.noticeRange
    );
  }

  distanceTo(target) {
    return distanceBetween(this.x, this.y, target.x, target.y);
  }

  distanceToPlayer(player) {
    return distanceBetween(this.x, this.y, player.x, player.y);
  }

  facePlayer(player) {
    this.facing = Math.atan2(player.y - this.y, player.x - this.x);
  }

  pickWanderTarget(bounds) {
    const margin = 56;
    this.wanderTarget = {
      x: randomRange(margin, bounds.width - margin),
      y: randomRange(margin, bounds.height - margin),
    };
  }

  moveToward(targetX, targetY, speed, delta, bounds) {
    const direction = normalize(targetX - this.x, targetY - this.y);
    this.x += direction.x * speed * delta;
    this.y += direction.y * speed * delta;
    keepCircleInBounds(this, bounds);
  }

  moveAway(targetX, targetY, speed, delta, bounds) {
    const direction = normalize(this.x - targetX, this.y - targetY);
    this.x += direction.x * speed * delta;
    this.y += direction.y * speed * delta;
    keepCircleInBounds(this, bounds);
  }

  strafe(player, speed, delta, bounds) {
    const away = normalize(this.x - player.x, this.y - player.y);
    const lateral = Math.random() > 0.5 ? 1 : -1;
    this.x += (-away.y * lateral + away.x * 0.25) * speed * delta;
    this.y += (away.x * lateral + away.y * 0.25) * speed * delta;
    keepCircleInBounds(this, bounds);
  }

  performAttack(context) {
    this.attackCooldown = this.config.attackCooldown;

    if (this.shouldRetreat(context.player)) {
      this.retreatTimer = randomRange(this.config.retreatTime[0], this.config.retreatTime[1]);
    } else {
      this.retreatTimer = 0;
    }

    if (this.config.ranged) {
      const leadX = context.player.x + context.player.vx * 0.15;
      const leadY = context.player.y + context.player.vy * 0.15;
      const direction = normalize(leadX - this.x, leadY - this.y);
      const projectile = new Bullet({
        x: this.x + direction.x * (this.radius + 6),
        y: this.y + direction.y * (this.radius + 6),
        vx: direction.x * this.config.projectileSpeed,
        vy: direction.y * this.config.projectileSpeed,
        radius: 7,
        damage: this.config.damage,
        life: 1.6,
        color: "#a7ff7c",
        friendly: false,
      });

      context.spawnEnemyProjectile(projectile);
      context.spawnBurst(this.x, this.y, "#a7ff7c", 6, 20, 60);
      return;
    }

    if (this.distanceToPlayer(context.player) <= this.config.attackRange + context.player.radius + 4) {
      context.damagePlayer(this.config.damage);
      context.spawnBurst(context.player.x, context.player.y, "#ffd1b0", 10, 25, 90);
    }
  }

  render(ctx) {
    if (this.expired) {
      return;
    }

    const healthRatio = clamp(this.health / this.maxHealth, 0, 1);
    const bodyColor = this.damageFlash > 0 ? "#fff0df" : this.config.color;
    const eyeColor = this.config.glow;

    ctx.save();
    ctx.globalAlpha = this.opacity;
    ctx.translate(this.x, this.y);

    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(0, this.radius + 8, this.radius * 0.85, this.radius * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    if (this.stateLabel === "SPAWN") {
      ctx.strokeStyle = "rgba(255, 190, 132, 0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 10 + Math.sin(performance.now() * 0.01) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (this.stateLabel === "ATTACK") {
      ctx.strokeStyle = "rgba(255, 93, 93, 0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.config.attackRange, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.shadowBlur = 22;
    ctx.shadowColor = this.config.glow;
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(21, 13, 11, 0.76)";
    ctx.beginPath();
    ctx.arc(0, 3, this.radius * 0.62, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.arc(-this.radius * 0.3, -2, 3, 0, Math.PI * 2);
    ctx.arc(this.radius * 0.3, -2, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * healthRatio);
    ctx.stroke();

    ctx.restore();
  }
}

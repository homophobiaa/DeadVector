// Renders zombie enemies using separate PNG body parts with procedural animation.
// Preload once at boot; all enemy instances share the same image set.

const imgs = {};
let ready = false;

/**
 * Load the four zombie body-part PNGs. Call once before gameplay.
 * @param {string} basePath folder containing the PNGs
 */
export function preloadZombieParts(basePath = "assets/images/enemies/") {
  if (ready) return Promise.resolve();
  const files = {
    head: "Head.png",
    torso: "Torso.png",
    armL: "Left-arm.png",
    armR: "Right-arm.png",
  };
  const entries = Object.entries(files);
  let loaded = 0;
  return new Promise((resolve) => {
    for (const [key, file] of entries) {
      const img = new Image();
      img.onload = () => {
        imgs[key] = img;
        if (++loaded === entries.length) { ready = true; resolve(); }
      };
      img.onerror = () => {
        console.warn(`Zombie part not found: ${file}`);
        if (++loaded === entries.length) resolve();
      };
      img.src = basePath + file;
    }
  });
}

/** @returns {boolean} true when all four parts loaded successfully */
export function zombiePartsReady() { return ready; }

/**
 * Draw a zombie using PNG body parts with procedural animation.
 * Expects ctx already translated to the enemy's (x, y) position
 * and globalAlpha set to enemy.opacity.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} enemy  the Enemy instance
 * @returns {boolean} true if rendered; false if images not loaded (caller should fallback)
 */
export function renderZombieParts(ctx, enemy) {
  if (!ready) return false;

  const r = enemy.radius;
  const w = enemy.wobble;
  const flash = enemy.damageFlash;
  const c = enemy.config;

  // --- Scale parts to fit the enemy collision radius ---
  // Torso fills ~110 % of collision diameter for visual fullness
  const s = (r * 2.2) / Math.max(imgs.torso.width, imgs.torso.height);
  const tw = imgs.torso.width * s;
  const th = imgs.torso.height * s;
  const hw = imgs.head.width * s * 0.85;
  const hh = imgs.head.height * s * 0.85;
  const aw = imgs.armL.width * s * 0.8;
  const ah = imgs.armL.height * s * 0.8;

  // --- Animation parameters ---
  const isChasing = enemy.stateLabel === "CHASE";
  const isAttacking = enemy.stateLabel === "ATTACK" && !enemy.attackPerformed;
  const isDead = enemy.stateLabel === "DEAD";

  // Arm swing — layered sines at irrational ratios so arms never loop identically
  const amp = isDead ? 0 : isChasing ? 0.40 : 0.22;
  const lSwing =  (Math.sin(w) * 0.6 + Math.sin(w * 1.618) * 0.25 + Math.sin(w * 0.437) * 0.15) * amp;
  const rSwing = -(Math.sin(w + 0.3) * 0.6 + Math.sin(w * 1.382 + 1.1) * 0.25 + Math.sin(w * 0.531 + 2.0) * 0.15) * amp;

  // Attack wind-up: both arms converge toward center (grabbing motion)
  let attackLift = 0;
  if (isAttacking) {
    attackLift = (1 - enemy.attackWindup / c.attackWindup) * 0.5;
  }
  const lAngle = lSwing + attackLift;          // + pushes left-arm hand rightward
  const rAngle = rSwing - attackLift;          // - pushes right-arm hand leftward

  // Side-to-side walk sway — wobble speed already scales with movement state
  const swayAmp = isDead ? 0 : isChasing ? 0.06 : 0.035;
  const sway = Math.sin(w * 0.5) * swayAmp;

  // Body bob (tiny forward–backward oscillation)
  const bobScale = r / 16;                     // relative to base shambler size
  const bob = isDead ? 0 : Math.sin(w * 1.4) * 1.2 * bobScale;

  // Head rotational lag — lags slightly behind body wobble
  const headRot = isDead ? 0 : Math.sin(w * 0.6) * 0.07;

  // Organic micro-jitter (deterministic from wobble, not random)
  const jx = isDead ? 0 : Math.sin(w * 7.1) * 0.3;
  const jy = isDead ? 0 : Math.cos(w * 5.3) * 0.3;

  // --- Draw ---
  ctx.save();

  // Damage flash: brighten all subsequent draws
  // Type tint + optional damage flash combined into one filter string
  const parts = [];
  if (c.tintFilter) parts.push(c.tintFilter);
  if (flash > 0) parts.push(`brightness(${1 + flash * 2})`);
  if (parts.length) ctx.filter = parts.join(" ");

  // Orient: images face UP in their PNGs, so adding π/2 maps image-up → +facing.
  // After this rotation the local coordinate space is:
  //   -y = forward (facing direction)   +y = backward
  //   -x = zombie's left               +x = zombie's right
  ctx.rotate(enemy.facing + Math.PI / 2 + sway);
  ctx.translate(jx, jy + bob);

  // Shoulder anchor positions (relative to torso centre)
  const shX = tw * 0.30;       // lateral offset from centre
  const shY = -th * 0.10;      // slightly forward of torso centre

  // Helper: draw one arm image with shoulder pivot at (sx, sy)
  const drawArm = (img, sx, sy, angle) => {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    // Shoulder (image bottom) at origin; hand (image top) extends toward -y (forward)
    ctx.drawImage(img, -aw / 2, -ah, aw, ah);
    ctx.restore();
  };

  // Draw order: arms (under torso) → torso → head (on top)
  drawArm(imgs.armL, -shX, shY, lAngle);
  drawArm(imgs.armR,  shX, shY, rAngle);

  // Torso (centred on origin)
  ctx.drawImage(imgs.torso, -tw / 2, -th / 2, tw, th);

  // Turn off shadow so head doesn't get a double glow
  ctx.shadowBlur = 0;

  // Head — slightly forward, with rotational lag
  ctx.save();
  ctx.translate(0, -th * 0.28);
  ctx.rotate(headRot);
  ctx.drawImage(imgs.head, -hw / 2, -hh / 2, hw, hh);
  ctx.restore();

  ctx.restore();   // restores filter, shadow, rotation
  return true;
}

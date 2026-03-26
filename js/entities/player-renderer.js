// Renders the player using separate PNG body parts + gun sprites with procedural animation.
// Preload once at boot; the single player instance uses the shared image set.

const bodyImgs = {};
const gunImgs = {};
let ready = false;

// Map weapon names → gun sprite filenames
const GUN_MAP = {
  "Service Pistol": "pistol",
  "Vector SMG":     "smg",
  "Scatter Cannon": "shotgun",
  "DEV Laser":      "laser",
};

/**
 * Load player body-part PNGs and gun sprites. Call once before gameplay.
 */
export function preloadPlayerParts(
  bodyPath = "assets/images/player/",
  gunPath  = "assets/images/guns/"
) {
  if (ready) return Promise.resolve();

  const bodyFiles = {
    head:  "head.png",
    torso: "torso.png",
    armL:  "left-arm.png",
    armR:  "right-arm.png",
  };
  const gunFiles = { pistol: "pistol.png", smg: "smg.png", shotgun: "shotgun.png", laser: "laser.png" };

  const allEntries = [
    ...Object.entries(bodyFiles).map(([k, f]) => [k, bodyPath + f, bodyImgs]),
    ...Object.entries(gunFiles).map(([k, f])  => [k, gunPath + f, gunImgs]),
  ];
  let loaded = 0;
  const total = allEntries.length;

  return new Promise((resolve) => {
    for (const [key, src, target] of allEntries) {
      const img = new Image();
      img.onload = () => { target[key] = img; if (++loaded === total) { ready = true; resolve(); } };
      img.onerror = () => { console.warn(`Player part not found: ${src}`); if (++loaded === total) resolve(); };
      img.src = src;
    }
  });
}

/** @returns {boolean} true when all images loaded */
export function playerPartsReady() { return ready; }

/**
 * Draw the player using PNG body parts and active gun sprite.
 * ctx is already translated to player (x, y) and rotated to aimAngle by the caller.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Object} player  the Player instance
 * @returns {boolean} true if rendered via PNGs; false → caller should fallback
 */
export function renderPlayerParts(ctx, player) {
  if (!ready) return false;

  const r = player.radius;
  const flash = player.damageFlash;

  // --- Scale body parts to player collision radius ---
  const s = (r * 2.2) / Math.max(bodyImgs.torso.width, bodyImgs.torso.height);
  const tw = bodyImgs.torso.width  * s;
  const th = bodyImgs.torso.height * s;
  const hw = bodyImgs.head.width  * s * 0.85;
  const hh = bodyImgs.head.height * s * 0.85;
  const aw = bodyImgs.armL.width  * s * 0.8;
  const ah = bodyImgs.armL.height * s * 0.8;

  // --- Movement animation ---
  const speed = Math.hypot(player.vx, player.vy);
  const isMoving = speed > 20;
  if (player._walkPhase == null) player._walkPhase = 0;
  if (isMoving) {
    player._walkPhase += speed * 0.012;
  } else {
    player._walkPhase += 0.8;
  }
  const w = player._walkPhase;

  const walkAmp = isMoving ? 0.25 : 0.06;
  const lSwing =  Math.sin(w * 0.08) * walkAmp;
  const rSwing = -Math.sin(w * 0.08 + Math.PI) * walkAmp;
  const bob = Math.sin(w * (isMoving ? 0.06 : 0.04)) * (isMoving ? 1.0 : 0.5);

  // --- Gun sprite ---
  const gunKey = GUN_MAP[player.weapon.name];
  const gunImg = gunKey ? gunImgs[gunKey] : null;

  // --- Draw ---
  ctx.save();
  if (flash > 0) ctx.filter = `brightness(${1 + flash * 2})`;

  // Rotate +π/2 so local coordinate space becomes:
  //   -y = forward (aim direction)   +y = backward
  //   -x = left                      +x = right
  // This matches the zombie renderer convention and aligns PNG "up" with aim.
  ctx.rotate(Math.PI / 2);
  ctx.translate(0, bob);

  // Shoulder anchor positions (relative to torso centre)
  const shX = tw * 0.30;
  const shY = -th * 0.10;

  const drawArm = (img, sx, sy, angle) => {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    // Shoulder (image bottom) at pivot; hand (image top) extends toward -y (forward)
    ctx.drawImage(img, -aw / 2, -ah, aw, ah);
    ctx.restore();
  };

  // Back arm (left, drawn first → behind torso)
  drawArm(bodyImgs.armL, -shX, shY, lSwing);

  // Torso (centred on origin)
  ctx.drawImage(bodyImgs.torso, -tw / 2, -th / 2, tw, th);

  // Gun — positioned at front arm hand area, extending forward (-y)
  if (gunImg) {
    const gScale = (r * 1.8) / Math.max(gunImg.width, gunImg.height);
    const gw = gunImg.width  * gScale;
    const gh = gunImg.height * gScale;
    ctx.save();
    // Place gun at the front (right) arm shoulder, barrel extends forward (-y)
    ctx.translate(shX * 0.3, shY);
    ctx.drawImage(gunImg, -gw / 2, -gh - ah * 0.3, gw, gh);
    ctx.restore();

    // Muzzle flash at barrel tip
    if (player.muzzleFlash > 0) {
      ctx.save();
      const muzzleX = shX * 0.3;
      const muzzleY = shY - gh - ah * 0.3;
      ctx.globalAlpha = player.muzzleFlash;
      ctx.shadowBlur = 30;
      ctx.shadowColor = player.weapon.color;
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(muzzleX, muzzleY, 4 + player.muzzleFlash * 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = player.weapon.color;
      ctx.beginPath();
      ctx.arc(muzzleX, muzzleY, 2 + player.muzzleFlash * 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Front arm (right, on top — the gun hand)
  drawArm(bodyImgs.armR, shX, shY, rSwing);

  // Head — slightly forward along aim direction
  ctx.save();
  ctx.translate(0, -th * 0.28);
  ctx.drawImage(bodyImgs.head, -hw / 2, -hh / 2, hw, hh);
  ctx.restore();

  ctx.restore();
  return true;
}

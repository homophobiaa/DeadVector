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
  // Arms: scale height (length) to fit body, keep proportional width
  const armScale = s * 0.7;
  const aw = bodyImgs.armL.width  * armScale;
  const ah = bodyImgs.armL.height * armScale;

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
  // Gun arm swings less — player keeps it steady while aiming
  const rSwing = -Math.sin(w * 0.08 + Math.PI) * walkAmp * 0.35;
  const bob = Math.sin(w * (isMoving ? 0.06 : 0.04)) * (isMoving ? 1.0 : 0.5);

  // Subtle weapon sway (breathing + movement)
  const weaponSway = Math.sin(w * (isMoving ? 0.06 : 0.03)) * (isMoving ? 0.04 : 0.015);

  // --- Gun sprite ---
  const gunKey = GUN_MAP[player.weapon.name];
  const gunImg = gunKey ? gunImgs[gunKey] : null;

  // --- Draw ---
  ctx.save();
  if (flash > 0) ctx.filter = `brightness(${1 + flash * 2})`;

  // Rotate +π/2 so local coordinate space becomes:
  //   -y = forward (aim direction)   +y = backward
  //   -x = left                      +x = right
  ctx.rotate(Math.PI / 2);
  ctx.translate(0, bob);

  // Shoulder anchor positions (relative to torso centre, at the shoulder bulge edges)
  const shX = tw * 0.32;
  const shY = -th * 0.05;

  const drawArm = (img, sx, sy, angle) => {
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    // Shoulder (top of PNG) at pivot (y=0); hand extends forward (-y)
    ctx.scale(1, -1);
    ctx.drawImage(img, -aw / 2, 0, aw, ah);
    ctx.restore();
  };

  // Back arm (left, drawn first → behind torso) — support hand
  drawArm(bodyImgs.armL, -shX * 0.7, shY, lSwing - 0.12);

  // Torso (centred on origin)
  ctx.drawImage(bodyImgs.torso, -tw / 2, -th / 2, tw, th);

  // Gun — held at the hand end of the right arm
  if (gunImg) {
    // Scale gun relative to arm length so it looks proportional
    const gScale = (ah * 1.1) / gunImg.height;
    const gw = gunImg.width  * gScale;
    const gh = gunImg.height * gScale;
    ctx.save();
    ctx.translate(shX, shY);
    ctx.rotate(rSwing + weaponSway);
    // Grip is ~65% down the gun sprite; align grip with the hand position (y = -ah)
    const gripOffset = gh * 0.65;
    ctx.drawImage(gunImg, -gw / 2, -ah - (gh - gripOffset), gw, gh);
    ctx.restore();

    // Muzzle flash at barrel tip
    if (player.muzzleFlash > 0) {
      ctx.save();
      ctx.translate(shX, shY);
      ctx.rotate(rSwing + weaponSway);
      const muzzleY = -ah - (gh - gripOffset);
      ctx.globalAlpha = player.muzzleFlash * 0.85;
      ctx.shadowBlur = 10;
      ctx.shadowColor = "#fff";
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(0, muzzleY, 2 + player.muzzleFlash * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // Front arm (right, on top — the gun hand)
  drawArm(bodyImgs.armR, shX, shY, rSwing + weaponSway);

  // Head — slightly forward along aim direction
  ctx.save();
  ctx.translate(0, -th * 0.28);
  ctx.drawImage(bodyImgs.head, -hw / 2, -hh / 2, hw, hh);
  ctx.restore();

  ctx.restore();
  return true;
}

/**
 * Returns the world-space offset {x, y} from the player's centre to the gun muzzle tip,
 * taking aimAngle into account. Returns null if images haven't loaded yet.
 */
export function getMuzzleOffset(player) {
  if (!ready || !bodyImgs.torso || !bodyImgs.armL) return null;

  const r = player.radius;
  const s = (r * 2.2) / Math.max(bodyImgs.torso.width, bodyImgs.torso.height);
  const tw = bodyImgs.torso.width  * s;
  const th = bodyImgs.torso.height * s;
  const ah = bodyImgs.armL.height  * s * 0.7;

  const gunKey = GUN_MAP[player.weapon.name];
  const gunImg = gunKey ? gunImgs[gunKey] : null;
  const gh     = gunImg ? (ah * 1.1) : ah;

  const shX = tw * 0.32;
  const shY = -th * 0.05;
  const gripOffset = gh * 0.65;
  const muzzleLocalY = -ah - (gh - gripOffset); // top of gun sprite = muzzle

  // Absolute local position in the +PI/2-rotated drawing frame
  const lx = shX;
  const ly = shY + muzzleLocalY;

  // Convert from the drawing frame (aimAngle + PI/2) back to world offsets:
  //   world = rotate(aimAngle + PI/2) * (lx, ly)
  //   cos(a+PI/2) = -sin(a),  sin(a+PI/2) = cos(a)
  const a = player.aimAngle;
  return {
    x: -lx * Math.sin(a) - ly * Math.cos(a),
    y:  lx * Math.cos(a) - ly * Math.sin(a),
  };
}

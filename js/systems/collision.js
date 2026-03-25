// Collision detection and math utilities

export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const lerp = (a, b, t) => a + (b - a) * t;

export const randomRange = (min, max) => min + Math.random() * (max - min);

export const randomInt = (min, max) => Math.floor(randomRange(min, max + 1));

export const normalize = (x, y) => {
  const length = Math.hypot(x, y);
  if (length === 0) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
};

export const distanceBetween = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

export const angleBetween = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);

export const circlesOverlap = (a, b) =>
  distanceBetween(a.x, a.y, b.x, b.y) < a.radius + b.radius;

export const keepCircleInBounds = (circle, bounds) => {
  const margin = 18;
  circle.x = clamp(circle.x, circle.radius + margin, bounds.width - circle.radius - margin);
  circle.y = clamp(circle.y, circle.radius + margin, bounds.height - circle.radius - margin);
};

export const separateCircles = (a, b) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 0.0001;
  const overlap = a.radius + b.radius - dist;
  if (overlap <= 0) return;
  const nx = dx / dist;
  const ny = dy / dist;
  const half = overlap / 2;
  a.x -= nx * half;
  a.y -= ny * half;
  b.x += nx * half;
  b.y += ny * half;
};

// Push a circle out of an axis-aligned (rounded) rectangle.
// `rect` must have { x, y, w, h } and optionally `r` — an array [tl, tr, bl, br]
// of pixel corner radii.  When no radii are provided, behaves as a plain AABB.
export const resolveCircleRect = (circle, rect) => {
  const rr = rect.r || [0, 0, 0, 0]; // [tl, tr, bl, br]

  // --- 1. Quick check: is the circle completely outside the AABB expanded by its radius? ---
  if (circle.x + circle.radius < rect.x || circle.x - circle.radius > rect.x + rect.w ||
      circle.y + circle.radius < rect.y || circle.y - circle.radius > rect.y + rect.h) {
    return false;
  }

  // --- 2. Determine the effective closest point, accounting for rounded corners. ---
  let closestX = clamp(circle.x, rect.x, rect.x + rect.w);
  let closestY = clamp(circle.y, rect.y, rect.y + rect.h);

  // Check if the closest point falls inside one of the four corner rounding zones.
  // Each corner zone is a square of side = cornerRadius at that corner.  Inside it the
  // effective boundary is a quarter-circle arc rather than a right angle.
  const cornerArc = getCornerArc(closestX, closestY, rect, rr);
  if (cornerArc) {
    // The closest point on the rounded boundary to the circle centre is on the arc.
    const dxA = circle.x - cornerArc.cx;
    const dyA = circle.y - cornerArc.cy;
    const distToArc = Math.hypot(dxA, dyA);

    // Is the circle centre inside the arc? (closer to corner centre than radius)
    if (distToArc < cornerArc.r) {
      // Centre inside the rounded region — push out along the arc normal.
      if (distToArc === 0) {
        // Degenerate: centre exactly on arc centre — push toward the nearest edge.
        circle.x = cornerArc.cx + cornerArc.r + circle.radius;
        return true;
      }
      const nx = dxA / distToArc;
      const ny = dyA / distToArc;
      circle.x = cornerArc.cx + nx * (cornerArc.r + circle.radius);
      circle.y = cornerArc.cy + ny * (cornerArc.r + circle.radius);
      return true;
    }

    // Circle is outside the arc but might still overlap it.
    if (distToArc < cornerArc.r + circle.radius) {
      const nx = dxA / distToArc;
      const ny = dyA / distToArc;
      const overlap = cornerArc.r + circle.radius - distToArc;
      circle.x += nx * overlap;
      circle.y += ny * overlap;
      return true;
    }

    // No collision with the arc — the circle clips past the rounded corner.
    return false;
  }

  // --- 3. Standard AABB circle-vs-rect resolution (no corner involved). ---
  const dx = circle.x - closestX;
  const dy = circle.y - closestY;
  const dist = Math.hypot(dx, dy);

  if (dist >= circle.radius) return false;

  // Circle center is inside the rectangle
  if (dist === 0) {
    const dLeft = circle.x - rect.x;
    const dRight = rect.x + rect.w - circle.x;
    const dTop = circle.y - rect.y;
    const dBottom = rect.y + rect.h - circle.y;
    const min = Math.min(dLeft, dRight, dTop, dBottom);
    if (min === dLeft) circle.x = rect.x - circle.radius;
    else if (min === dRight) circle.x = rect.x + rect.w + circle.radius;
    else if (min === dTop) circle.y = rect.y - circle.radius;
    else circle.y = rect.y + rect.h + circle.radius;
    return true;
  }

  const overlap = circle.radius - dist;
  circle.x += (dx / dist) * overlap;
  circle.y += (dy / dist) * overlap;
  return true;
};

// Return the arc centre + radius if (px,py) is inside a rounded corner zone, else null.
function getCornerArc(px, py, rect, rr) {
  const [tl, tr, bl, br] = rr;
  // Top-left
  if (tl > 0 && px < rect.x + tl && py < rect.y + tl)
    return { cx: rect.x + tl, cy: rect.y + tl, r: tl };
  // Top-right
  if (tr > 0 && px > rect.x + rect.w - tr && py < rect.y + tr)
    return { cx: rect.x + rect.w - tr, cy: rect.y + tr, r: tr };
  // Bottom-left
  if (bl > 0 && px < rect.x + bl && py > rect.y + rect.h - bl)
    return { cx: rect.x + bl, cy: rect.y + rect.h - bl, r: bl };
  // Bottom-right
  if (br > 0 && px > rect.x + rect.w - br && py > rect.y + rect.h - br)
    return { cx: rect.x + rect.w - br, cy: rect.y + rect.h - br, r: br };
  return null;
}

// Check if a point is inside a (rounded) rectangle
export const pointInRect = (x, y, rect) => {
  if (x < rect.x || x > rect.x + rect.w || y < rect.y || y > rect.y + rect.h) return false;
  const rr = rect.r || [0, 0, 0, 0];
  const arc = getCornerArc(x, y, rect, rr);
  if (arc) return Math.hypot(x - arc.cx, y - arc.cy) <= arc.r;
  return true;
};

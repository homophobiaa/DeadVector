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

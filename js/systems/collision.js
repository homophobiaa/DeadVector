export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const randomRange = (min, max) => min + Math.random() * (max - min);

export const normalize = (x, y) => {
  const length = Math.hypot(x, y);

  if (length === 0) {
    return { x: 0, y: 0 };
  }

  return { x: x / length, y: y / length };
};

export const distanceBetween = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

export const circlesOverlap = (circleA, circleB) =>
  distanceBetween(circleA.x, circleA.y, circleB.x, circleB.y) < circleA.radius + circleB.radius;

export const keepCircleInBounds = (circle, bounds) => {
  circle.x = clamp(circle.x, circle.radius, bounds.width - circle.radius);
  circle.y = clamp(circle.y, circle.radius, bounds.height - circle.radius);
};

export const separateCircles = (circleA, circleB) => {
  const offsetX = circleB.x - circleA.x;
  const offsetY = circleB.y - circleA.y;
  const distance = Math.hypot(offsetX, offsetY) || 0.0001;
  const overlap = circleA.radius + circleB.radius - distance;

  if (overlap <= 0) {
    return;
  }

  const normalX = offsetX / distance;
  const normalY = offsetY / distance;
  const correction = overlap / 2;

  circleA.x -= normalX * correction;
  circleA.y -= normalY * correction;
  circleB.x += normalX * correction;
  circleB.y += normalY * correction;
};

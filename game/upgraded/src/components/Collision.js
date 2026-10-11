import * as THREE from 'three';

// Extra spacing (world units) added between two bodies before they count as colliding.
// Raise it to keep characters further apart; lower (or negative) to let them get closer.
export const COLLISION_DISTANCE = 2;

// Share of the model's vertices that must fall inside the collision circle.
// Ignoring the outermost vertices keeps thin parts (wings, antennae) from inflating the hitbox.
const BODY_COVERAGE = 0.85;

const vertex = new THREE.Vector3();

// Static obstacles (houses), stored as ground footprints { minX, maxX, minY, maxY }
const obstacles = [];

export function addObstacle(footprint) {
  obstacles.push(footprint);
}

export function removeObstacle(footprint) {
  const index = obstacles.indexOf(footprint);
  if (index !== -1) obstacles.splice(index, 1);
}

function distanceToObstacle(x, y, footprint) {
  const dx = Math.max(footprint.minX - x, 0, x - footprint.maxX);
  const dy = Math.max(footprint.minY - y, 0, y - footprint.maxY);
  return Math.hypot(dx, dy);
}

/**
 * Whether a body of `radius` at (`x`, `y`) would overlap any obstacle.
 */
export function overlapsObstacle(x, y, radius) {
  return obstacles.some((footprint) => distanceToObstacle(x, y, footprint) < radius + COLLISION_DISTANCE);
}

/**
 * Whether a body of `radius` moving from `from` to (`toX`, `toY`) would run into an obstacle.
 * Like wouldCollide, moving away from an obstacle is always allowed.
 */
export function wouldHitObstacle(from, toX, toY, radius) {
  for (const footprint of obstacles) {
    const nextDistance = distanceToObstacle(toX, toY, footprint);
    if (nextDistance >= radius + COLLISION_DISTANCE) continue;
    if (nextDistance < distanceToObstacle(from.x, from.y, footprint)) return true;
  }
  return false;
}

/**
 * Measure a model's footprint on the ground plane from its actual vertices.
 * Returns the radius (around the model's origin, in the XY plane) that covers
 * BODY_COVERAGE of the geometry — a tighter fit than a raw bounding box.
 */
export function computeCollisionRadius(model) {
  model.updateMatrixWorld(true);

  const distances = [];
  model.traverse((child) => {
    if (!child.isMesh) return;

    const count = child.geometry.attributes.position.count;
    for (let i = 0; i < count; i++) {
      child.getVertexPosition(i, vertex);
      vertex.applyMatrix4(child.matrixWorld);
      distances.push(Math.hypot(vertex.x, vertex.y));
    }
  });

  if (distances.length === 0) return 0;

  distances.sort((a, b) => a - b);
  return distances[Math.floor((distances.length - 1) * BODY_COVERAGE)];
}

/**
 * Whether a body of `radius` at (`x`, `y`) touches `other` (object with `position` and `userData.radius`).
 */
export function isTouching(x, y, radius, other) {
  const limit = radius + other.userData.radius + COLLISION_DISTANCE;
  return Math.hypot(other.position.x - x, other.position.y - y) < limit;
}

/**
 * Whether a body of `radius` moving from `from` to (`toX`, `toY`) would collide
 * with any of `others` (objects with `position` and `userData.radius`).
 * Moving away from a body that is already too close is allowed, so nothing gets stuck.
 */
export function wouldCollide(from, toX, toY, radius, others) {
  for (const other of others) {
    if (other.position === from) continue;

    const limit = radius + other.userData.radius + COLLISION_DISTANCE;
    const nextDistance = Math.hypot(other.position.x - toX, other.position.y - toY);
    if (nextDistance >= limit) continue;

    const currentDistance = Math.hypot(other.position.x - from.x, other.position.y - from.y);
    if (nextDistance < currentDistance) return true;
  }
  return false;
}

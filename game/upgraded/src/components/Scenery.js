import * as THREE from 'three';
import { addObstacle } from './Collision.js';

// Scenery tuning: trees and rocks built from simple shapes, no model files needed
// (see "Customize it your way" in the Game world task)
const TREES_PER_CHUNK = 3; // placement attempts that succeed per map chunk, at most
const ROCKS_PER_CHUNK = 2;
const MAX_PLACEMENT_ATTEMPTS = 20;
const CLEAR_RADIUS_CENTER = 100; // keep the player's start area free
const MIN_GAP = 40; // room for characters to pass between obstacles

const TRUNK_RADIUS = 5;
const TRUNK_HEIGHT = 22;
const FOLIAGE_RADIUS = 22;
const FOLIAGE_HEIGHT = 34;
const ROCK_RADIUS = 12;

const trunkGeometry = new THREE.CylinderGeometry(TRUNK_RADIUS * 0.8, TRUNK_RADIUS, TRUNK_HEIGHT, 8);
trunkGeometry.rotateX(Math.PI / 2);
trunkGeometry.translate(0, 0, TRUNK_HEIGHT / 2);

const foliageGeometry = new THREE.ConeGeometry(FOLIAGE_RADIUS, FOLIAGE_HEIGHT, 8);
foliageGeometry.rotateX(Math.PI / 2);
foliageGeometry.translate(0, 0, FOLIAGE_HEIGHT / 2);

const rockGeometry = new THREE.DodecahedronGeometry(ROCK_RADIUS, 0);

const trunkMaterial = new THREE.MeshLambertMaterial({ color: '#8B5A2B' });
const foliageMaterials = ['#2E7D32', '#388E3C', '#1B5E20'].map(
  (color) => new THREE.MeshLambertMaterial({ color, flatShading: true })
);
const rockMaterial = new THREE.MeshLambertMaterial({ color: '#9E9E9E', flatShading: true });

function shadowed(mesh) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createTree(random) {
  const tree = new THREE.Group();
  const scale = 0.8 + random() * 0.5;
  const material = foliageMaterials[Math.floor(random() * foliageMaterials.length)];

  tree.add(shadowed(new THREE.Mesh(trunkGeometry, trunkMaterial)));

  // Two stacked cones, the upper one smaller
  const lower = shadowed(new THREE.Mesh(foliageGeometry, material));
  lower.position.z = TRUNK_HEIGHT * 0.6;
  const upper = shadowed(new THREE.Mesh(foliageGeometry, material));
  upper.scale.setScalar(0.7);
  upper.position.z = TRUNK_HEIGHT * 0.6 + FOLIAGE_HEIGHT * 0.45;
  tree.add(lower, upper);

  tree.scale.setScalar(scale);
  tree.rotation.z = random() * Math.PI * 2;
  // Only the trunk blocks movement, so characters can brush past the branches
  return { object: tree, halfSize: TRUNK_RADIUS * scale + 2 };
}

function createRock(random) {
  const rock = shadowed(new THREE.Mesh(rockGeometry, rockMaterial));
  const scale = 0.8 + random() * 0.8;
  rock.scale.set(scale * (1 + random() * 0.4), scale * (1 + random() * 0.4), scale * 0.6);
  rock.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
  // Sink it slightly so it sits on the ground instead of balancing on a corner
  rock.position.z = ROCK_RADIUS * scale * 0.35;
  return { object: rock, halfSize: ROCK_RADIUS * scale * 0.9 };
}

function distanceToFootprint(x, y, footprint) {
  const dx = Math.max(footprint.minX - x, 0, x - footprint.maxX);
  const dy = Math.max(footprint.minY - y, 0, y - footprint.maxY);
  return Math.hypot(dx, dy);
}

function footprintsOverlap(a, b, gap) {
  return (
    a.minX - gap < b.maxX && a.maxX + gap > b.minX &&
    a.minY - gap < b.maxY && a.maxY + gap > b.minY
  );
}

function placeAll(group, bounds, random, count, create, placed) {
  const inset = MIN_GAP / 2;
  let added = 0;
  for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS && added < count; attempt++) {
    const { object, halfSize } = create(random);
    const x = bounds.minX + inset + halfSize + random() * (bounds.maxX - bounds.minX - 2 * (inset + halfSize));
    const y = bounds.minY + inset + halfSize + random() * (bounds.maxY - bounds.minY - 2 * (inset + halfSize));
    const footprint = { minX: x - halfSize, maxX: x + halfSize, minY: y - halfSize, maxY: y + halfSize };

    if (distanceToFootprint(0, 0, footprint) < CLEAR_RADIUS_CENTER) continue;
    if (placed.some((other) => footprintsOverlap(footprint, other, MIN_GAP))) continue;

    object.position.x = x;
    object.position.y = y;
    group.add(object);
    addObstacle(footprint);
    placed.push(footprint);
    added++;
  }
}

/**
 * Scatter trees and rocks inside `bounds`, keeping clear of the `occupied` footprints (houses).
 * Each item blocks movement like a house; the new footprints are returned.
 */
export function createChunkScenery(group, bounds, random, occupied) {
  const placed = [...occupied];
  placeAll(group, bounds, random, TREES_PER_CHUNK, createTree, placed);
  placeAll(group, bounds, random, ROCKS_PER_CHUNK, createRock, placed);
  return placed.slice(occupied.length);
}

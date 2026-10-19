import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { addObstacle } from './Collision.js';

// House tuning
const HOUSES_PER_CHUNK = 1; // placement attempts that succeed per map chunk, at most
const HOUSE_SCALE = 65;
const CLEAR_RADIUS_CENTER = 100; // keep the player's start area free
const MIN_GAP_BETWEEN_HOUSES = 40; // room for characters to pass between houses
const MAX_PLACEMENT_ATTEMPTS = 20;

let template = null;

// Resolves once the house model is loaded; chunks wait on it before placing houses
export const houseTemplateReady = new Promise((resolve) => {
  const loader = new GLTFLoader();
  loader.load(import.meta.env.BASE_URL + 'models/small_house.glb', (gltf) => {
    template = gltf.scene;
    template.scale.setScalar(HOUSE_SCALE);
    template.rotation.x = Math.PI / 2;
    template.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    resolve();
  });
});

function randomBetween(random, min, max) {
  return min + random() * (max - min);
}

// Distance from point (x, y) to the closest point of a footprint rectangle
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

function isValidSpot(footprint, placed) {
  if (distanceToFootprint(0, 0, footprint) < CLEAR_RADIUS_CENTER) return false;
  return placed.every((other) => !footprintsOverlap(footprint, other, MIN_GAP_BETWEEN_HOUSES));
}

function createHouse(random) {
  const house = template.clone();
  house.rotation.y = Math.floor(random() * 4) * (Math.PI / 2);

  // Sit exactly on the ground (z = 0)
  house.position.set(0, 0, 0);
  const box = new THREE.Box3().setFromObject(house);
  house.position.z = -box.min.z;

  return { house, box };
}

/**
 * Place up to HOUSES_PER_CHUNK houses at free spots inside `bounds`, adding them to `group`.
 * `random` is the chunk's seeded generator, so a chunk always gets the same houses.
 * Each house's ground footprint is registered as a collision obstacle; the footprints are returned.
 */
export function createChunkHouses(group, bounds, random) {
  // Stay half a gap away from the chunk edge, so houses in neighboring chunks keep the full gap
  const inset = MIN_GAP_BETWEEN_HOUSES / 2;
  const placed = [];
  for (let attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS && placed.length < HOUSES_PER_CHUNK; attempt++) {
    const { house, box } = createHouse(random);

    // Footprint relative to the house origin, shifted to a random spot inside the chunk
    const halfWidth = (box.max.x - box.min.x) / 2;
    const halfDepth = (box.max.y - box.min.y) / 2;
    const centerX = randomBetween(random, bounds.minX + inset + halfWidth, bounds.maxX - inset - halfWidth);
    const centerY = randomBetween(random, bounds.minY + inset + halfDepth, bounds.maxY - inset - halfDepth);
    const x = centerX - (box.min.x + halfWidth);
    const y = centerY - (box.min.y + halfDepth);
    const footprint = {
      minX: box.min.x + x,
      maxX: box.max.x + x,
      minY: box.min.y + y,
      maxY: box.max.y + y,
    };
    if (!isValidSpot(footprint, placed)) continue;

    house.position.x = x;
    house.position.y = y;
    group.add(house);
    addObstacle(footprint);
    placed.push(footprint);
  }
  return placed;
}

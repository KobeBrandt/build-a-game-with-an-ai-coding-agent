import * as THREE from 'three';
import { createChunkHouses, houseTemplateReady } from './House.js';
import { createChunkScenery } from './Scenery.js';
import { removeObstacle } from './Collision.js';

// Map tuning
export const TILE_SIZE = 40; // matches the player's jump distance, so each hop lands on the next tile
const CHUNK_TILES = 8; // tiles per chunk side (must be even so the checker pattern lines up)
const LOAD_RADIUS = 3; // chunks kept loaded on each side of the player's chunk
const UNLOAD_RADIUS = LOAD_RADIUS + 1; // a little slack so chunks don't flicker at the border
const DARK_GREEN = '#228B22';
const LIGHT_GREEN = '#90EE90';
const TEXTURE_PIXELS_PER_TILE = 32; // grass detail painted inside each tile
const GRASS_BLADES_PER_TILE = 60;

const CHUNK_SIZE = TILE_SIZE * CHUNK_TILES;

// Random seed for this page load; each chunk derives its own seed from it,
// so a chunk looks the same every time it is reloaded
const WORLD_SEED = Math.floor(Math.random() * 2 ** 32);

function hashChunk(cx, cy) {
  let h = WORLD_SEED ^ Math.imul(cx, 374761393) ^ Math.imul(cy, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

// Small seeded PRNG (mulberry32), returns floats in [0, 1)
function seededRandom(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One grassy checkerboard texture shared by every chunk: the original two greens,
// with short darker and lighter blades painted over each tile
function createGrassTexture() {
  const size = CHUNK_TILES * TEXTURE_PIXELS_PER_TILE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const random = seededRandom(12345);

  for (let column = 0; column < CHUNK_TILES; column++) {
    for (let row = 0; row < CHUNK_TILES; row++) {
      // Canvas rows run top-down, world Y runs bottom-up
      const tileY = CHUNK_TILES - 1 - row;
      const left = column * TEXTURE_PIXELS_PER_TILE;
      const top = row * TEXTURE_PIXELS_PER_TILE;
      context.fillStyle = (column + tileY) % 2 === 0 ? DARK_GREEN : LIGHT_GREEN;
      context.fillRect(left, top, TEXTURE_PIXELS_PER_TILE, TEXTURE_PIXELS_PER_TILE);

      for (let blade = 0; blade < GRASS_BLADES_PER_TILE; blade++) {
        const x = left + random() * TEXTURE_PIXELS_PER_TILE;
        const y = top + 2 + random() * (TEXTURE_PIXELS_PER_TILE - 2);
        const shade = random() < 0.5 ? 0 : 255;
        context.strokeStyle = `rgba(${shade}, ${shade === 0 ? 60 : 255}, ${shade === 0 ? 0 : 200}, ${0.08 + random() * 0.12})`;
        context.lineWidth = 1;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + (random() - 0.5) * 3, y - 2 - random() * 3);
        context.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const chunkGeometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
const chunkMaterial = new THREE.MeshLambertMaterial({ map: createGrassTexture() });

// Loaded chunks by "cx,cy" key: { group, footprints }
const chunks = new Map();

// Chunk (cx, cy) covers tiles cx * CHUNK_TILES .. cx * CHUNK_TILES + CHUNK_TILES - 1
function chunkBounds(cx, cy) {
  const minX = (cx * CHUNK_TILES - 0.5) * TILE_SIZE;
  const minY = (cy * CHUNK_TILES - 0.5) * TILE_SIZE;
  return { minX, maxX: minX + CHUNK_SIZE, minY, maxY: minY + CHUNK_SIZE };
}

function chunkCoordinate(value) {
  return Math.floor(Math.round(value / TILE_SIZE) / CHUNK_TILES);
}

function loadChunk(map, cx, cy) {
  const bounds = chunkBounds(cx, cy);
  const group = new THREE.Group();

  const ground = new THREE.Mesh(chunkGeometry, chunkMaterial);
  ground.position.set((bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2, 0);
  ground.receiveShadow = true;
  ground.userData.ground = true;
  group.add(ground);

  const chunk = { group, footprints: [], loaded: true };
  houseTemplateReady.then(() => {
    if (!chunk.loaded) return;
    const random = seededRandom(hashChunk(cx, cy));
    const houses = createChunkHouses(group, bounds, random);
    chunk.footprints = [...houses, ...createChunkScenery(group, bounds, random, houses)];
  });

  map.add(group);
  chunks.set(`${cx},${cy}`, chunk);
}

function unloadChunk(map, key) {
  const chunk = chunks.get(key);
  chunk.loaded = false;
  map.remove(chunk.group);
  for (const footprint of chunk.footprints) removeObstacle(footprint);
  chunks.delete(key);
}

export function GameMap() {
  const map = new THREE.Group();
  updateMap(map, new THREE.Vector3());
  return map;
}

let lastChunkKey = null;

/**
 * Load the chunks around `position` and drop the ones that are far away.
 * Cheap to call every frame: it only does work when the player enters a new chunk.
 */
export function updateMap(map, position) {
  const centerX = chunkCoordinate(position.x);
  const centerY = chunkCoordinate(position.y);
  const centerKey = `${centerX},${centerY}`;
  if (centerKey === lastChunkKey) return;
  lastChunkKey = centerKey;

  for (const key of [...chunks.keys()]) {
    const [cx, cy] = key.split(',').map(Number);
    if (Math.abs(cx - centerX) > UNLOAD_RADIUS || Math.abs(cy - centerY) > UNLOAD_RADIUS) {
      unloadChunk(map, key);
    }
  }

  for (let cx = centerX - LOAD_RADIUS; cx <= centerX + LOAD_RADIUS; cx++) {
    for (let cy = centerY - LOAD_RADIUS; cy <= centerY + LOAD_RADIUS; cy++) {
      if (!chunks.has(`${cx},${cy}`)) loadChunk(map, cx, cy);
    }
  }
}

// --- See-through obstacles ---------------------------------------------------------
// Houses, trees and rocks standing between the camera and the area around Tode turn see-through,
// so they never hide Tode or an enemy closing in.

const FADE_OPACITY = 0.3;
const FADE_BEHIND = 30; // world units behind Tode (away from the camera) that still count
const FADE_AHEAD = 170; // world units in front of Tode (toward the camera) that count
const FADE_WIDTH = 70; // world units to each side of the line from Tode to the camera

// See-through copy of each shared material, made the first time it is needed
const fadedMaterials = new Map();

function fadedMaterial(material) {
  if (!fadedMaterials.has(material)) {
    const faded = material.clone();
    faded.transparent = true;
    faded.opacity = FADE_OPACITY;
    faded.depthWrite = false;
    fadedMaterials.set(material, faded);
  }
  return fadedMaterials.get(material);
}

function setFaded(object, faded) {
  if (object.userData.faded === faded) return;
  object.userData.faded = faded;
  object.traverse((child) => {
    if (!child.isMesh) return;
    if (!child.userData.solidMaterial) child.userData.solidMaterial = child.material;
    const solid = child.userData.solidMaterial;
    child.material = faded ? (Array.isArray(solid) ? solid.map(fadedMaterial) : fadedMaterial(solid)) : solid;
  });
}

const toCamera = new THREE.Vector2();
const sideways = new THREE.Vector2();
const toObject = new THREE.Vector2();
const objectBox = new THREE.Box3();
const objectSize = new THREE.Vector3();

/**
 * Fade the obstacles between the camera and Tode. `cameraOffset` is the camera's position
 * relative to Tode.
 */
export function updateOccluders(position, cameraOffset) {
  toCamera.set(cameraOffset.x, cameraOffset.y).normalize();
  sideways.set(-toCamera.y, toCamera.x);
  for (const { group } of chunks.values()) {
    for (const object of group.children) {
      if (object.userData.ground) continue;
      // The object's centre and half its width on the ground, measured once (obstacles never move)
      if (!object.userData.fadeCenter) {
        objectBox.setFromObject(object);
        objectBox.getSize(objectSize);
        object.userData.fadeCenter = objectBox.getCenter(new THREE.Vector3());
        object.userData.halfWidth = Math.max(objectSize.x, objectSize.y) / 2;
      }
      const { fadeCenter, halfWidth } = object.userData;
      toObject.set(fadeCenter.x - position.x, fadeCenter.y - position.y);
      const ahead = toObject.dot(toCamera);
      const side = Math.abs(toObject.dot(sideways));
      setFaded(
        object,
        ahead > -FADE_BEHIND - halfWidth && ahead < FADE_AHEAD + halfWidth && side < FADE_WIDTH + halfWidth
      );
    }
  }
}

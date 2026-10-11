import * as THREE from 'three';
import { createChunkHouses, houseTemplateReady } from './House.js';
import { removeObstacle } from './Collision.js';

// Map tuning
export const TILE_SIZE = 40; // matches the player's jump distance, so each hop lands on the next tile
const CHUNK_TILES = 8; // tiles per chunk side (must be even so the checker pattern lines up)
const LOAD_RADIUS = 3; // chunks kept loaded on each side of the player's chunk
const UNLOAD_RADIUS = LOAD_RADIUS + 1; // a little slack so chunks don't flicker at the border
const DARK_GREEN = '#228B22';
const LIGHT_GREEN = '#90EE90';

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

// One checkerboard texture shared by every chunk, one pixel per tile
function createCheckerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = CHUNK_TILES;
  canvas.height = CHUNK_TILES;
  const context = canvas.getContext('2d');
  for (let column = 0; column < CHUNK_TILES; column++) {
    for (let row = 0; row < CHUNK_TILES; row++) {
      // Canvas rows run top-down, world Y runs bottom-up
      const tileY = CHUNK_TILES - 1 - row;
      context.fillStyle = (column + tileY) % 2 === 0 ? DARK_GREEN : LIGHT_GREEN;
      context.fillRect(column, row, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const chunkGeometry = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE);
const chunkMaterial = new THREE.MeshLambertMaterial({ map: createCheckerTexture() });

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
  group.add(ground);

  const chunk = { group, footprints: [], loaded: true };
  houseTemplateReady.then(() => {
    if (!chunk.loaded) return;
    chunk.footprints = createChunkHouses(group, bounds, seededRandom(hashChunk(cx, cy)));
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

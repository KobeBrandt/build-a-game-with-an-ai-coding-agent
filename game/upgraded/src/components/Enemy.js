import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  COLLISION_DISTANCE,
  computeCollisionRadius,
  isTouching,
  overlapsObstacle,
  wouldCollide,
  wouldHitObstacle,
} from './Collision.js';
import { TILE_SIZE } from './Map.js';
import { getMode } from './Modes.js';

// Enemy tuning (speed, spawn delay and enemy cap come from the selected game mode)
const SPAWN_DISTANCE = TILE_SIZE * 8; // spawn points sit this far from the player on each axis
const DESPAWN_DISTANCE = 1200; // enemies left this far behind are removed
const DEFEAT_DURATION = 0.25; // seconds a defeated enemy takes to spin and shrink away
const SPAWN_DURATION = 0.35; // seconds a new enemy takes to grow in

// Spawn points relative to the player (the corners of a square around it)
const SPAWN_OFFSETS = [
  new THREE.Vector2(-SPAWN_DISTANCE, -SPAWN_DISTANCE),
  new THREE.Vector2(SPAWN_DISTANCE, -SPAWN_DISTANCE),
  new THREE.Vector2(SPAWN_DISTANCE, SPAWN_DISTANCE),
  new THREE.Vector2(-SPAWN_DISTANCE, SPAWN_DISTANCE),
];

export const enemies = [];

let template = null;
let templateRadius = 0;

const loader = new GLTFLoader();
loader.load('/models/enemy.glb', (gltf) => {
  const model = gltf.scene;
  model.scale.setScalar(5);
  model.rotation.x = Math.PI / 2;

  // Lift the model so its lowest point sits flush on the ground (z = 0)
  const box = new THREE.Box3().setFromObject(model);
  model.position.z = -box.min.z;
  model.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });

  template = model;
  templateRadius = computeCollisionRadius(model);
});

function createEnemy(spawnPoint) {
  const enemy = new THREE.Group();
  const model = cloneSkinned(template);
  enemy.add(model);
  enemy.position.set(spawnPoint.x, spawnPoint.y, 0);
  enemy.userData.model = model;
  enemy.userData.radius = templateRadius;
  // Which way this enemy walks around obstacles: 1 = left, -1 = right
  enemy.userData.detourSide = Math.random() < 0.5 ? 1 : -1;
  enemy.userData.age = 0;
  enemy.scale.setScalar(0.01);
  return enemy;
}

// Current values, scaled by setEnemyDifficulty
let enemySpeed = getMode().enemySpeed;
let spawnDelay = getMode().spawnDelay;

export function setEnemyDifficulty(speedMultiplier, spawnDelayMultiplier) {
  const mode = getMode();
  enemySpeed = mode.enemySpeed * speedMultiplier;
  spawnDelay = mode.spawnDelay * spawnDelayMultiplier;
}

let spawnTimer = Infinity; // spawn the first enemy right away
let nextSpawnIndex = 0;

const spawnPoint = new THREE.Vector2();

function isSpawnPointFree(spawnPoint, bodies) {
  if (overlapsObstacle(spawnPoint.x, spawnPoint.y, templateRadius)) return false;
  return bodies.every((body) => {
    const limit = templateRadius + body.userData.radius + COLLISION_DISTANCE;
    return Math.hypot(body.position.x - spawnPoint.x, body.position.y - spawnPoint.y) >= limit;
  });
}

function spawnEnemies(scene, delta, player) {
  spawnTimer += delta;
  if (spawnTimer < spawnDelay || !template || enemies.length >= getMode().maxEnemies) return;

  spawnPoint.set(player.position.x, player.position.y).add(SPAWN_OFFSETS[nextSpawnIndex]);
  nextSpawnIndex = (nextSpawnIndex + 1) % SPAWN_OFFSETS.length;
  // Occupied corner (enemy or house): try the next one on the following frame
  if (!isSpawnPointFree(spawnPoint, [player, ...enemies])) return;

  spawnTimer = 0;
  const enemy = createEnemy(spawnPoint);

  enemies.push(enemy);
  scene.add(enemy);
}

const toTarget = new THREE.Vector2();

// Try the direct step first, then slide along each axis, then sidestep,
// so enemies can work around each other and around houses
function moveEnemy(enemy, stepX, stepY, others) {
  const { position } = enemy;
  const { radius, detourSide } = enemy.userData;
  const candidates = [
    [stepX, stepY],
    [stepX, 0],
    [0, stepY],
    [-stepY * detourSide, stepX * detourSide],
  ];

  for (const [dx, dy] of candidates) {
    if (dx === 0 && dy === 0) continue;
    const nextX = position.x + dx;
    const nextY = position.y + dy;
    if (
      !wouldCollide(position, nextX, nextY, radius, others) &&
      !wouldHitObstacle(position, nextX, nextY, radius)
    ) {
      position.x += dx;
      position.y += dy;
      return;
    }
  }
}

// Drop enemies the player has left far behind, so new ones can spawn nearby
function despawnFarEnemies(scene, player) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    const distance = Math.hypot(enemy.position.x - player.position.x, enemy.position.y - player.position.y);
    if (distance > DESPAWN_DISTANCE) {
      scene.remove(enemy);
      enemies.splice(i, 1);
    }
  }
}

// Defeated enemies, playing their short exit animation: { enemy, remaining }
const defeated = [];

/**
 * Remove `enemy` from play and let it spin and shrink away instead of vanishing at once.
 */
export function defeatEnemy(scene, enemy) {
  const index = enemies.indexOf(enemy);
  if (index !== -1) enemies.splice(index, 1);
  defeated.push({ enemy, scene, remaining: DEFEAT_DURATION });
}

export function updateDefeatedEnemies(delta) {
  for (let i = defeated.length - 1; i >= 0; i--) {
    const entry = defeated[i];
    entry.remaining -= delta;
    const { enemy } = entry;
    if (entry.remaining <= 0) {
      entry.scene.remove(enemy);
      defeated.splice(i, 1);
      continue;
    }
    const t = entry.remaining / DEFEAT_DURATION;
    enemy.scale.setScalar(t);
    enemy.rotation.z += delta * 20;
    enemy.position.z += delta * 60;
  }
}

function growNewEnemies(delta) {
  for (const enemy of enemies) {
    if (enemy.userData.age >= SPAWN_DURATION) continue;
    enemy.userData.age = Math.min(SPAWN_DURATION, enemy.userData.age + delta);
    const t = enemy.userData.age / SPAWN_DURATION;
    // Ease out with a small overshoot, so enemies "pop" into the world
    enemy.scale.setScalar(Math.max(0.01, 1 + 0.2 * Math.sin(t * Math.PI) - (1 - t) ** 2));
  }
}

// Returns true if an enemy reached the player (game over)
export function updateEnemies(scene, delta, player) {
  despawnFarEnemies(scene, player);
  spawnEnemies(scene, delta, player);
  growNewEnemies(delta);

  const target = player.position;

  for (const enemy of enemies) {
    toTarget.set(target.x - enemy.position.x, target.y - enemy.position.y);
    const distance = toTarget.length();
    if (distance < 0.001) continue;

    const step = Math.min(distance, enemySpeed * delta);
    toTarget.divideScalar(distance);

    // Face the player (model.rotation.y spins around world Z, 0 faces -Y)
    enemy.userData.model.rotation.y = Math.atan2(toTarget.x, -toTarget.y);

    // Reaching the player takes priority over being blocked by it
    const nextX = enemy.position.x + toTarget.x * step;
    const nextY = enemy.position.y + toTarget.y * step;
    if (isTouching(nextX, nextY, enemy.userData.radius, player)) return true;

    moveEnemy(enemy, toTarget.x * step, toTarget.y * step, enemies);
  }
  return false;
}

export function resetEnemies(scene) {
  for (const enemy of enemies) scene.remove(enemy);
  enemies.length = 0;
  for (const { enemy } of defeated) scene.remove(enemy);
  defeated.length = 0;
  enemySpeed = getMode().enemySpeed;
  spawnDelay = getMode().spawnDelay;
  spawnTimer = Infinity; // spawn at the first corner right away again
  nextSpawnIndex = 0;
}

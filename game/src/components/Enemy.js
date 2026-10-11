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

// Enemy tuning
const ENEMY_SPEED = 40; // base units per second
const SPAWN_DELAY = 3; // base seconds between spawns
const MAX_ENEMIES = 20;
const SPAWN_DISTANCE = TILE_SIZE * 8; // spawn points sit this far from the player on each axis
const DESPAWN_DISTANCE = 1200; // enemies left this far behind are removed

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
  return enemy;
}

// Current values, scaled by setEnemyDifficulty
let enemySpeed = ENEMY_SPEED;
let spawnDelay = SPAWN_DELAY;

export function setEnemyDifficulty(speedMultiplier, spawnDelayMultiplier) {
  enemySpeed = ENEMY_SPEED * speedMultiplier;
  spawnDelay = SPAWN_DELAY * spawnDelayMultiplier;
}

let spawnTimer = SPAWN_DELAY; // spawn the first enemy right away
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
  if (spawnTimer < spawnDelay || !template || enemies.length >= MAX_ENEMIES) return;

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

// Returns true if an enemy reached the player (game over)
export function updateEnemies(scene, delta, player) {
  despawnFarEnemies(scene, player);
  spawnEnemies(scene, delta, player);

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
  spawnTimer = SPAWN_DELAY; // spawn at the first corner right away again
  nextSpawnIndex = 0;
}

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
import { getSecondsPerBeat, SFX } from './Audio.js';
import { getCurrentBeat } from './Rhythm.js';

// Enemy tuning (speed, spawn delay and enemy cap come from the selected game mode)
const SPAWN_DISTANCE = TILE_SIZE * 8; // spawn points sit this far from the player on each axis
const DESPAWN_DISTANCE = 1200; // enemies left this far behind are removed
const DEFEAT_DURATION = 0.25; // seconds a defeated enemy takes to spin and shrink away
const SPAWN_DURATION = 0.35; // seconds a new enemy takes to grow in

// Health tuning (base health per enemy comes from the selected game mode)
const KNOCKBACK_DISTANCE = 14; // how far a hit that doesn't defeat an enemy pushes it away
const HIT_FLASH_DURATION = 0.15; // seconds a hit enemy stays squashed
const HEALTH_BAR_WIDTH = 24;
const HEALTH_BAR_HEIGHT = 3;
const HEALTH_BAR_GAP = 6; // space between the top of the model and the bar

// Hoppers: pink enemies that only move on the beat, one hop per beat, so they can be dodged in time
// with the music. A hop covers what a walker walks in a beat, so they keep the same average speed.
const HOPPER_TINT = new THREE.Color(0xe12885);
const HOPPER_HOP_BEATS = 0.35; // share of a beat a hop lasts
const HOPPER_HOP_HEIGHT = 12;
const HOPPER_CROUCH = 0.18; // how low a hopper crouches just before its hop (the tell)
const HOPPER_CROUCH_BEATS = 0.3; // how long before the beat it starts to crouch
const NO_MUSIC_BEAT = 0.5; // seconds between hops when there is no music
// Spawn points relative to the player (the corners of a square around it)
const SPAWN_OFFSETS = [
  new THREE.Vector2(-SPAWN_DISTANCE, -SPAWN_DISTANCE),
  new THREE.Vector2(SPAWN_DISTANCE, -SPAWN_DISTANCE),
  new THREE.Vector2(SPAWN_DISTANCE, SPAWN_DISTANCE),
  new THREE.Vector2(-SPAWN_DISTANCE, SPAWN_DISTANCE),
];
// Waves also use the middle of each side
const WAVE_OFFSETS = [
  ...SPAWN_OFFSETS,
  new THREE.Vector2(0, -SPAWN_DISTANCE),
  new THREE.Vector2(SPAWN_DISTANCE, 0),
  new THREE.Vector2(0, SPAWN_DISTANCE),
  new THREE.Vector2(-SPAWN_DISTANCE, 0),
];

export const enemies = [];

let template = null;
let hopperTemplate = null;
let templateRadius = 0;
let templateHeight = 0;

// Health bars are sprites, so they always face the camera; they only show once an enemy is hurt
const healthBarBackMaterial = new THREE.SpriteMaterial({ color: 0x1a1a1a, depthTest: false });
const healthBarFillMaterial = new THREE.SpriteMaterial({ color: 0xff4d4d, depthTest: false });

function createHealthBar() {
  const bar = new THREE.Group();
  const back = new THREE.Sprite(healthBarBackMaterial);
  back.scale.set(HEALTH_BAR_WIDTH + 2, HEALTH_BAR_HEIGHT + 2, 1);
  // The fill grows from its left edge
  const fill = new THREE.Sprite(healthBarFillMaterial);
  fill.center.set(0, 0.5);
  fill.position.x = -HEALTH_BAR_WIDTH / 2;
  fill.scale.set(HEALTH_BAR_WIDTH, HEALTH_BAR_HEIGHT, 1);
  back.renderOrder = 10;
  fill.renderOrder = 11;
  bar.add(back, fill);
  bar.position.z = templateHeight + HEALTH_BAR_GAP;
  bar.visible = false;
  bar.userData.fill = fill;
  return bar;
}

const loader = new GLTFLoader();
// Resolves once enemies can be spawned
export const enemyReady = new Promise((resolve) => {
  loader.load(import.meta.env.BASE_URL + 'models/enemy.glb', (gltf) => {
    setUpTemplate(gltf);
    resolve();
  });
});

function setUpTemplate(gltf) {
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
  templateHeight = box.max.z - box.min.z;

  // Hoppers get their own pink-tinted copies of the materials
  hopperTemplate = cloneSkinned(model);
  hopperTemplate.traverse((child) => {
    if (!child.isMesh) return;
    child.material = child.material.clone();
    child.material.color.lerp(HOPPER_TINT, 0.6);
  });
}

// Called on every hit: (enemy, damage, defeated); main.js uses it for damage numbers and particles
let damageListener = null;

export function setDamageListener(listener) {
  damageListener = listener;
}

function createEnemy(spawnPoint, hopper) {
  const enemy = new THREE.Group();
  const model = cloneSkinned(hopper ? hopperTemplate : template);
  enemy.add(model);
  enemy.position.set(spawnPoint.x, spawnPoint.y, 0);
  enemy.userData.model = model;
  enemy.userData.radius = templateRadius;
  // Which way this enemy walks around obstacles: 1 = left, -1 = right
  enemy.userData.detourSide = Math.random() < 0.5 ? 1 : -1;
  enemy.userData.age = 0;
  enemy.userData.maxHealth = enemyHealth;
  enemy.userData.health = enemyHealth;
  enemy.userData.hitTimer = 0;
  enemy.userData.hopper = hopper;
  enemy.userData.lastHopBeat = null;
  enemy.userData.hopProgress = 1; // 1 = standing, less = mid-hop
  enemy.userData.hopTimer = 0; // seconds until the next hop, without music
  enemy.userData.healthBar = createHealthBar();
  enemy.add(enemy.userData.healthBar);
  enemy.scale.setScalar(0.01);
  return enemy;
}

// Current values, scaled by setEnemyDifficulty
let enemySpeed = getMode().enemySpeed;
let spawnDelay = getMode().spawnDelay;
let enemyHealth = getMode().enemyHealth;

// Share of new enemies that are hoppers (set by main.js from the level)
let hopperChance = 0;

export function setHopperChance(chance) {
  hopperChance = chance;
}

// Health only applies to enemies spawned from now on; enemies already out keep theirs
export function setEnemyDifficulty(speedMultiplier, spawnDelayMultiplier, healthMultiplier = 1) {
  const mode = getMode();
  enemySpeed = mode.enemySpeed * speedMultiplier;
  spawnDelay = mode.spawnDelay * spawnDelayMultiplier;
  enemyHealth = Math.round(mode.enemyHealth * healthMultiplier);
}

let spawnTimer = Infinity; // spawn the first enemy right away
let nextSpawnIndex = 0;
let lastSpawnBeat = null; // with music, enemies only spawn as a new beat starts

const spawnPoint = new THREE.Vector2();

function isSpawnPointFree(spawnPoint, bodies) {
  if (overlapsObstacle(spawnPoint.x, spawnPoint.y, templateRadius)) return false;
  return bodies.every((body) => {
    const limit = templateRadius + body.userData.radius + COLLISION_DISTANCE;
    return Math.hypot(body.position.x - spawnPoint.x, body.position.y - spawnPoint.y) >= limit;
  });
}

function addEnemy(scene, point) {
  const enemy = createEnemy(point, Math.random() < hopperChance);
  enemies.push(enemy);
  scene.add(enemy);
}

function spawnEnemies(scene, delta, player) {
  spawnTimer += delta;
  const beat = getCurrentBeat();
  const beatIndex = beat === null ? null : Math.floor(beat);
  const newBeat = beatIndex === null || beatIndex !== lastSpawnBeat;
  lastSpawnBeat = beatIndex;
  if (spawnTimer < spawnDelay || !newBeat || !template || enemies.length >= getMode().maxEnemies) return;

  spawnPoint.set(player.position.x, player.position.y).add(SPAWN_OFFSETS[nextSpawnIndex]);
  nextSpawnIndex = (nextSpawnIndex + 1) % SPAWN_OFFSETS.length;
  // Occupied corner (enemy or house): try the next one on the following frame
  if (!isSpawnPointFree(spawnPoint, [player, ...enemies])) return;

  spawnTimer = 0;
  addEnemy(scene, spawnPoint);
}

/**
 * Spawn up to `count` extra enemies at once around the player (a wave), within the mode's
 * enemy cap. Returns how many spawned.
 */
export function spawnWave(scene, player, count) {
  if (!template) return 0;
  let spawned = 0;
  const start = Math.floor(Math.random() * WAVE_OFFSETS.length);
  for (let i = 0; i < WAVE_OFFSETS.length && spawned < count; i++) {
    if (enemies.length >= getMode().maxEnemies) break;
    spawnPoint.set(player.position.x, player.position.y).add(WAVE_OFFSETS[(start + i) % WAVE_OFFSETS.length]);
    if (!isSpawnPointFree(spawnPoint, [player, ...enemies])) continue;
    addEnemy(scene, spawnPoint);
    spawned++;
  }
  return spawned;
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

/**
 * Deal `amount` damage to `enemy`, pushing it away from (`fromX`, `fromY`).
 * Returns true if the hit defeated it.
 */
export function damageEnemy(scene, enemy, amount, fromX, fromY) {
  const { userData } = enemy;
  userData.health -= amount;
  if (damageListener) damageListener(enemy, amount, userData.health <= 0);
  if (userData.health <= 0) {
    SFX.kill();
    userData.healthBar.visible = false;
    defeatEnemy(scene, enemy);
    return true;
  }

  SFX.hit();
  userData.hitTimer = HIT_FLASH_DURATION;
  userData.healthBar.visible = true;
  const share = userData.health / userData.maxHealth;
  userData.healthBar.userData.fill.scale.x = HEALTH_BAR_WIDTH * share;

  // Knock the enemy back, unless a house or another body is in the way
  const dx = enemy.position.x - fromX;
  const dy = enemy.position.y - fromY;
  const distance = Math.hypot(dx, dy);
  if (distance > 0.001) {
    const nextX = enemy.position.x + (dx / distance) * KNOCKBACK_DISTANCE;
    const nextY = enemy.position.y + (dy / distance) * KNOCKBACK_DISTANCE;
    if (
      !wouldCollide(enemy.position, nextX, nextY, userData.radius, enemies) &&
      !wouldHitObstacle(enemy.position, nextX, nextY, userData.radius)
    ) {
      enemy.position.x = nextX;
      enemy.position.y = nextY;
    }
  }
  return false;
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
    if (enemy.userData.age >= SPAWN_DURATION) {
      // A hit enemy squashes flat and springs back
      if (enemy.userData.hitTimer > 0) {
        enemy.userData.hitTimer = Math.max(0, enemy.userData.hitTimer - delta);
        const squash = 0.25 * (enemy.userData.hitTimer / HIT_FLASH_DURATION);
        enemy.scale.set(1 + squash, 1 + squash, 1 - squash);
      }
      continue;
    }
    enemy.userData.age = Math.min(SPAWN_DURATION, enemy.userData.age + delta);
    if (enemy.userData.age >= SPAWN_DURATION) enemy.scale.setScalar(1);
    const t = enemy.userData.age / SPAWN_DURATION;
    // Ease out with a small overshoot, so enemies "pop" into the world
    enemy.scale.setScalar(Math.max(0.01, 1 + 0.2 * Math.sin(t * Math.PI) - (1 - t) ** 2));
  }
}

/**
 * Move a hopper: crouch just before each beat, then hop toward the player on the beat.
 * Returns the step to take this frame as [x, y] along `direction` (a unit vector).
 */
function hopperStep(enemy, delta, direction) {
  const { userData } = enemy;
  const beat = getCurrentBeat();
  const beatLength = beat === null ? NO_MUSIC_BEAT : getSecondsPerBeat();

  // A new beat starts a hop
  let startHop = false;
  if (beat === null) {
    userData.hopTimer -= delta;
    if (userData.hopTimer <= 0) {
      userData.hopTimer = NO_MUSIC_BEAT;
      startHop = true;
    }
  } else {
    const index = Math.floor(beat);
    if (beat >= 0 && index !== userData.lastHopBeat) {
      startHop = userData.lastHopBeat !== null;
      userData.lastHopBeat = index;
    }
  }
  if (startHop) userData.hopProgress = 0;

  const ready = userData.age >= SPAWN_DURATION && userData.hitTimer === 0;
  if (userData.hopProgress >= 1) {
    enemy.position.z = 0;
    // The tell: crouch lower as the beat comes closer
    const untilBeat = beat === null ? userData.hopTimer / NO_MUSIC_BEAT : Math.ceil(beat) - beat;
    const crouch = untilBeat < HOPPER_CROUCH_BEATS ? HOPPER_CROUCH * (1 - untilBeat / HOPPER_CROUCH_BEATS) : 0;
    if (ready) enemy.scale.set(1 + crouch / 2, 1 + crouch / 2, 1 - crouch);
    return [0, 0];
  }

  const previous = userData.hopProgress;
  userData.hopProgress = Math.min(1, previous + delta / (HOPPER_HOP_BEATS * beatLength));
  enemy.position.z = Math.sin(userData.hopProgress * Math.PI) * HOPPER_HOP_HEIGHT;
  if (ready) enemy.scale.set(0.92, 0.92, 1.15);
  // One hop covers a beat's worth of walking
  const distance = enemySpeed * beatLength * (userData.hopProgress - previous);
  return [direction.x * distance, direction.y * distance];
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

    toTarget.divideScalar(distance);

    // Face the player (model.rotation.y spins around world Z, 0 faces -Y)
    enemy.userData.model.rotation.y = Math.atan2(toTarget.x, -toTarget.y);

    let stepX;
    let stepY;
    if (enemy.userData.hopper) {
      [stepX, stepY] = hopperStep(enemy, delta, toTarget);
      if (stepX === 0 && stepY === 0) continue;
    } else {
      const step = Math.min(distance, enemySpeed * delta);
      stepX = toTarget.x * step;
      stepY = toTarget.y * step;
    }

    // Reaching the player takes priority over being blocked by it
    const nextX = enemy.position.x + stepX;
    const nextY = enemy.position.y + stepY;
    if (isTouching(nextX, nextY, enemy.userData.radius, player)) return true;

    moveEnemy(enemy, stepX, stepY, enemies);
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
  enemyHealth = getMode().enemyHealth;
  spawnTimer = Infinity; // spawn at the first corner right away again
  nextSpawnIndex = 0;
  lastSpawnBeat = null;
  hopperChance = 0;
}

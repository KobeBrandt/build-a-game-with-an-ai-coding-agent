import * as THREE from 'three';
import { damageEnemy } from './Enemy.js';
import { getFacing } from './Player.js';
import { isTouching, overlapsObstacle } from './Collision.js';

// Attacks the player picks from on the start and game over screens.
// `cooldown` is the base seconds between uses and `damage` the base damage per hit;
// cooldown, reach and damage upgrades scale every attack.
// Damage is balanced against how each attack hits (enemy health is set per mode in Modes.js):
// - Shockwave is slow, short and must be aimed by moving, but hits every enemy around Tode,
//   so it hits hardest (one-shots a fresh Classic enemy).
// - Tongue fires on its own at one enemy at a time, so it hits softest but most often.
// - Spit pierces a whole line of enemies, so it sits in between.
export const ATTACKS = [
  { id: 'shockwave', name: 'Shockwave', description: 'Space: hit everything around you', cooldown: 1, damage: 10, auto: false },
  { id: 'tongue', name: 'Tongue', description: 'Auto: lashes the nearest enemy', cooldown: 0.55, damage: 6, auto: true },
  { id: 'spit', name: 'Spit', description: 'Space: piercing shot ahead', cooldown: 0.7, damage: 7, auto: false },
];

// Shockwave tuning
const ATTACK_RADIUS = 60; // base reach of the shockwave around the player
const ATTACK_FADE_DURATION = 0.3; // seconds the circle stays visible
const ATTACK_OPACITY = 0.6;
const SHOCKWAVE_DURATION = 0.4; // seconds the ring takes to expand to the attack radius
const SHOCKWAVE_WIDTH = 4;

// Tongue tuning
const TONGUE_RANGE = 120; // base reach, measured to the enemy's edge
const TONGUE_DURATION = 0.2; // seconds to shoot out and pull back in
const TONGUE_WIDTH = 5;
const TONGUE_HEIGHT = 10; // height above the ground, roughly Tode's mouth

// Spit tuning
const SPIT_SPEED = 450; // world units per second
const SPIT_RANGE = 320; // base distance a glob flies before it pops
const SPIT_RADIUS = 7;
const SPIT_HEIGHT = 10;

let currentAttack = ATTACKS[0];

export function getAttack() {
  return currentAttack;
}

export function setAttackById(id) {
  const attack = ATTACKS.find((candidate) => candidate.id === id);
  if (attack) currentAttack = attack;
}

// Step through the attacks in menu order, wrapping around at either end
export function cycleAttack(step) {
  const index = ATTACKS.indexOf(currentAttack);
  currentAttack = ATTACKS[(index + step + ATTACKS.length) % ATTACKS.length];
}

const attackCircle = new THREE.Mesh(
  new THREE.CircleGeometry(ATTACK_RADIUS, 48),
  new THREE.MeshBasicMaterial({
    color: 0xffd700,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
);
attackCircle.position.z = 0.25;
attackCircle.visible = false;

// Expanding ring drawn on top of the circle, so the attack reads as a shockwave
const shockwave = new THREE.Mesh(
  new THREE.RingGeometry(ATTACK_RADIUS - SHOCKWAVE_WIDTH, ATTACK_RADIUS, 64),
  new THREE.MeshBasicMaterial({
    color: 0xfff6a0,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
);
shockwave.position.z = 0.3;
shockwave.visible = false;

// Tongue: a unit-long pink bar (stretched along X to the target) with a round tip
const tongueMaterial = new THREE.MeshStandardMaterial({ color: 0xff6f9c });
const tongue = new THREE.Group();
const tongueBody = new THREE.Mesh(new THREE.BoxGeometry(1, TONGUE_WIDTH, TONGUE_WIDTH * 0.6), tongueMaterial);
tongueBody.position.x = 0.5;
const tongueTip = new THREE.Mesh(new THREE.SphereGeometry(TONGUE_WIDTH, 12, 8), tongueMaterial);
tongue.add(tongueBody, tongueTip);
tongue.position.z = TONGUE_HEIGHT;
tongue.visible = false;

const spitGeometry = new THREE.SphereGeometry(SPIT_RADIUS, 12, 8);
const spitMaterial = new THREE.MeshStandardMaterial({ color: 0x9be564, emissive: 0x2d5a12 });

// Current values, scaled by setAttackDifficulty
let cooldownMultiplier = 1;
let currentRadiusMultiplier = 1;
let damageMultiplier = 1;

export function setAttackDifficulty(newCooldownMultiplier, radiusMultiplier, newDamageMultiplier = 1) {
  cooldownMultiplier = newCooldownMultiplier;
  currentRadiusMultiplier = radiusMultiplier;
  damageMultiplier = newDamageMultiplier;
  attackCircle.scale.setScalar(radiusMultiplier);
}

const attackCooldown = () => currentAttack.cooldown * cooldownMultiplier;
const attackDamage = () => currentAttack.damage * damageMultiplier;

let cooldownRemaining = 0;
let fadeRemaining = 0;
let shockwaveElapsed = SHOCKWAVE_DURATION;
let attackRequested = false;

// Tongue animation: offset from Tode to the target at the moment of the lash
let tongueElapsed = TONGUE_DURATION;
let tongueLength = 0;

// Spit globs in flight: { mesh, dirX, dirY, travelled, range, damage, hit }
// `hit` holds the enemies a glob already damaged, so a piercing glob hits each enemy once
const globs = [];

/**
 * Share of the cooldown already recovered: 0 right after an attack, 1 when ready again.
 */
export function getAttackReadiness() {
  const cooldown = attackCooldown();
  return cooldown > 0 ? 1 - cooldownRemaining / cooldown : 1;
}

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;

  event.preventDefault();
  if (!event.repeat) attackRequested = true;
});

const distanceTo = (player, enemy) =>
  Math.hypot(enemy.position.x - player.position.x, enemy.position.y - player.position.y);

// Damage every enemy whose body touches the attack area; returns how many were defeated
function hitEnemies(scene, player, enemies) {
  const radius = ATTACK_RADIUS * currentRadiusMultiplier;
  const damage = attackDamage();
  let kills = 0;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    if (distanceTo(player, enemy) <= radius + enemy.userData.radius) {
      if (damageEnemy(scene, enemy, damage, player.position.x, player.position.y)) kills++;
    }
  }
  return kills;
}

function fireShockwave(scene, player, enemies) {
  fadeRemaining = ATTACK_FADE_DURATION;
  shockwaveElapsed = 0;
  return hitEnemies(scene, player, enemies);
}

// The closest enemy whose edge is within the tongue's reach, or null
function findTongueTarget(player, enemies) {
  const range = TONGUE_RANGE * currentRadiusMultiplier;
  let best = null;
  let bestDistance = Infinity;
  for (const enemy of enemies) {
    const distance = distanceTo(player, enemy);
    if (distance <= range + enemy.userData.radius && distance < bestDistance) {
      best = enemy;
      bestDistance = distance;
    }
  }
  return best;
}

function lashTongue(scene, player, target) {
  const dx = target.position.x - player.position.x;
  const dy = target.position.y - player.position.y;
  tongueLength = Math.hypot(dx, dy);
  tongue.rotation.z = Math.atan2(dy, dx);
  tongueElapsed = 0;
  return damageEnemy(scene, target, attackDamage(), player.position.x, player.position.y) ? 1 : 0;
}

function shootSpit(scene, player) {
  const facing = getFacing();
  const mesh = new THREE.Mesh(spitGeometry, spitMaterial);
  mesh.position.set(player.position.x, player.position.y, SPIT_HEIGHT);
  mesh.castShadow = true;
  scene.add(mesh);
  globs.push({
    mesh,
    dirX: facing.x,
    dirY: facing.y,
    travelled: 0,
    range: SPIT_RANGE * currentRadiusMultiplier,
    damage: attackDamage(),
    hit: new Set(),
  });
}

// Move every glob; each one damages every enemy it touches (once) and pops at its range or on a house
function updateGlobs(scene, delta, enemies) {
  let kills = 0;
  const glob = { position: null, userData: { radius: SPIT_RADIUS * currentRadiusMultiplier } };
  for (let i = globs.length - 1; i >= 0; i--) {
    const entry = globs[i];
    const { mesh } = entry;
    const step = SPIT_SPEED * delta;
    mesh.position.x += entry.dirX * step;
    mesh.position.y += entry.dirY * step;
    entry.travelled += step;
    mesh.scale.setScalar(currentRadiusMultiplier);

    glob.position = mesh.position;
    for (let j = enemies.length - 1; j >= 0; j--) {
      const enemy = enemies[j];
      if (entry.hit.has(enemy)) continue;
      if (isTouching(enemy.position.x, enemy.position.y, enemy.userData.radius, glob)) {
        entry.hit.add(enemy);
        // Push the enemy along the glob's path, not back towards Tode
        const fromX = enemy.position.x - entry.dirX;
        const fromY = enemy.position.y - entry.dirY;
        if (damageEnemy(scene, enemy, entry.damage, fromX, fromY)) kills++;
      }
    }

    if (entry.travelled >= entry.range || overlapsObstacle(mesh.position.x, mesh.position.y, SPIT_RADIUS)) {
      scene.remove(mesh);
      globs.splice(i, 1);
    }
  }
  return kills;
}

// Returns the number of enemies defeated this frame
export function updateAttack(scene, delta, player, enemies) {
  if (!attackCircle.parent) player.add(attackCircle, shockwave, tongue);
  let kills = 0;

  cooldownRemaining = Math.max(0, cooldownRemaining - delta);

  if (cooldownRemaining === 0) {
    if (currentAttack.id === 'tongue') {
      // The tongue fires on its own as soon as an enemy is in reach
      const target = findTongueTarget(player, enemies);
      if (target) {
        cooldownRemaining = attackCooldown();
        kills += lashTongue(scene, player, target);
      }
    } else if (attackRequested) {
      cooldownRemaining = attackCooldown();
      if (currentAttack.id === 'spit') shootSpit(scene, player);
      else kills += fireShockwave(scene, player, enemies);
    }
  }
  // Presses during cooldown are dropped, not buffered
  attackRequested = false;

  kills += updateGlobs(scene, delta, enemies);

  if (fadeRemaining > 0) {
    fadeRemaining = Math.max(0, fadeRemaining - delta);
    attackCircle.visible = fadeRemaining > 0;
    attackCircle.material.opacity = ATTACK_OPACITY * (fadeRemaining / ATTACK_FADE_DURATION);
  }

  if (shockwaveElapsed < SHOCKWAVE_DURATION) {
    shockwaveElapsed = Math.min(SHOCKWAVE_DURATION, shockwaveElapsed + delta);
    const t = shockwaveElapsed / SHOCKWAVE_DURATION;
    shockwave.visible = t < 1;
    shockwave.scale.setScalar(currentRadiusMultiplier * (0.2 + 0.8 * (1 - (1 - t) ** 3)));
    shockwave.material.opacity = 1 - t;
  }

  if (tongueElapsed < TONGUE_DURATION) {
    tongueElapsed = Math.min(TONGUE_DURATION, tongueElapsed + delta);
    // Shoot out and snap back: 0 → full length → 0
    const reach = tongueLength * Math.sin((tongueElapsed / TONGUE_DURATION) * Math.PI);
    tongue.visible = tongueElapsed < TONGUE_DURATION;
    tongueBody.scale.x = Math.max(0.01, reach);
    tongueBody.position.x = reach / 2;
    tongueTip.position.x = reach;
  }

  return kills;
}

// Drop a Space press that was meant for a menu, so it doesn't fire an attack on resume
export function clearAttackRequest() {
  attackRequested = false;
}

export function resetAttack(scene) {
  cooldownRemaining = 0;
  fadeRemaining = 0;
  shockwaveElapsed = SHOCKWAVE_DURATION;
  tongueElapsed = TONGUE_DURATION;
  attackRequested = false;
  attackCircle.visible = false;
  shockwave.visible = false;
  tongue.visible = false;
  for (const { mesh } of globs) scene.remove(mesh);
  globs.length = 0;
}

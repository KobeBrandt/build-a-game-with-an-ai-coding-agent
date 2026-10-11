import * as THREE from 'three';
import { defeatEnemy } from './Enemy.js';

// Attack tuning
const ATTACK_COOLDOWN = 1; // base seconds between attacks
const ATTACK_RADIUS = 60; // base reach of the attack around the player
const ATTACK_FADE_DURATION = 0.3; // seconds the circle stays visible
const ATTACK_OPACITY = 0.6;
const SHOCKWAVE_DURATION = 0.4; // seconds the ring takes to expand to the attack radius
const SHOCKWAVE_WIDTH = 4;

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

// Current values, scaled by setAttackDifficulty
let attackCooldown = ATTACK_COOLDOWN;
let attackRadius = ATTACK_RADIUS;
let currentRadiusMultiplier = 1;

export function setAttackDifficulty(cooldownMultiplier, radiusMultiplier) {
  attackCooldown = ATTACK_COOLDOWN * cooldownMultiplier;
  attackRadius = ATTACK_RADIUS * radiusMultiplier;
  currentRadiusMultiplier = radiusMultiplier;
  attackCircle.scale.setScalar(radiusMultiplier);
}

let cooldownRemaining = 0;
let fadeRemaining = 0;
let shockwaveElapsed = SHOCKWAVE_DURATION;
let attackRequested = false;

/**
 * Share of the cooldown already recovered: 0 right after an attack, 1 when ready again.
 */
export function getAttackReadiness() {
  return attackCooldown > 0 ? 1 - cooldownRemaining / attackCooldown : 1;
}

window.addEventListener('keydown', (event) => {
  if (event.code !== 'Space') return;

  event.preventDefault();
  if (!event.repeat) attackRequested = true;
});

// Remove every enemy whose body touches the attack area; returns how many were hit
function hitEnemies(scene, player, enemies) {
  let hits = 0;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    const distance = Math.hypot(
      enemy.position.x - player.position.x,
      enemy.position.y - player.position.y
    );
    if (distance <= attackRadius + enemy.userData.radius) {
      defeatEnemy(scene, enemy);
      hits++;
    }
  }
  return hits;
}

// Returns the number of enemies defeated this frame
export function updateAttack(scene, delta, player, enemies) {
  if (!attackCircle.parent) player.add(attackCircle, shockwave);
  let kills = 0;

  cooldownRemaining = Math.max(0, cooldownRemaining - delta);

  if (attackRequested && cooldownRemaining === 0) {
    cooldownRemaining = attackCooldown;
    fadeRemaining = ATTACK_FADE_DURATION;
    shockwaveElapsed = 0;
    kills = hitEnemies(scene, player, enemies);
  }
  // Presses during cooldown are dropped, not buffered
  attackRequested = false;

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

  return kills;
}

export function resetAttack() {
  cooldownRemaining = 0;
  fadeRemaining = 0;
  shockwaveElapsed = SHOCKWAVE_DURATION;
  attackRequested = false;
  attackCircle.visible = false;
  shockwave.visible = false;
}

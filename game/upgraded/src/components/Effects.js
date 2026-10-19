import * as THREE from 'three';

// Game feel: particle bursts, floating damage numbers, screen shake and the fever trail.
// None of these change the game itself; main.js triggers them from hits, kills and judgements.

const PARTICLE_LIFE = 0.45; // seconds
const PARTICLE_SPEED = 90;
const PARTICLE_GRAVITY = 260;
const NUMBER_LIFE = 0.7; // seconds a damage number floats
const NUMBER_RISE = 40; // px it rises over its life
const TRAIL_LIFE = 0.4;
const SHAKE_DECAY = 10; // how fast a shake dies down (per second)
const MAX_SHAKE = 6; // world units

// Players who ask their system for less motion get no screen shake
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const particleGeometry = new THREE.BoxGeometry(3, 3, 3);
const particleMaterials = new Map();

function particleMaterial(color) {
  if (!particleMaterials.has(color)) {
    particleMaterials.set(color, new THREE.MeshBasicMaterial({ color }));
  }
  return particleMaterials.get(color);
}

// { mesh, vx, vy, vz, life }
const particles = [];

/**
 * A burst of `count` little cubes flying out of `position` (a Vector3-like { x, y, z }).
 */
export function burst(scene, position, color, count = 8) {
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(particleGeometry, particleMaterial(color));
    mesh.position.set(position.x, position.y, (position.z ?? 0) + 8);
    const angle = Math.random() * Math.PI * 2;
    const speed = PARTICLE_SPEED * (0.5 + Math.random());
    particles.push({
      mesh,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      vz: 80 + Math.random() * 80,
      life: PARTICLE_LIFE,
    });
    scene.add(mesh);
  }
}

const trailGeometry = new THREE.CircleGeometry(10, 20);
const trail = [];

/**
 * A fading teal disc on the ground at `position`: Tode's fever trail.
 */
export function trailMark(scene, position) {
  const mesh = new THREE.Mesh(
    trailGeometry,
    new THREE.MeshBasicMaterial({ color: 0x39c5bb, transparent: true, opacity: 0.6, depthWrite: false })
  );
  mesh.position.set(position.x, position.y, 0.15);
  scene.add(mesh);
  trail.push({ mesh, life: TRAIL_LIFE });
}

// Damage numbers are DOM text placed over the 3D position each frame
const numberLayer = document.createElement('div');
numberLayer.className = 'damage-numbers';
numberLayer.setAttribute('aria-hidden', 'true');
document.body.appendChild(numberLayer);
const numbers = []; // { element, position: Vector3, life }

/**
 * Float `amount` up from `position`; `strong` for on-beat hits and kills.
 */
export function damageNumber(position, amount, strong = false) {
  const element = document.createElement('span');
  element.className = strong ? 'damage-number strong' : 'damage-number';
  element.textContent = String(Math.round(amount));
  numberLayer.appendChild(element);
  numbers.push({ element, position: new THREE.Vector3(position.x, position.y, 30), life: NUMBER_LIFE });
}

let shakeStrength = 0;
const shakeOffset = new THREE.Vector3();

export function shake(strength) {
  if (reducedMotion.matches) return;
  shakeStrength = Math.min(MAX_SHAKE, shakeStrength + strength);
}

/**
 * Camera offset for the current shake (add it to the camera's resting position).
 */
export function getShakeOffset() {
  return shakeOffset;
}

const projected = new THREE.Vector3();

export function updateEffects(delta, camera) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    particle.life -= delta;
    if (particle.life <= 0 || particle.mesh.position.z < 0) {
      particle.mesh.removeFromParent();
      particles.splice(i, 1);
      continue;
    }
    particle.vz -= PARTICLE_GRAVITY * delta;
    particle.mesh.position.x += particle.vx * delta;
    particle.mesh.position.y += particle.vy * delta;
    particle.mesh.position.z += particle.vz * delta;
    particle.mesh.scale.setScalar(particle.life / PARTICLE_LIFE);
    particle.mesh.rotation.x += delta * 10;
  }

  for (let i = trail.length - 1; i >= 0; i--) {
    const mark = trail[i];
    mark.life -= delta;
    if (mark.life <= 0) {
      mark.mesh.removeFromParent();
      mark.mesh.material.dispose();
      trail.splice(i, 1);
      continue;
    }
    mark.mesh.material.opacity = 0.6 * (mark.life / TRAIL_LIFE);
  }

  for (let i = numbers.length - 1; i >= 0; i--) {
    const number = numbers[i];
    number.life -= delta;
    if (number.life <= 0) {
      number.element.remove();
      numbers.splice(i, 1);
      continue;
    }
    projected.copy(number.position).project(camera);
    const t = 1 - number.life / NUMBER_LIFE;
    const x = ((projected.x + 1) / 2) * window.innerWidth;
    const y = ((1 - projected.y) / 2) * window.innerHeight - t * NUMBER_RISE;
    number.element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
    number.element.style.opacity = String(Math.min(1, 2 * (1 - t)));
  }

  shakeStrength = Math.max(0, shakeStrength - shakeStrength * SHAKE_DECAY * delta - delta);
  shakeOffset.set((Math.random() * 2 - 1) * shakeStrength, (Math.random() * 2 - 1) * shakeStrength, 0);
}

/**
 * Clear every effect (new run).
 */
export function resetEffects() {
  for (const { mesh } of particles) mesh.removeFromParent();
  particles.length = 0;
  for (const { mesh } of trail) {
    mesh.removeFromParent();
    mesh.material.dispose();
  }
  trail.length = 0;
  for (const { element } of numbers) element.remove();
  numbers.length = 0;
  shakeStrength = 0;
  shakeOffset.set(0, 0, 0);
}

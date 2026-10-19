import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { computeCollisionRadius, isTouching, wouldHitObstacle } from './Collision.js';
import { enemies } from './Enemy.js';

// Movement tuning
const MOVE_DURATION = 0.25; // base seconds per jump (lower = faster)
const MOVE_SPEED = 1 / MOVE_DURATION; // base progress units per second
const JUMP_HEIGHT = 15;
const JUMP_DISTANCE = 40;
const MAX_QUEUED_MOVES = 2;
const MODEL_SCALE = 20;
const STRETCH = 0.18; // how much Tode stretches mid-air (squash and stretch)

const DIRECTIONS = {
  forward: { x: 0, y: 1, angle: Math.PI },
  backward: { x: 0, y: -1, angle: 0 },
  left: { x: -1, y: 0, angle: -Math.PI / 2 },
  right: { x: 1, y: 0, angle: Math.PI / 2 },
};

// Keyed by event.code so WASD sits in the same place on every keyboard layout
const KEY_TO_DIRECTION = {
  ArrowUp: 'forward',
  ArrowDown: 'backward',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyW: 'forward',
  KeyS: 'backward',
  KeyA: 'left',
  KeyD: 'right',
};

export const player = new THREE.Group();
player.position.set(0, 0, 0);
player.userData.radius = 0;

let model = null;
let groundOffset = 0;

const loader = new GLTFLoader();
// Resolves once Tode's model is in place and the collision radius is known
export const playerReady = new Promise((resolve) => {
  loader.load(import.meta.env.BASE_URL + 'models/tode.glb', (gltf) => {
    setUpModel(gltf);
    resolve();
  });
});

function setUpModel(gltf) {
  model = gltf.scene;
  model.scale.setScalar(MODEL_SCALE);
  model.rotation.x = Math.PI / 2;

  // Lift the model so its lowest point sits flush on the ground (z = 0)
  const box = new THREE.Box3().setFromObject(model);
  groundOffset = -box.min.z;
  model.position.z = groundOffset;
  model.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });

  player.userData.radius = computeCollisionRadius(model);
  player.add(model);
}

// Current jump speed, scaled by setPlayerSpeed
let moveSpeed = MOVE_SPEED;

export function setPlayerSpeed(multiplier) {
  moveSpeed = MOVE_SPEED * multiplier;
}

const moveQueue = [];

const movement = {
  direction: null,
  progress: 0,
  completed: true,
  startAngle: 0,
};

// Direction of the last hop; Tode starts facing the camera (model.rotation.y = 0)
let facing = 'backward';

/**
 * Unit vector { x, y } of the way Tode is facing.
 */
export function getFacing() {
  return DIRECTIONS[facing];
}

// Directions of movement keys currently held down, most recently pressed last
const heldDirections = [];

window.addEventListener('keydown', (event) => {
  const direction = KEY_TO_DIRECTION[event.code];
  if (!direction) return;

  event.preventDefault();
  // Auto-repeat events are ignored; holding a key is handled via heldDirections
  if (event.repeat) return;

  if (!heldDirections.includes(direction)) heldDirections.push(direction);
  if (moveQueue.length < MAX_QUEUED_MOVES) moveQueue.push(direction);
});

window.addEventListener('keyup', (event) => {
  const direction = KEY_TO_DIRECTION[event.code];
  if (!direction) return;

  const index = heldDirections.indexOf(direction);
  if (index !== -1) heldDirections.splice(index, 1);
});

// Keys released while the window is unfocused never fire keyup
window.addEventListener('blur', () => {
  heldDirections.length = 0;
});

function startNextMove() {
  if (!movement.completed) return;

  if (moveQueue.length > 0) {
    movement.direction = moveQueue.shift();
  } else if (heldDirections.length > 0) {
    movement.direction = heldDirections[heldDirections.length - 1];
  } else {
    return;
  }
  facing = movement.direction;
  movement.progress = 0;
  movement.completed = false;
  movement.startAngle = model ? model.rotation.y : 0;
}

// Shortest signed angle from `from` to `to`
function angleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

// Returns true if the player hopped into an enemy (game over)
export function updatePlayer(delta) {
  startNextMove();
  if (movement.completed) return false;

  const previousProgress = movement.progress;
  movement.progress = Math.min(1, movement.progress + delta * moveSpeed);
  const { progress } = movement;
  const direction = DIRECTIONS[movement.direction];

  // Advance by this frame's share of the jump; touching an enemy ends the game
  const step = JUMP_DISTANCE * (progress - previousProgress);
  const nextX = player.position.x + direction.x * step;
  const nextY = player.position.y + direction.y * step;
  if (enemies.some((enemy) => isTouching(nextX, nextY, player.userData.radius, enemy))) {
    return true;
  }
  // Houses block the hop; Tode jumps in place instead
  if (!wouldHitObstacle(player.position, nextX, nextY, player.userData.radius)) {
    player.position.x = nextX;
    player.position.y = nextY;
  }

  if (model) {
    // Hop on the model so the camera attached to the group stays steady
    const lift = Math.sin(progress * Math.PI);
    model.position.z = groundOffset + lift * JUMP_HEIGHT;

    // Stretch tall in the air, keep the volume by thinning out (model Y points up after the X rotation)
    const stretch = 1 + lift * STRETCH;
    const thin = MODEL_SCALE / Math.sqrt(stretch);
    model.scale.set(thin, MODEL_SCALE * stretch, thin);

    // Turn to face the move direction (model.rotation.y spins around world Z)
    const turn = angleDelta(movement.startAngle, direction.angle);
    model.rotation.y = movement.startAngle + turn * Math.min(1, progress * 2);
  }

  if (progress >= 1) {
    movement.completed = true;
    if (model) {
      model.position.z = groundOffset;
      model.scale.setScalar(MODEL_SCALE);
    }
  }
  return false;
}

// Drop hops queued while a menu was open (A/D also move the menu selection)
export function clearQueuedMoves() {
  moveQueue.length = 0;
}

export function resetPlayer() {
  player.position.set(0, 0, 0);
  moveQueue.length = 0;
  movement.direction = null;
  movement.progress = 0;
  movement.completed = true;
  facing = 'backward';
  if (model) {
    model.position.z = groundOffset;
    model.rotation.y = 0;
    model.scale.setScalar(MODEL_SCALE);
  }
}

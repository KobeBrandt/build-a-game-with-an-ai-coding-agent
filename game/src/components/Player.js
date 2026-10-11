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

const DIRECTIONS = {
  forward: { x: 0, y: 1, angle: Math.PI },
  backward: { x: 0, y: -1, angle: 0 },
  left: { x: -1, y: 0, angle: -Math.PI / 2 },
  right: { x: 1, y: 0, angle: Math.PI / 2 },
};

const KEY_TO_DIRECTION = {
  ArrowUp: 'forward',
  ArrowDown: 'backward',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export const player = new THREE.Group();
player.position.set(0, 0, 0);
player.userData.radius = 0;

let model = null;
let groundOffset = 0;

const loader = new GLTFLoader();
loader.load('/models/tode.glb', (gltf) => {
  model = gltf.scene;
  model.scale.setScalar(20);
  model.rotation.x = Math.PI / 2;

  // Lift the model so its lowest point sits flush on the ground (z = 0)
  const box = new THREE.Box3().setFromObject(model);
  groundOffset = -box.min.z;
  model.position.z = groundOffset;

  player.userData.radius = computeCollisionRadius(model);
  player.add(model);
});

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

// Directions of arrow keys currently held down, most recently pressed last
const heldDirections = [];

window.addEventListener('keydown', (event) => {
  const direction = KEY_TO_DIRECTION[event.key];
  if (!direction) return;

  event.preventDefault();
  // Auto-repeat events are ignored; holding a key is handled via heldDirections
  if (event.repeat) return;

  if (!heldDirections.includes(direction)) heldDirections.push(direction);
  if (moveQueue.length < MAX_QUEUED_MOVES) moveQueue.push(direction);
});

window.addEventListener('keyup', (event) => {
  const direction = KEY_TO_DIRECTION[event.key];
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
    model.position.z = groundOffset + Math.sin(progress * Math.PI) * JUMP_HEIGHT;

    // Turn to face the move direction (model.rotation.y spins around world Z)
    const turn = angleDelta(movement.startAngle, direction.angle);
    model.rotation.y = movement.startAngle + turn * Math.min(1, progress * 2);
  }

  if (progress >= 1) {
    movement.completed = true;
    if (model) model.position.z = groundOffset;
  }
  return false;
}

export function resetPlayer() {
  player.position.set(0, 0, 0);
  moveQueue.length = 0;
  movement.direction = null;
  movement.progress = 0;
  movement.completed = true;
  if (model) {
    model.position.z = groundOffset;
    model.rotation.y = 0;
  }
}

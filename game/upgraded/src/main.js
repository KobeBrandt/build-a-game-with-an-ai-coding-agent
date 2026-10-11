import * as THREE from 'three';
import './style.css';
import { player, resetPlayer, setPlayerSpeed, updatePlayer } from './components/Player.js';
import { Camera } from './components/Camera.js';
import { Renderer } from './components/Renderer.js';
import {
  enemies,
  resetEnemies,
  setEnemyDifficulty,
  updateDefeatedEnemies,
  updateEnemies,
} from './components/Enemy.js';
import { getAttackReadiness, resetAttack, setAttackDifficulty, updateAttack } from './components/Attack.js';
import { addKills, getHighScore, getScore, resetScore, stopScore, updateScore } from './components/Score.js';
import { getDifficulty, getLevel } from './components/Difficulty.js';
import { isTouching } from './components/Collision.js';
import { GameMap, updateMap } from './components/Map.js';
import { getMode, MODES, setModeByKey } from './components/Modes.js';

// Shadow tuning: the sun follows the player, so only the area around it needs a shadow map
const SUN_OFFSET = new THREE.Vector3(-100, -100, 200);
const SHADOW_AREA = 600; // half-size of the square around the player that receives shadows

const scene = new THREE.Scene();

const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.copy(SUN_OFFSET);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.set(2048, 2048);
Object.assign(directionalLight.shadow.camera, {
  left: -SHADOW_AREA,
  right: SHADOW_AREA,
  top: SHADOW_AREA,
  bottom: -SHADOW_AREA,
  near: 1,
  far: 1000,
});
directionalLight.shadow.bias = -0.0005;
scene.add(directionalLight, directionalLight.target);

const map = GameMap();
scene.add(map);

scene.add(player);

const camera = Camera();
player.add(camera);

const renderer = Renderer();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// HUD: difficulty level and attack cooldown meter
const levelElement = document.createElement('div');
levelElement.className = 'level';
document.body.appendChild(levelElement);

const attackMeter = document.createElement('div');
attackMeter.className = 'attack-meter';
attackMeter.innerHTML = '<div class="attack-meter-fill"></div><span>Attack</span>';
document.body.appendChild(attackMeter);
const attackMeterFill = attackMeter.querySelector('.attack-meter-fill');

// One overlay for the start, pause and game over screens
const overlay = document.createElement('div');
overlay.className = 'overlay';
document.body.appendChild(overlay);

function modeListHtml() {
  const current = getMode();
  const items = MODES.map(
    (mode) => `
      <li class="${mode === current ? 'selected' : ''}">
        <kbd>${mode.key}</kbd> ${mode.name} <small>${mode.description}</small>
      </li>`
  ).join('');
  return `<ul class="modes">${items}</ul>`;
}

const CONTROLS_HTML = `
  <p class="controls">
    <kbd>&larr;</kbd><kbd>&uarr;</kbd><kbd>&darr;</kbd><kbd>&rarr;</kbd> hop
    &middot; <kbd>Space</kbd> attack
    &middot; <kbd>P</kbd> pause
  </p>`;

// 'start' | 'playing' | 'paused' | 'gameover'
let state = 'start';
let lastRun = { score: 0, newHighScore: false };

function renderOverlay() {
  overlay.classList.toggle('game-over', state === 'gameover');
  overlay.hidden = state === 'playing';

  if (state === 'start') {
    overlay.innerHTML = `
      <h1>Tode's Escape</h1>
      <p>Choose a mode, then press <kbd>Space</kbd> to start</p>
      ${modeListHtml()}
      <p class="best">Best in ${getMode().name}: ${getHighScore()}</p>
      ${CONTROLS_HTML}`;
  } else if (state === 'paused') {
    overlay.innerHTML = `
      <h1>Paused</h1>
      <p>Press <kbd>P</kbd> to continue</p>`;
  } else if (state === 'gameover') {
    overlay.innerHTML = `
      <h1>Game Over</h1>
      <p class="final">Score: ${lastRun.score}</p>
      ${lastRun.newHighScore ? '<p class="new-best">New high score!</p>' : `<p class="best">Best in ${getMode().name}: ${getHighScore()}</p>`}
      <p>Press <kbd>Space</kbd> to play again</p>
      ${modeListHtml()}`;
  }
}

function gameOver() {
  state = 'gameover';
  player.visible = false;
  lastRun = { score: getScore(), newHighScore: stopScore() };
  renderOverlay();
}

function startGame() {
  resetPlayer();
  resetEnemies(scene);
  resetAttack();
  resetScore();
  player.visible = true;
  state = 'playing';
  renderOverlay();
}

// Registered after Attack.js, so this runs after its Space handler; resetAttack drops that press
window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const onMenu = state === 'start' || state === 'gameover';

  if (event.code === 'Space' && onMenu) {
    startGame();
  } else if (onMenu && setModeByKey(event.key)) {
    renderOverlay();
  } else if (event.code === 'KeyP' || event.code === 'Escape') {
    if (state === 'playing') state = 'paused';
    else if (state === 'paused') state = 'playing';
    renderOverlay();
  }
});

// Pause automatically when the player switches away from the tab
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') {
    state = 'paused';
    renderOverlay();
  }
});

const playerTouchesEnemy = () =>
  enemies.some((enemy) =>
    isTouching(player.position.x, player.position.y, player.userData.radius, enemy)
  );

function applyDifficulty(score) {
  const difficulty = getDifficulty(score);
  setEnemyDifficulty(difficulty.enemySpeed, difficulty.enemySpawnDelay);
  setPlayerSpeed(difficulty.playerSpeed);
  setAttackDifficulty(difficulty.attackCooldown, difficulty.attackRadius);
}

function updateHud() {
  levelElement.textContent = `${getMode().name} · Level ${getLevel(getScore())}`;
  const readiness = getAttackReadiness();
  attackMeterFill.style.transform = `scaleX(${readiness})`;
  attackMeter.classList.toggle('ready', readiness >= 1);
}

const clock = new THREE.Clock();

renderOverlay();
updateScore(0);

renderer.setAnimationLoop(() => {
  // Cap the step so a long frame (e.g. after a hitch) can't teleport anything
  const delta = Math.min(clock.getDelta(), 0.1);

  if (state === 'playing') {
    applyDifficulty(getScore());

    const playerHit = updatePlayer(delta);
    const enemyHit = playerHit || updateEnemies(scene, delta, player);
    if (enemyHit || playerTouchesEnemy()) {
      gameOver();
    } else {
      addKills(updateAttack(scene, delta, player, enemies));
      updateScore(delta);
    }
  }
  if (state !== 'paused') updateDefeatedEnemies(delta);

  updateHud();
  updateMap(map, player.position);

  directionalLight.target.position.set(player.position.x, player.position.y, 0);
  directionalLight.position.copy(directionalLight.target.position).add(SUN_OFFSET);

  renderer.render(scene, camera);
});

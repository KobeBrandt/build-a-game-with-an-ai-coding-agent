import * as THREE from 'three';
import './style.css';
import { clearQueuedMoves, player, resetPlayer, setPlayerSpeed, updatePlayer } from './components/Player.js';
import { Camera } from './components/Camera.js';
import { Renderer } from './components/Renderer.js';
import {
  defeatEnemy,
  enemies,
  resetEnemies,
  setEnemyDifficulty,
  updateDefeatedEnemies,
  updateEnemies,
} from './components/Enemy.js';
import {
  clearAttackRequest,
  getAttackReadiness,
  resetAttack,
  setAttackDifficulty,
  updateAttack,
} from './components/Attack.js';
import { addKills, getHighScore, getScore, resetScore, stopScore, updateScore } from './components/Score.js';
import { getDifficulty, getLevel } from './components/Difficulty.js';
import { isTouching } from './components/Collision.js';
import { GameMap, updateMap } from './components/Map.js';
import { cycleMode, getMode, MODES, setModeByKey } from './components/Modes.js';
import {
  addCoins,
  BASE_UPGRADES,
  buyUpgrade,
  getBaseStats,
  getCoins,
  getUpgradeCost,
  getUpgradeLevel,
  isMaxed,
} from './components/Shop.js';
import {
  addKillXp,
  addSurvivalXp,
  getStacks,
  getStats,
  getXpProgress,
  hasPendingLevelUp,
  pickUpgrade,
  resetRun,
  rollChoices,
  useShield,
} from './components/RunUpgrades.js';

// Shadow tuning: the sun follows the player, so only the area around it needs a shadow map
const SUN_OFFSET = new THREE.Vector3(-100, -100, 200);
const SHADOW_AREA = 600; // half-size of the square around the player that receives shadows

// A shield that absorbs a hit also knocks out every enemy this close to Tode
const SHIELD_BLAST_RADIUS = 150;

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

// HUD: XP towards the next in-game upgrade, and shields left
const runHud = document.createElement('div');
runHud.className = 'run-hud';
runHud.innerHTML = '<div class="xp-bar"><div class="xp-bar-fill"></div><span>XP</span></div><div class="shields"></div>';
document.body.appendChild(runHud);
const xpBarFill = runHud.querySelector('.xp-bar-fill');
const shieldsElement = runHud.querySelector('.shields');

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
    <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>&larr;</kbd><kbd>&uarr;</kbd><kbd>&darr;</kbd><kbd>&rarr;</kbd> hop
    &middot; <kbd>Space</kbd> attack
    &middot; <kbd>P</kbd> pause
  </p>`;

function shopHtml() {
  const items = BASE_UPGRADES.map((upgrade, index) => {
    const level = getUpgradeLevel(upgrade);
    const maxed = isMaxed(upgrade);
    const cost = getUpgradeCost(upgrade);
    const classes = [
      index === shopIndex ? 'selected' : '',
      maxed ? 'maxed' : '',
      !maxed && cost > getCoins() ? 'too-expensive' : '',
    ].join(' ');
    return `
      <li class="${classes}" data-buy="${index}">
        <strong>${upgrade.name}</strong>
        <span class="pips">${'&#9679;'.repeat(level)}${'&#9675;'.repeat(upgrade.maxLevel - level)}</span>
        <small>${upgrade.description}</small>
        <span class="cost">${maxed ? 'Max' : `${cost} coins`}</span>
      </li>`;
  }).join('');
  return `<ul class="shop">${items}</ul>`;
}

function levelUpHtml() {
  if (levelUpChoices.length === 0) {
    return '<p>Every upgrade is maxed out! Press <kbd>Space</kbd> to continue</p>';
  }
  const items = levelUpChoices.map(
    (upgrade, index) => `
      <li class="${index === levelUpIndex ? 'selected' : ''}" data-pick="${index}">
        <kbd>${index + 1}</kbd>
        <strong>${upgrade.name}</strong>
        <small>${upgrade.description}</small>
        <span class="stacks">${getStacks(upgrade)}/${upgrade.maxStacks}</span>
      </li>`
  ).join('');
  return `<ul class="choices">${items}</ul>`;
}

// 'start' | 'shop' | 'playing' | 'paused' | 'levelup' | 'gameover'
let state = 'start';
let lastRun = { score: 0, newHighScore: false, coins: 0 };

// Shop selection, and the menu screen to go back to
let shopIndex = 0;
let shopReturnState = 'start';

// Upgrades offered on the current level-up screen
let levelUpChoices = [];
let levelUpIndex = 0;

function renderOverlay() {
  overlay.classList.toggle('game-over', state === 'gameover');
  overlay.hidden = state === 'playing';

  if (state === 'start') {
    overlay.innerHTML = `
      <h1>Tode's Escape</h1>
      <p>Choose a mode with <kbd>A</kbd>/<kbd>D</kbd>, then press <kbd>Space</kbd> to start</p>
      ${modeListHtml()}
      <p class="best">Best in ${getMode().name}: ${getHighScore()}</p>
      <p class="coins">Coins: ${getCoins()} &middot; <span class="link" data-shop>Press <kbd>U</kbd> for upgrades</span></p>
      ${CONTROLS_HTML}`;
  } else if (state === 'shop') {
    overlay.innerHTML = `
      <h1>Upgrades</h1>
      <p class="coins">Coins: ${getCoins()}</p>
      ${shopHtml()}
      <p class="controls">
        <kbd>W</kbd>/<kbd>S</kbd> choose &middot; <kbd>Space</kbd> buy &middot; <kbd>U</kbd> or <kbd>Esc</kbd> back
      </p>`;
  } else if (state === 'levelup') {
    overlay.innerHTML = `
      <h1>Level up!</h1>
      <p>Pick an upgrade for this run</p>
      ${levelUpHtml()}
      <p class="controls"><kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> or <kbd>A</kbd>/<kbd>D</kbd> and <kbd>Space</kbd></p>`;
  } else if (state === 'paused') {
    overlay.innerHTML = `
      <h1>Paused</h1>
      <p>Press <kbd>P</kbd> to continue</p>`;
  } else if (state === 'gameover') {
    overlay.innerHTML = `
      <h1>Game Over</h1>
      <p class="final">Score: ${lastRun.score}</p>
      ${lastRun.newHighScore ? '<p class="new-best">New high score!</p>' : `<p class="best">Best in ${getMode().name}: ${getHighScore()}</p>`}
      <p class="coins">+${lastRun.coins} coins &middot; ${getCoins()} total &middot; <span class="link" data-shop>Press <kbd>U</kbd> for upgrades</span></p>
      <p>Press <kbd>Space</kbd> to play again</p>
      ${modeListHtml()}`;
  }
}

function gameOver() {
  state = 'gameover';
  player.visible = false;
  const score = getScore();
  const coins = Math.floor(score * getStats().coinGain);
  addCoins(coins);
  lastRun = { score, newHighScore: stopScore(), coins };
  renderOverlay();
}

function startGame() {
  resetRun(getBaseStats());
  resetPlayer();
  resetEnemies(scene);
  resetAttack();
  resetScore();
  player.visible = true;
  state = 'playing';
  renderOverlay();
}

// Menu keys that move the mode selection back or forward through the list
const MENU_STEPS = { KeyA: -1, ArrowLeft: -1, KeyD: 1, ArrowRight: 1 };
const SHOP_STEPS = { KeyW: -1, ArrowUp: -1, KeyS: 1, ArrowDown: 1 };
const CONFIRM_KEYS = ['Space', 'Enter', 'NumpadEnter'];

function openShop() {
  shopReturnState = state;
  state = 'shop';
  renderOverlay();
}

function closeShop() {
  state = shopReturnState;
  renderOverlay();
}

function buyAt(index) {
  shopIndex = index;
  buyUpgrade(BASE_UPGRADES[index]);
  renderOverlay();
}

function openLevelUp() {
  state = 'levelup';
  levelUpChoices = rollChoices();
  levelUpIndex = 0;
  renderOverlay();
}

function chooseUpgrade(index) {
  pickUpgrade(levelUpChoices[index]);
  // Keys pressed on this screen were meant for it, not for the game
  clearAttackRequest();
  clearQueuedMoves();
  if (hasPendingLevelUp()) {
    openLevelUp();
  } else {
    state = 'playing';
    renderOverlay();
  }
}

function handleMenuKey(event) {
  if (event.code === 'Space') {
    startGame();
  } else if (event.code === 'KeyU') {
    openShop();
  } else if (setModeByKey(event.key)) {
    renderOverlay();
  } else if (MENU_STEPS[event.code]) {
    cycleMode(MENU_STEPS[event.code]);
    renderOverlay();
  }
}

function handleShopKey(event) {
  if (SHOP_STEPS[event.code]) {
    shopIndex = (shopIndex + SHOP_STEPS[event.code] + BASE_UPGRADES.length) % BASE_UPGRADES.length;
    renderOverlay();
  } else if (CONFIRM_KEYS.includes(event.code)) {
    buyAt(shopIndex);
  } else if (['KeyU', 'Escape', 'Backspace'].includes(event.code)) {
    closeShop();
  }
}

function handleLevelUpKey(event) {
  const count = levelUpChoices.length;
  const numberIndex = Number(event.key) - 1;
  if (numberIndex >= 0 && numberIndex < count) {
    chooseUpgrade(numberIndex);
  } else if (MENU_STEPS[event.code] && count > 0) {
    levelUpIndex = (levelUpIndex + MENU_STEPS[event.code] + count) % count;
    renderOverlay();
  } else if (CONFIRM_KEYS.includes(event.code)) {
    chooseUpgrade(levelUpIndex);
  }
}

// Registered after Attack.js, so this runs after its Space handler; resetAttack drops that press
window.addEventListener('keydown', (event) => {
  if (event.repeat) return;

  if (state === 'start' || state === 'gameover') {
    handleMenuKey(event);
  } else if (state === 'shop') {
    handleShopKey(event);
  } else if (state === 'levelup') {
    handleLevelUpKey(event);
  } else if (event.code === 'KeyP' || event.code === 'Escape') {
    state = state === 'playing' ? 'paused' : 'playing';
    renderOverlay();
  }
});

// Mouse support for the shop, the level-up cards and the upgrades link
overlay.addEventListener('click', (event) => {
  const target = event.target.closest('[data-buy], [data-pick], [data-shop]');
  if (!target) return;

  if (target.dataset.buy !== undefined && state === 'shop') {
    buyAt(Number(target.dataset.buy));
  } else if (target.dataset.pick !== undefined && state === 'levelup') {
    chooseUpgrade(Number(target.dataset.pick));
  } else if (target.dataset.shop !== undefined && (state === 'start' || state === 'gameover')) {
    openShop();
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

// Difficulty multipliers, combined with the run's stats from base and in-game upgrades
function applyDifficulty(score) {
  const difficulty = getDifficulty(score);
  const stats = getStats();
  setEnemyDifficulty(difficulty.enemySpeed * stats.enemySpeed, difficulty.enemySpawnDelay);
  setPlayerSpeed(difficulty.playerSpeed * stats.playerSpeed);
  setAttackDifficulty(
    difficulty.attackCooldown * stats.attackCooldown,
    difficulty.attackRadius * stats.attackRadius
  );
}

// A shield takes the hit: every enemy close to Tode is knocked out and the run goes on
function absorbHit() {
  const nearby = enemies.filter(
    (enemy) =>
      Math.hypot(enemy.position.x - player.position.x, enemy.position.y - player.position.y) <=
      SHIELD_BLAST_RADIUS + enemy.userData.radius
  );
  for (const enemy of nearby) defeatEnemy(scene, enemy);
  addKills(nearby.length);
  addKillXp(nearby.length);

  // Restart the CSS flash animation
  document.body.classList.remove('shield-flash');
  void document.body.offsetWidth;
  document.body.classList.add('shield-flash');
}

function updateHud() {
  levelElement.textContent = `${getMode().name} · Level ${getLevel(getScore())}`;
  const readiness = getAttackReadiness();
  attackMeterFill.style.transform = `scaleX(${readiness})`;
  attackMeter.classList.toggle('ready', readiness >= 1);

  // Before the first run, show the shields the shop's base upgrades will give
  const stats = getStats();
  xpBarFill.style.transform = `scaleX(${stats ? getXpProgress() : 0})`;
  const shields = stats ? stats.shields : getBaseStats().shields;
  shieldsElement.textContent = `Shields: ${shields}`;
  shieldsElement.classList.toggle('empty', shields === 0);
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
      if (useShield()) absorbHit();
      else gameOver();
    } else {
      const kills = updateAttack(scene, delta, player, enemies);
      addKills(kills);
      addKillXp(kills);
      addSurvivalXp(delta);
      updateScore(delta);
      if (hasPendingLevelUp()) openLevelUp();
    }
  }
  if (state !== 'paused' && state !== 'levelup') updateDefeatedEnemies(delta);

  updateHud();
  updateMap(map, player.position);

  directionalLight.target.position.set(player.position.x, player.position.y, 0);
  directionalLight.position.copy(directionalLight.target.position).add(SUN_OFFSET);

  renderer.render(scene, camera);
});

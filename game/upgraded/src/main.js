import * as THREE from 'three';
import './style.css';
import {
  clearQueuedMoves,
  isMoveKey,
  player,
  playerReady,
  resetPlayer,
  setPlayerSpeed,
  updatePlayer,
} from './components/Player.js';
import { Camera } from './components/Camera.js';
import { Renderer } from './components/Renderer.js';
import {
  defeatEnemy,
  enemies,
  enemyReady,
  resetEnemies,
  setEnemyDifficulty,
  updateDefeatedEnemies,
  updateEnemies,
} from './components/Enemy.js';
import {
  ATTACKS,
  clearAttackRequest,
  cycleAttack,
  getAttack,
  getAttackReadiness,
  resetAttack,
  setAttackById,
  setAttackDifficulty,
  updateAttack,
} from './components/Attack.js';
import { addKills, getHighScore, getRunStats, getScore, resetScore, stopScore, updateScore } from './components/Score.js';
import { getDifficulty, getLevel } from './components/Difficulty.js';
import { isTouching } from './components/Collision.js';
import { GameMap, updateMap } from './components/Map.js';
import { houseTemplateReady } from './components/House.js';
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
import { isMuted, pauseAudio, resumeAudio, setMusicIntensity, SFX, stopMusic, toggleMute } from './components/Audio.js';
import {
  beatRing,
  getBeatPulse,
  getComboMultiplier,
  getRhythmStats,
  judge,
  registerJudgement,
  startRhythm,
  updateRhythm,
  updateRhythmHud,
} from './components/Rhythm.js';

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
player.add(beatRing);

// Enemies bob to the beat; skipped for players who ask their system for less motion
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const ENEMY_BOB_HEIGHT = 4;

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
attackMeter.innerHTML = '<div class="attack-meter-fill"></div><span></span>';
document.body.appendChild(attackMeter);
const attackMeterFill = attackMeter.querySelector('.attack-meter-fill');
const attackMeterLabel = attackMeter.querySelector('span');

// HUD: XP towards the next in-game upgrade, and shields left
const runHud = document.createElement('div');
runHud.className = 'run-hud';
runHud.innerHTML = '<div class="xp-bar"><div class="xp-bar-fill"></div><span>XP</span></div><div class="shields"></div>';
document.body.appendChild(runHud);
const xpBarFill = runHud.querySelector('.xp-bar-fill');
const shieldsElement = runHud.querySelector('.shields');

// One overlay for the start, pause and game over screens.
// Not aria-modal: that would hide the announcer below from some screen readers.
const overlay = document.createElement('div');
overlay.className = 'overlay';
overlay.setAttribute('role', 'dialog');
overlay.setAttribute('aria-labelledby', 'overlay-title');
document.body.appendChild(overlay);

// Screen reader announcements for events that happen outside the focused element
const announcer = document.createElement('div');
announcer.className = 'sr-only';
announcer.setAttribute('aria-live', 'polite');
document.body.appendChild(announcer);

function announce(message) {
  // Clear first so the same message twice in a row is still read out
  announcer.textContent = '';
  setTimeout(() => {
    announcer.textContent = message;
  }, 50);
}

function modeListHtml() {
  const current = getMode();
  const items = MODES.map(
    (mode) => `
      <li>
        <button type="button" data-mode="${mode.key}" aria-pressed="${mode === current}">
          <kbd>${mode.key}</kbd> ${mode.name} <small>${mode.description} &middot; ${mode.bpm} BPM</small>
        </button>
      </li>`
  ).join('');
  return `<ul class="modes" aria-label="Game mode">${items}</ul>`;
}

function attackListHtml() {
  const current = getAttack();
  const items = ATTACKS.map(
    (attack) => `
      <li>
        <button type="button" data-attack="${attack.id}" aria-pressed="${attack === current}">
          ${attack.name} <small>${attack.description}</small>
        </button>
      </li>`
  ).join('');
  return `
    <p class="list-label" id="attack-label">Attack <kbd>Q</kbd>/<kbd>E</kbd></p>
    <ul class="modes attacks" aria-labelledby="attack-label">${items}</ul>`;
}

const CONTROLS_HTML = `
  <p class="controls">
    <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>&larr;</kbd><kbd>&uarr;</kbd><kbd>&darr;</kbd><kbd>&rarr;</kbd> hop
    &middot; <kbd>Space</kbd> attack (Tongue fires on its own)
    &middot; <kbd>P</kbd> pause
    &middot; <kbd>M</kbd> sound
  </p>
  <p class="controls rhythm-tip">Hop and attack on the beat for combos: on-beat attacks hit harder, and combos multiply kill points (up to &times;3)</p>`;

function shopHtml() {
  const items = BASE_UPGRADES.map((upgrade, index) => {
    const level = getUpgradeLevel(upgrade);
    const maxed = isMaxed(upgrade);
    const cost = getUpgradeCost(upgrade);
    const shortfall = cost - getCoins();
    const classes = [
      index === shopIndex ? 'selected' : '',
      maxed ? 'maxed' : '',
      !maxed && shortfall > 0 ? 'too-expensive' : '',
    ].join(' ');
    // Spell out the price state in text so it doesn't rely on the cost colour
    let costText = `${cost} coins`;
    if (maxed) costText = 'Max';
    else if (shortfall > 0) costText = `${cost} coins (need ${shortfall} more)`;
    return `
      <li>
        <button type="button" class="${classes}" data-buy="${index}"${maxed ? ' aria-disabled="true"' : ''}>
          <strong>${upgrade.name}</strong>
          <span class="pips" aria-hidden="true">${'&#9679;'.repeat(level)}${'&#9675;'.repeat(upgrade.maxLevel - level)}</span>
          <span class="sr-only">Level ${level} of ${upgrade.maxLevel}.</span>
          <small>${upgrade.description}</small>
          <span class="cost">${costText}</span>
        </button>
      </li>`;
  }).join('');
  return `<ul class="shop" aria-label="Upgrades">${items}</ul>`;
}

function levelUpHtml() {
  if (levelUpChoices.length === 0) {
    return `
      <p>Every upgrade is maxed out!</p>
      <button type="button" class="primary" data-pick="0">Continue</button>`;
  }
  const items = levelUpChoices.map(
    (upgrade, index) => `
      <li>
        <button type="button" class="${index === levelUpIndex ? 'selected' : ''}" data-pick="${index}">
          <kbd>${index + 1}</kbd>
          <strong>${upgrade.name}</strong>
          <small>${upgrade.description}</small>
          <span class="stacks">${getStacks(upgrade)}/${upgrade.maxStacks}<span class="sr-only"> taken</span></span>
        </button>
      </li>`
  ).join('');
  return `<ul class="choices" aria-label="Upgrade choices">${items}</ul>`;
}

// 'start' | 'shop' | 'playing' | 'paused' | 'levelup' | 'gameover'
let state = 'start';
let lastRun = { score: 0, newHighScore: false, coins: 0, kills: 0, time: 0, bestCombo: 0, perfects: 0 };

// Shop selection, and the menu screen to go back to
let shopIndex = 0;
let shopReturnState = 'start';

// Upgrades offered on the current level-up screen
let levelUpChoices = [];
let levelUpIndex = 0;

// Difficulty level last read out to screen readers
let announcedLevel = 1;

// Tode above the start and game over titles (decorative, so screen readers skip it)
const TITLE_TODE_HTML = `<img class="title-tode" src="${import.meta.env.BASE_URL}tode.svg" alt="" width="96" height="88">`;

// Runs can't start until every model is loaded (before that Tode has no body to collide with)
let modelsLoaded = false;
Promise.all([playerReady, enemyReady, houseTemplateReady]).then(() => {
  modelsLoaded = true;
  if (state === 'start') renderOverlay();
});

const startButtonHtml = (label) =>
  modelsLoaded
    ? `<button type="button" class="primary" data-start>${label}</button>`
    : '<button type="button" class="primary" data-start disabled>Loading&hellip;</button>';

const UPGRADES_BUTTON_HTML =
  '<button type="button" class="link" data-shop>Upgrades <kbd>U</kbd></button>';

// "12 kills · survived 1:05"
function formatRunStats() {
  const seconds = Math.floor(lastRun.time);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return `${lastRun.kills} ${lastRun.kills === 1 ? 'kill' : 'kills'} &middot; survived ${time}`;
}

// "Best combo 14 · 9 perfect"
const formatRhythmStats = () => `Best combo ${lastRun.bestCombo} &middot; ${lastRun.perfects} perfect`;

function renderOverlay() {
  // Keyboard users moving through the mode or attack buttons stay on them after a re-render
  const focused = overlay.contains(document.activeElement) ? document.activeElement.dataset : {};
  const listFocus = focused.mode !== undefined ? 'mode' : focused.attack !== undefined ? 'attack' : null;

  overlay.classList.toggle('game-over', state === 'gameover');
  overlay.hidden = state === 'playing';

  // Every menu sits on one panel, built like a block of the game's checkerboard ground
  let html = null;

  if (state === 'start') {
    html = `
      ${TITLE_TODE_HTML}
      <h1 id="overlay-title">Tode's Escape</h1>
      <p>Choose a mode with <kbd>A</kbd>/<kbd>D</kbd>, then press <kbd>Space</kbd> to start</p>
      ${modeListHtml()}
      ${attackListHtml()}
      ${startButtonHtml('Start')}
      <p class="best">Best in ${getMode().name}: ${getHighScore()}</p>
      <p class="coins">Coins: ${getCoins()} &middot; ${UPGRADES_BUTTON_HTML}</p>
      ${CONTROLS_HTML}`;
  } else if (state === 'shop') {
    html = `
      <h1 id="overlay-title">Upgrades</h1>
      <p class="coins">Coins: ${getCoins()}</p>
      ${shopHtml()}
      <button type="button" class="link" data-back>Back <kbd>Esc</kbd></button>
      <p class="controls">
        <kbd>W</kbd>/<kbd>S</kbd> choose &middot; <kbd>Space</kbd> buy &middot; <kbd>U</kbd> or <kbd>Esc</kbd> back
      </p>`;
  } else if (state === 'levelup') {
    html = `
      <h1 id="overlay-title">Level up!</h1>
      <p>Pick an upgrade for this run</p>
      ${levelUpHtml()}
      <p class="controls"><kbd>1</kbd>/<kbd>2</kbd>/<kbd>3</kbd> or <kbd>A</kbd>/<kbd>D</kbd> and <kbd>Space</kbd></p>`;
  } else if (state === 'paused') {
    html = `
      <h1 id="overlay-title">Paused</h1>
      <button type="button" class="primary" data-resume>Resume</button>
      <p class="controls">Press <kbd>P</kbd> or <kbd>Esc</kbd> to continue</p>`;
  } else if (state === 'gameover') {
    html = `
      ${TITLE_TODE_HTML}
      <h1 id="overlay-title">Game Over</h1>
      <p class="final">Score: ${lastRun.score}</p>
      <p class="run-stats">${formatRunStats()}</p>
      <p class="run-stats">${formatRhythmStats()}</p>
      ${lastRun.newHighScore ? '<p class="new-best">New high score!</p>' : `<p class="best">Best in ${getMode().name}: ${getHighScore()}</p>`}
      <p class="coins">+${lastRun.coins} coins &middot; ${getCoins()} total &middot; ${UPGRADES_BUTTON_HTML}</p>
      ${startButtonHtml('Play again')}
      <p>Press <kbd>Space</kbd> to play again</p>
      ${modeListHtml()}
      ${attackListHtml()}`;
  }

  if (html !== null) overlay.innerHTML = `<div class="menu-panel">${html}</div>`;
  focusSelection(listFocus);
}

// Put keyboard focus on the current choice, so Tab, Enter and screen readers start from it
function focusSelection(listFocus) {
  let selector = null;
  if (state === 'start' || state === 'gameover') {
    selector = listFocus ? `[data-${listFocus}][aria-pressed="true"]` : '[data-start]';
  } else if (state === 'shop') {
    selector = `[data-buy="${shopIndex}"]`;
  } else if (state === 'levelup') {
    selector = `[data-pick="${levelUpIndex}"]`;
  } else if (state === 'paused') {
    selector = '[data-resume]';
  }

  const target = selector && overlay.querySelector(selector);
  if (target) target.focus();
  else if (overlay.contains(document.activeElement)) document.activeElement.blur();
}

function gameOver() {
  state = 'gameover';
  player.visible = false;
  const score = getScore();
  const coins = Math.floor(score * getStats().coinGain);
  addCoins(coins);
  lastRun = { score, newHighScore: stopScore(), coins, ...getRunStats(), ...getRhythmStats() };
  stopMusic();
  SFX.gameOver();
  announce(
    `Game over. Score ${score}.${lastRun.newHighScore ? ' New high score!' : ''} ${lastRun.kills} kills. Earned ${coins} coins.`
  );
  renderOverlay();
}

function startGame() {
  if (!modelsLoaded) return;
  resetRun(getBaseStats());
  resetPlayer();
  resetEnemies(scene);
  resetAttack(scene);
  resetScore();
  startRhythm(getMode().bpm);
  announcedLevel = getLevel(0);
  player.visible = true;
  state = 'playing';
  renderOverlay();
}

function pauseGame() {
  state = 'paused';
  pauseAudio();
  renderOverlay();
}

function resumeGame() {
  // Keys pressed while paused were meant for the menu, not for the game
  clearAttackRequest();
  clearQueuedMoves();
  resumeAudio();
  state = 'playing';
  renderOverlay();
}

function selectMode(key) {
  setModeByKey(key);
  announce(`${getMode().name} mode`);
  renderOverlay();
}

function selectAttack(id) {
  setAttackById(id);
  announce(`${getAttack().name} attack`);
  renderOverlay();
}

// Menu keys that move the attack selection back or forward through the list
const ATTACK_STEPS = { KeyQ: -1, KeyE: 1 };

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
  const upgrade = BASE_UPGRADES[index];
  if (buyUpgrade(upgrade)) {
    announce(`Bought ${upgrade.name}, level ${getUpgradeLevel(upgrade)}. ${getCoins()} coins left.`);
  } else if (isMaxed(upgrade)) {
    announce(`${upgrade.name} is already maxed.`);
  } else {
    announce(`Not enough coins for ${upgrade.name}.`);
  }
  renderOverlay();
}

// The music keeps playing over the level-up screen; the combo only fades during play
function openLevelUp() {
  if (state !== 'levelup') SFX.levelUp();
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
  } else if (MODES.some((mode) => mode.key === event.key)) {
    selectMode(event.key);
  } else if (MENU_STEPS[event.code]) {
    cycleMode(MENU_STEPS[event.code]);
    selectMode(getMode().key);
  } else if (ATTACK_STEPS[event.code]) {
    cycleAttack(ATTACK_STEPS[event.code]);
    selectAttack(getAttack().id);
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

  // Sound on/off works on every screen
  if (event.code === 'KeyM') {
    announce(toggleMute() ? 'Sound off' : 'Sound on');
    return;
  }

  // Hops are judged against the beat the moment the key goes down (attacks when they fire)
  if (state === 'playing' && isMoveKey(event.code)) {
    registerJudgement(judge(event.timeStamp));
    return;
  }

  // Space or Enter on a focused overlay button presses that button, and only that button
  const focusedButton = overlay.contains(document.activeElement) ? document.activeElement.closest('button') : null;
  if (focusedButton && CONFIRM_KEYS.includes(event.code)) {
    event.preventDefault();
    focusedButton.click();
    return;
  }

  if (state === 'start' || state === 'gameover') {
    handleMenuKey(event);
  } else if (state === 'shop') {
    handleShopKey(event);
  } else if (state === 'levelup') {
    handleLevelUpKey(event);
  } else if (event.code === 'KeyP' || event.code === 'Escape') {
    if (state === 'playing') pauseGame();
    else resumeGame();
  }
});

// The keydown handler above already pressed the button; stop the browser pressing it again on keyup
window.addEventListener('keyup', (event) => {
  if (CONFIRM_KEYS.includes(event.code) && overlay.contains(document.activeElement)) event.preventDefault();
});

// Overlay buttons: mouse, touch, Tab + Enter, and screen readers all come through here
overlay.addEventListener('click', (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  const { dataset } = target;
  const inMenu = state === 'start' || state === 'gameover';

  if (dataset.buy !== undefined && state === 'shop') {
    buyAt(Number(dataset.buy));
  } else if (dataset.back !== undefined && state === 'shop') {
    closeShop();
  } else if (dataset.pick !== undefined && state === 'levelup') {
    chooseUpgrade(Number(dataset.pick));
  } else if (dataset.shop !== undefined && inMenu) {
    openShop();
  } else if (dataset.mode !== undefined && inMenu) {
    selectMode(dataset.mode);
  } else if (dataset.attack !== undefined && inMenu) {
    selectAttack(dataset.attack);
  } else if (dataset.start !== undefined && inMenu) {
    startGame();
  } else if (dataset.resume !== undefined && state === 'paused') {
    resumeGame();
  }
});

// Tabbing through the shop or level-up cards moves the selection with the focus
overlay.addEventListener('focusin', (event) => {
  const { buy, pick } = event.target.dataset;
  if (buy === undefined && pick === undefined) return;

  if (buy !== undefined) shopIndex = Number(buy);
  if (pick !== undefined) levelUpIndex = Number(pick);
  for (const card of overlay.querySelectorAll('[data-buy], [data-pick]')) {
    card.classList.toggle('selected', card === event.target);
  }
});

// Pause automatically when the player switches away from the tab or the window loses focus
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'playing') pauseGame();
});
window.addEventListener('blur', () => {
  if (state === 'playing') pauseGame();
});

const playerTouchesEnemy = () =>
  enemies.some((enemy) =>
    isTouching(player.position.x, player.position.y, player.userData.radius, enemy)
  );

// Difficulty multipliers, combined with the run's stats from base and in-game upgrades
function applyDifficulty(score) {
  const difficulty = getDifficulty(score);
  const stats = getStats();
  setEnemyDifficulty(difficulty.enemySpeed * stats.enemySpeed, difficulty.enemySpawnDelay, difficulty.enemyHealth);
  setPlayerSpeed(difficulty.playerSpeed * stats.playerSpeed);
  setAttackDifficulty(
    difficulty.attackCooldown * stats.attackCooldown,
    difficulty.attackRadius * stats.attackRadius,
    stats.attackDamage
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
  SFX.shield();
  addKills(nearby.length);
  addKillXp(nearby.length);
  const shieldsLeft = getStats().shields;
  announce(`Shield used. ${shieldsLeft} ${shieldsLeft === 1 ? 'shield' : 'shields'} left.`);

  // Restart the CSS flash animation
  document.body.classList.remove('shield-flash');
  void document.body.offsetWidth;
  document.body.classList.add('shield-flash');
}

function updateHud() {
  const level = getLevel(getScore());
  levelElement.textContent = `${getMode().name} · Level ${level}${isMuted() ? ' · Muted' : ''}`;
  // More layers join the music as the danger grows
  setMusicIntensity(level >= 4 ? 3 : level >= 2 ? 2 : 1);
  if (state === 'playing' && level > announcedLevel) {
    announcedLevel = level;
    announce(`Level ${level}`);
  }
  const attack = getAttack();
  attackMeterLabel.textContent = attack.auto ? `${attack.name} (auto)` : attack.name;
  const readiness = getAttackReadiness();
  attackMeterFill.style.transform = `scaleX(${readiness})`;
  attackMeter.classList.toggle('ready', readiness >= 1);

  // Before the first run, show the shields the shop's base upgrades will give
  const stats = getStats();
  xpBarFill.style.transform = `scaleX(${stats ? getXpProgress() : 0})`;
  const shields = stats ? stats.shields : getBaseStats().shields;
  shieldsElement.textContent = `Shields: ${shields}`;
  shieldsElement.classList.toggle('empty', shields === 0);

  updateRhythmHud(state === 'playing' || state === 'levelup' || state === 'paused');
  const bob = reducedMotion.matches ? 0 : getBeatPulse() * ENEMY_BOB_HEIGHT;
  for (const enemy of enemies) enemy.position.z = bob;
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
      addKills(kills, getComboMultiplier());
      updateRhythm(delta);
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

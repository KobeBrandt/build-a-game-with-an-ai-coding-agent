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
  keepMarkersOnGround,
  resetEnemies,
  setDamageListener,
  setEnemyDifficulty,
  setHopperChance,
  spawnWave,
  updateDefeatedEnemies,
  updateEnemies,
} from './components/Enemy.js';
import {
  ATTACKS,
  clearAttackRequest,
  cycleAttack,
  getAttack,
  getAttackReadiness,
  getCooldownRemaining,
  getRawCooldown,
  isAttackReady,
  resetAttack,
  setAttackById,
  setAttackDifficulty,
  updateAttack,
} from './components/Attack.js';
import { addKills, getHighScore, getRunStats, getScore, resetScore, stopScore, updateScore } from './components/Score.js';
import { getDifficulty, getLevel } from './components/Difficulty.js';
import { isTouching } from './components/Collision.js';
import { GameMap, updateMap, updateOccluders } from './components/Map.js';
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
import {
  getVolumes,
  isMuted,
  pauseAudio,
  resumeAudio,
  setMusicIntensity,
  setVolume,
  SFX,
  toggleMute,
} from './components/Audio.js';
import {
  addCalibrationTap,
  beatRing,
  followCooldown,
  getBeatPulse,
  getCalibration,
  getComboMultiplier,
  getCurrentBeat,
  getInputOffsetMs,
  getRhythmStats,
  isFever,
  judge,
  registerJudgement,
  setInputOffsetMs,
  setJudgementListener,
  startCalibration,
  startRhythm,
  stopCalibration,
  stopRhythm,
  updateRhythm,
  updateRhythmHud,
} from './components/Rhythm.js';
import {
  burst,
  damageNumber,
  getShakeOffset,
  resetEffects,
  shake,
  trailMark,
  updateEffects,
} from './components/Effects.js';
import { updateTouchControls } from './components/Touch.js';
import { updateEnemyArrows } from './components/Indicators.js';

// Shadow tuning: the sun follows the player, so only the area around it needs a shadow map
const SUN_OFFSET = new THREE.Vector3(-100, -100, 200);
const SHADOW_AREA = 600; // half-size of the square around the player that receives shadows

// A shield that absorbs a hit also knocks out every enemy this close to Tode
const SHIELD_BLAST_RADIUS = 150;

// Game feel
const HITSTOP = 0.05; // seconds the game freezes on a Perfect attack
const TRAIL_SPACING = 14; // world units between fever trail marks

// Waves on the music's structure: every time the 4-bar loop starts again a wave joins in,
// and the first time the lead comes in (level 4, the "drop") a big one does.
const BEATS_PER_LOOP = 16;
const WAVE_SIZE = { Classic: 1, Horde: 3, Hunter: 0 }; // plus 1 for every 2 levels after the first
const DROP_WAVE_SIZE = { Classic: 4, Horde: 8, Hunter: 2 };
const DROP_LEVEL = 4;
// Share of new enemies that are hoppers: none at level 1, then 10% per level up to 40%
const hopperChanceFor = (level) => (level >= 2 ? Math.min(0.4, 0.1 * level) : 0);

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
const cameraRest = camera.position.clone(); // screen shake moves the camera around this point

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

// "Drop!" banner for the big wave when the lead melody comes in
const dropBanner = document.createElement('div');
dropBanner.className = 'drop-banner';
dropBanner.setAttribute('aria-hidden', 'true');
dropBanner.textContent = 'Drop!';
document.body.appendChild(dropBanner);

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
          <kbd>${mode.key}</kbd> ${mode.name} <small>${mode.description}</small>
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
    &middot; <kbd>O</kbd> sound &amp; timing
  </p>
  <p class="controls rhythm-tip">Hop and attack on the beat for combos: on-beat attacks hit harder, and combos multiply kill points (up to &times;2). The beat follows your attack's cooldown, so faster attacks mean faster music</p>`;

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

// 'start' | 'shop' | 'settings' | 'playing' | 'paused' | 'levelup' | 'gameover'
let state = 'start';

// Sound and timing screen: the menu to go back to, and whether the tapping test is running
let settingsReturnState = 'start';
let calibrating = false;
let lastRun = { score: 0, newHighScore: false, coins: 0, kills: 0, time: 0, bestCombo: 0, perfects: 0 };

// Shop selection, and the menu screen to go back to
let shopIndex = 0;
let shopReturnState = 'start';

// Upgrades offered on the current level-up screen
let levelUpChoices = [];
let levelUpIndex = 0;

// The level-up and game over screens open in the middle of play, often while the player is
// pressing Space to attack. For a moment after they open, they ignore input, so a press meant
// for the game can't pick an upgrade or start the next run unseen.
const MENU_INPUT_DELAY = 600; // ms
let menuInputLockedUntil = 0;

function lockMenuInput() {
  menuInputLockedUntil = performance.now() + MENU_INPUT_DELAY;
  overlay.classList.add('input-locked');
  setTimeout(() => overlay.classList.remove('input-locked'), MENU_INPUT_DELAY);
}

const menuInputLocked = () =>
  (state === 'levelup' || state === 'gameover') && performance.now() < menuInputLockedUntil;

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

const SETTINGS_BUTTON_HTML =
  '<button type="button" class="link" data-settings>Sound &amp; timing <kbd>O</kbd></button>';

const bestHtml = () => `<p class="best">Best in ${getMode().name} with ${getAttack().name}: ${getHighScore()}</p>`;

// "+12 ms (you press after the beat)"
function formatOffset(offsetMs) {
  if (offsetMs === 0) return '0 ms';
  const sign = offsetMs > 0 ? '+' : '−';
  return `${sign}${Math.abs(offsetMs)} ms (you press ${offsetMs > 0 ? 'after' : 'before'} the beat)`;
}

function calibrationStatusText() {
  const { taps, needed, offsetMs } = getCalibration();
  if (!calibrating) return 'Press Start tapping, then tap along with the clicks.';
  if (taps === 0) return `Tap along with the clicks: 0 of ${needed} taps.`;
  return `${Math.min(taps, needed)} of ${needed} taps, measured ${formatOffset(offsetMs)}.`;
}

function settingsHtml() {
  const volumes = getVolumes();
  const { taps, needed, offsetMs } = getCalibration();
  const canSave = calibrating && taps >= needed;
  return `
    <h1 id="overlay-title">Sound &amp; timing</h1>
    <div class="settings">
      <label>Music <input type="range" min="0" max="100" step="5" value="${Math.round(volumes.music * 100)}" data-volume="music"></label>
      <label>Sound effects <input type="range" min="0" max="100" step="5" value="${Math.round(volumes.sfx * 100)}" data-volume="sfx"></label>
      <p class="list-label">Timing offset: ${formatOffset(getInputOffsetMs())}</p>
      <p class="calibration-hint">Bluetooth headphones and some screens delay the sound. Tap <kbd>Space</kbd> or the Tap button along with the clicks, and the game will shift its timing to match you.</p>
      <p class="calibration-status" aria-live="polite">${calibrationStatusText()}</p>
      <div class="settings-buttons">
        ${calibrating
          ? '<button type="button" class="primary tap-button" data-tap>Tap</button><button type="button" data-calibrate>Stop</button>'
          : '<button type="button" class="primary" data-calibrate>Start tapping</button>'}
        <button type="button" data-save-offset${canSave ? '' : ' disabled'}>Use ${canSave ? formatOffset(offsetMs).split(' (')[0] : 'measured offset'}</button>
        <button type="button" data-reset-offset>Reset to 0</button>
      </div>
    </div>
    <button type="button" class="link" data-back-settings>Back <kbd>Esc</kbd></button>`;
}

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
      ${bestHtml()}
      <p class="coins">Coins: ${getCoins()} &middot; ${UPGRADES_BUTTON_HTML} &middot; ${SETTINGS_BUTTON_HTML}</p>
      ${CONTROLS_HTML}`;
  } else if (state === 'settings') {
    html = settingsHtml();
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
      ${lastRun.newHighScore ? '<p class="new-best">New high score!</p>' : bestHtml()}
      <p class="coins">+${lastRun.coins} coins &middot; ${getCoins()} total &middot; ${UPGRADES_BUTTON_HTML} &middot; ${SETTINGS_BUTTON_HTML}</p>
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
  } else if (state === 'settings') {
    selector = calibrating ? '[data-tap]' : '[data-calibrate]';
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
  stopRhythm();
  SFX.gameOver();
  lockMenuInput();
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
  resetEffects();
  lastWaveLoop = 0;
  dropDone = false;
  wasFever = false;
  hitstop = 0;
  // The music's tempo comes from the attack's starting cooldown, so set the run's stats first
  applyDifficulty(0);
  startRhythm(getRawCooldown(), getAttack().auto);
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

function openSettings() {
  settingsReturnState = state;
  state = 'settings';
  renderOverlay();
}

function closeSettings() {
  if (calibrating) stopCalibration();
  calibrating = false;
  state = settingsReturnState;
  renderOverlay();
}

function toggleCalibration() {
  calibrating = !calibrating;
  if (calibrating) startCalibration();
  else stopCalibration();
  renderOverlay();
}

// Update only the tap count, so the Tap button keeps its focus between taps
function calibrationTap(timeStamp) {
  if (!calibrating) return;
  const { taps, needed, offsetMs } = addCalibrationTap(timeStamp);
  overlay.querySelector('.calibration-status').textContent = calibrationStatusText();
  const save = overlay.querySelector('[data-save-offset]');
  if (taps >= needed) {
    save.disabled = false;
    save.textContent = `Use ${formatOffset(offsetMs).split(' (')[0]}`;
  }
}

function saveOffset() {
  const { taps, needed, offsetMs } = getCalibration();
  if (!calibrating || taps < needed) return;
  setInputOffsetMs(offsetMs);
  stopCalibration();
  calibrating = false;
  announce(`Timing offset set to ${offsetMs} milliseconds.`);
  renderOverlay();
}

function resetOffset() {
  setInputOffsetMs(0);
  announce('Timing offset reset.');
  renderOverlay();
}

function handleSettingsKey(event) {
  if (['Escape', 'Backspace', 'KeyO'].includes(event.code)) {
    event.preventDefault();
    closeSettings();
  }
}

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
  if (state !== 'levelup') {
    SFX.levelUp();
    lockMenuInput();
  }
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
  } else if (event.code === 'KeyO') {
    openSettings();
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

  // The tapping test takes Space and T as taps, timed by the key going down
  if (state === 'settings' && calibrating && ['Space', 'KeyT'].includes(event.code)) {
    event.preventDefault();
    calibrationTap(event.timeStamp);
    return;
  }

  // Hops are judged against the beat the moment the key goes down (attacks when they fire)
  if (state === 'playing' && isMoveKey(event.code)) {
    registerJudgement(judge(event.timeStamp));
    return;
  }

  if (menuInputLocked()) {
    // Also stop Enter from pressing the focused button
    if (CONFIRM_KEYS.includes(event.code)) event.preventDefault();
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
  } else if (state === 'settings') {
    handleSettingsKey(event);
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
  if (!target || menuInputLocked()) return;
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
  } else if (dataset.settings !== undefined && inMenu) {
    openSettings();
  } else if (dataset.calibrate !== undefined && state === 'settings') {
    toggleCalibration();
  } else if (dataset.tap !== undefined && state === 'settings') {
    // Pointer taps are timed on pointerdown (below); this is Enter on the focused button
    if (event.detail === 0) calibrationTap(event.timeStamp);
  } else if (dataset.saveOffset !== undefined && state === 'settings') {
    saveOffset();
  } else if (dataset.resetOffset !== undefined && state === 'settings') {
    resetOffset();
  } else if (dataset.backSettings !== undefined && state === 'settings') {
    closeSettings();
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

// A tap with a finger or mouse is timed when it goes down: a click only fires when it comes up
overlay.addEventListener('pointerdown', (event) => {
  if (state === 'settings' && event.target.closest('[data-tap]')) calibrationTap(event.timeStamp);
});

// Volume sliders: the sound effects slider plays a hit so you can hear the new level
overlay.addEventListener('input', (event) => {
  const kind = event.target.dataset.volume;
  if (!kind) return;
  setVolume(kind, Number(event.target.value) / 100);
  if (kind === 'sfx') SFX.hit();
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

const survivalTime = () => getRunStats().time;

const playerTouchesEnemy = () =>
  enemies.some((enemy) =>
    isTouching(player.position.x, player.position.y, player.userData.radius, enemy)
  );

// Difficulty multipliers from the time survived, combined with the run's stats from base and in-game upgrades
function applyDifficulty(seconds) {
  const difficulty = getDifficulty(seconds);
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
  for (const enemy of nearby) {
    burst(scene, enemy.position, 0x90ee90, 6);
    defeatEnemy(scene, enemy);
  }
  SFX.shield();
  shake(5);
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
  const level = getLevel(survivalTime());
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
  // Ready as soon as a press would fire (the last moment of the cooldown keeps the press)
  attackMeter.classList.toggle('ready', isAttackReady());

  // Before the first run, show the shields the shop's base upgrades will give
  const stats = getStats();
  xpBarFill.style.transform = `scaleX(${stats ? getXpProgress() : 0})`;
  const shields = stats ? stats.shields : getBaseStats().shields;
  shieldsElement.textContent = `Shields: ${shields}`;
  shieldsElement.classList.toggle('empty', shields === 0);

  updateRhythmHud(
    state === 'playing' || state === 'levelup' || state === 'paused',
    attack.auto ? null : getCooldownRemaining()
  );
  const bob = reducedMotion.matches ? 0 : getBeatPulse() * ENEMY_BOB_HEIGHT;
  // Hoppers move up and down with their own hops
  for (const enemy of enemies) if (!enemy.userData.hopper) enemy.position.z = bob;
  keepMarkersOnGround();

  updateTouchControls(state === 'playing', attack.auto);
}

// --- Feedback for hits, judgements and fever ---

// Damage numbers and particles on every hit; kills burst bigger, hoppers in pink
setDamageListener((enemy, amount, defeated) => {
  damageNumber(enemy.position, amount, defeated);
  if (defeated) {
    burst(scene, enemy.position, enemy.userData.hopper ? 0xe12885 : 0x9be564, 10);
    shake(1.5);
  }
});

// A Perfect attack freezes the game for a moment and kicks the camera
setJudgementListener((judgement, source) => {
  if (source === 'attack' && judgement.grade === 'perfect') {
    hitstop = HITSTOP;
    shake(3);
  }
});

let hitstop = 0;
let wasFever = false;
const lastTrailPosition = new THREE.Vector2();

function updateFever() {
  const fever = isFever();
  if (fever && !wasFever) {
    announce('Fever!');
    lastTrailPosition.set(player.position.x, player.position.y);
  }
  wasFever = fever;
  if (!fever) return;
  if (lastTrailPosition.distanceTo(player.position) >= TRAIL_SPACING) {
    trailMark(scene, player.position);
    lastTrailPosition.set(player.position.x, player.position.y);
  }
}

// --- Waves on the music's structure ---

let lastWaveLoop = 0;
let dropDone = false;

function showDropBanner() {
  dropBanner.classList.remove('show');
  void dropBanner.offsetWidth;
  dropBanner.classList.add('show');
}

function updateWaves(level) {
  setHopperChance(hopperChanceFor(level));
  const beat = getCurrentBeat();
  if (beat === null) return;

  if (!dropDone && level >= DROP_LEVEL) {
    dropDone = true;
    spawnWave(scene, player, DROP_WAVE_SIZE[getMode().name]);
    showDropBanner();
    shake(4);
    announce('Drop! A big wave is coming.');
  }

  const loop = Math.floor(beat / BEATS_PER_LOOP);
  if (loop > lastWaveLoop) {
    lastWaveLoop = loop;
    spawnWave(scene, player, WAVE_SIZE[getMode().name] + Math.floor((level - 1) / 2));
  }
}

const clock = new THREE.Clock();

renderOverlay();
updateScore(0);

renderer.setAnimationLoop(() => {
  // Cap the step so a long frame (e.g. after a hitch) can't teleport anything
  const delta = Math.min(clock.getDelta(), 0.1);

  // A hitstop freezes the game (not the music) for a moment
  const frozen = hitstop > 0;
  hitstop = Math.max(0, hitstop - delta);

  if (state === 'playing' && !frozen) {
    applyDifficulty(survivalTime());
    followCooldown(getRawCooldown(), getAttack().auto);
    updateWaves(getLevel(survivalTime()));

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
      updateFever();
      if (hasPendingLevelUp()) openLevelUp();
    }
  }
  if (state !== 'paused' && state !== 'levelup') updateDefeatedEnemies(delta);

  updateHud();
  updateMap(map, player.position);
  updateOccluders(player.position, cameraRest);
  updateEffects(state === 'paused' || state === 'levelup' ? 0 : delta, camera);
  camera.position.copy(cameraRest).add(getShakeOffset());
  player.updateMatrixWorld();
  updateEnemyArrows(state === 'playing' || state === 'paused' || state === 'levelup', enemies, player, camera);

  directionalLight.target.position.set(player.position.x, player.position.y, 0);
  directionalLight.position.copy(directionalLight.target.position).add(SUN_OFFSET);

  renderer.render(scene, camera);
});

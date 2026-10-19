import { getMode } from './Modes.js';

// Scoring tuning
const SCORE_PER_SECOND = 0.1; // 1 point every 10 seconds survived
const SCORE_PER_KILL = 10;
const HIGH_SCORE_KEY = 'tode-high-scores';

const scoreElement = document.createElement('div');
scoreElement.className = 'score';
scoreElement.innerHTML = `
  <span class="score-value"></span>
  <span class="score-best"></span>
`;
document.body.appendChild(scoreElement);
const valueElement = scoreElement.querySelector('.score-value');
const bestElement = scoreElement.querySelector('.score-best');

// Best score per game mode, kept between visits when the browser allows it
function loadHighScores() {
  try {
    return JSON.parse(localStorage.getItem(HIGH_SCORE_KEY)) ?? {};
  } catch {
    return {};
  }
}

const highScores = loadHighScores();

function saveHighScores() {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, JSON.stringify(highScores));
  } catch {
    // Storage blocked (private window etc.): the high score just lasts for this visit
  }
}

export function getHighScore() {
  return highScores[getMode().name] ?? 0;
}

// Survival time is advanced by the game loop, so pausing simply stops the count
let survivalTime = 0;
let killScore = 0;
let kills = 0;
let displayedScore = null;
let displayedBest = null;

/**
 * Record the finished run. Returns true if it set a new high score.
 */
export function stopScore() {
  const score = getScore();
  if (score <= getHighScore()) return false;

  highScores[getMode().name] = score;
  saveHighScores();
  updateScore(0);
  return true;
}

export function resetScore() {
  killScore = 0;
  kills = 0;
  survivalTime = 0;
  updateScore(0);
}

export function addKills(count) {
  kills += count;
  killScore += count * SCORE_PER_KILL;
  if (count > 0) {
    // Restart the CSS pop animation on every kill
    scoreElement.classList.remove('score-pop');
    void scoreElement.offsetWidth;
    scoreElement.classList.add('score-pop');
  }
}

/**
 * Enemies defeated and seconds survived this run.
 */
export function getRunStats() {
  return { kills, time: survivalTime };
}

export function getScore() {
  return Math.floor(survivalTime * SCORE_PER_SECOND + killScore);
}

export function updateScore(delta) {
  survivalTime += delta;
  const score = getScore();
  const best = Math.max(score, getHighScore());
  if (score === displayedScore && best === displayedBest) return;

  displayedScore = score;
  displayedBest = best;
  valueElement.textContent = `Score: ${score}`;
  bestElement.textContent = `Best: ${best}`;
}

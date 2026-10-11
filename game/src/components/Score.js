import * as THREE from 'three';

// Scoring tuning
const SCORE_PER_SECOND = 0.1; // 1 point every 10 seconds survived
const SCORE_PER_KILL = 10;

const scoreElement = document.createElement('div');
scoreElement.className = 'score';
document.body.appendChild(scoreElement);

const clock = new THREE.Clock();
let killScore = 0;
let displayedScore = null;

export function stopScore() {
  clock.stop();
}

export function resetScore() {
  killScore = 0;
  clock.start(); // restarts elapsed time from 0
  updateScore();
}

export function addKills(count) {
  killScore += count * SCORE_PER_KILL;
}

export function getScore() {
  return Math.floor(clock.getElapsedTime() * SCORE_PER_SECOND + killScore);
}

export function updateScore() {
  const score = getScore();
  if (score === displayedScore) return;

  displayedScore = score;
  scoreElement.textContent = `Score: ${score}`;
}

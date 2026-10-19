import * as THREE from 'three';
import {
  audibleTime,
  getSecondsPerBeat,
  getSongStart,
  isMusicPlaying,
  SFX,
  startMusic,
} from './Audio.js';

// Rhythm tuning. Hops and attacks pressed on the music's beat are judged:
// Perfect and Great build a combo, a press far off the beat breaks it.
// The combo multiplies the score for kills, and an on-beat attack hits harder.
// Playing off the beat is never punished beyond losing the combo, so the rhythm stays optional.
const PERFECT_WINDOW = 0.05; // seconds either side of the beat
const GREAT_WINDOW = 0.11;
const PERFECT_DAMAGE = 1.5;
const GREAT_DAMAGE = 1.25;
const COMBO_STEP = 0.05; // score multiplier gained per combo
const MAX_COMBO_BONUS = 2; // so the multiplier tops out at ×3 (combo 40)
const IDLE_BEATS = 8; // beats of play without an on-beat press before the combo fades
const TRACK_SPACING = 40; // px between beat markers on the HUD track
const TRACK_BEATS = 3; // markers shown on each side of the target

const GRADES = {
  perfect: { label: 'Perfect!', damage: PERFECT_DAMAGE },
  great: { label: 'Great', damage: GREAT_DAMAGE },
  miss: { label: 'Off beat', damage: 1 },
};

let combo = 0;
let bestCombo = 0;
let perfects = 0;
let greats = 0;
let idleBeats = 0;
let lastJudgedBeat = -Infinity;

// --- HUD: a beat track with markers sliding into the target, and the combo below it ---

const hud = document.createElement('div');
hud.className = 'beat-hud';
hud.hidden = true;
hud.innerHTML = `
  <div class="beat-track" aria-hidden="true"><div class="beat-target"></div></div>
  <div class="beat-combo"></div>
  <div class="beat-judgement" aria-hidden="true"></div>`;
document.body.appendChild(hud);
const track = hud.querySelector('.beat-track');
const target = hud.querySelector('.beat-target');
const comboElement = hud.querySelector('.beat-combo');
const judgementElement = hud.querySelector('.beat-judgement');

// Two markers per beat (one from each side) for every beat that can be on screen
const markers = [];
for (let i = 0; i < (TRACK_BEATS + 1) * 2; i++) {
  const marker = document.createElement('div');
  marker.className = 'beat-marker';
  track.appendChild(marker);
  markers.push(marker);
}

// A ring on the ground under Tode that pulses on every beat (added to the player in main.js)
export const beatRing = new THREE.Mesh(
  new THREE.RingGeometry(18, 22, 40),
  new THREE.MeshBasicMaterial({ color: 0x39c5bb, transparent: true, opacity: 0, depthWrite: false })
);
beatRing.position.z = 0.2;

function restartAnimation(element, className) {
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

// --- Beat clock ---------------------------------------------------------------

/**
 * Beats since the song started (a float), at `performanceTime`; null while no music plays.
 */
function beatAt(performanceTime) {
  if (!isMusicPlaying()) return null;
  const time = audibleTime(performanceTime);
  if (time === null) return null;
  return (time - getSongStart()) / getSecondsPerBeat();
}

/**
 * 1 right on a beat, fading to 0 just before the next one. 0 while no music plays.
 */
export function getBeatPulse() {
  const beat = beatAt(performance.now());
  if (beat === null || beat < 0) return 0;
  return (1 - (beat - Math.floor(beat))) ** 3;
}

/**
 * Index of the current 16th note, or null without music; the Tongue lashes on these.
 */
export function getSixteenth() {
  const beat = beatAt(performance.now());
  return beat === null ? null : Math.floor(beat * 4);
}

// --- Judging ------------------------------------------------------------------

/**
 * How close a press at `eventTimeStamp` (an event's timeStamp) was to the nearest beat.
 * Returns { grade, beat, damage } or null while no music plays. Has no side effects.
 */
export function judge(eventTimeStamp) {
  const beat = beatAt(eventTimeStamp);
  if (beat === null) return null;
  const nearest = Math.max(0, Math.round(beat));
  const offset = Math.abs(beat - nearest) * getSecondsPerBeat();
  let grade = 'miss';
  if (offset <= PERFECT_WINDOW) grade = 'perfect';
  else if (offset <= GREAT_WINDOW) grade = 'great';
  return { grade, beat: nearest, damage: GRADES[grade].damage };
}

/**
 * Count a judged press towards the combo, with sound and HUD feedback.
 * A second on-beat press on a beat that already counted (say, a hop and an attack together)
 * is ignored, so mashing every key on one beat doesn't pad the combo.
 */
export function registerJudgement(judgement) {
  if (!judgement) return;
  const { grade, beat } = judgement;

  if (grade === 'miss') {
    if (combo >= 5) SFX.comboBreak();
    combo = 0;
  } else {
    if (beat === lastJudgedBeat) return;
    lastJudgedBeat = beat;
    combo++;
    bestCombo = Math.max(bestCombo, combo);
    idleBeats = 0;
    if (grade === 'perfect') {
      perfects++;
      SFX.perfect();
    } else {
      greats++;
      SFX.great();
    }
    restartAnimation(target, 'hit');
  }

  judgementElement.textContent = GRADES[grade].label;
  judgementElement.dataset.grade = grade;
  restartAnimation(judgementElement, 'show');
  updateComboText();
}

/**
 * Score multiplier for kills from the current combo: ×1 at no combo, up to ×3.
 */
export function getComboMultiplier() {
  return 1 + Math.min(MAX_COMBO_BONUS, combo * COMBO_STEP);
}

function updateComboText() {
  comboElement.textContent = combo > 0 ? `Combo ${combo} · ×${getComboMultiplier().toFixed(2)}` : 'Hop on the beat!';
  hud.classList.toggle('on-fire', getComboMultiplier() >= 2);
}

// --- Run --------------------------------------------------------------------------

export function startRhythm(bpm) {
  combo = 0;
  bestCombo = 0;
  perfects = 0;
  greats = 0;
  idleBeats = 0;
  lastJudgedBeat = -Infinity;
  judgementElement.classList.remove('show');
  updateComboText();
  startMusic(bpm);
}

export function getRhythmStats() {
  return { bestCombo, perfects, greats };
}

/**
 * Advance the rhythm system by one frame of play: fade a combo nobody kept up.
 */
export function updateRhythm(delta) {
  if (combo === 0 || !isMusicPlaying()) return;
  idleBeats += delta / getSecondsPerBeat();
  if (idleBeats > IDLE_BEATS) {
    combo = 0;
    updateComboText();
  }
}

/**
 * Draw the beat track and the ground ring. `visible` is false outside a run.
 */
export function updateRhythmHud(visible) {
  const beat = visible ? beatAt(performance.now()) : null;
  hud.hidden = beat === null;
  beatRing.visible = beat !== null && beat >= 0;
  if (beat === null) return;

  const pulse = getBeatPulse();
  beatRing.material.opacity = 0.55 * pulse;
  beatRing.scale.setScalar(1 + 0.6 * (1 - pulse));

  // Markers slide in from both sides and meet in the target on the beat
  const first = Math.ceil(beat - 0.25);
  markers.forEach((marker, i) => {
    const upcoming = first + Math.floor(i / 2);
    const distance = upcoming - beat;
    const side = i % 2 === 0 ? -1 : 1;
    const shown = upcoming >= 0 && distance <= TRACK_BEATS;
    marker.style.opacity = shown ? String(Math.max(0, Math.min(1, 1.2 - distance / TRACK_BEATS))) : '0';
    marker.style.transform = `translateX(${side * distance * TRACK_SPACING}px)`;
  });
}

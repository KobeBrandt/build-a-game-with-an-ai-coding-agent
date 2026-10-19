import * as THREE from 'three';
import {
  audibleTime,
  beatAtTime,
  getBpm,
  getSecondsPerBeat,
  isMusicPlaying,
  setTempo,
  SFX,
  startMusic,
} from './Audio.js';

// Rhythm tuning. Hops and attacks pressed on the music's beat are judged:
// Perfect and Great build a combo, a press far off the beat breaks it.
// The combo multiplies the score for kills, and an on-beat attack hits harder.
// Playing off the beat is never punished beyond losing the combo, so the rhythm stays optional.
//
// The beat follows the attack: the tempo is set so the attack's cooldown is a whole number of
// beats (1, 2, 4...), and the cooldown is then measured in those beats. So an attack fired on the
// beat is ready again exactly on a later beat, and cooldown upgrades speed the music up.
// When the tempo would pass MAX_BPM it halves into "half time" and the cooldown counts half the beats.
export const PERFECT_WINDOW = 0.045; // seconds either side of the beat
export const GREAT_WINDOW = 0.09;
const PERFECT_DAMAGE = 1.4;
const GREAT_DAMAGE = 1.2;
const COMBO_STEP = 0.05; // score multiplier gained per combo
const MAX_COMBO_BONUS = 1; // so the multiplier tops out at ×2 (combo 20)
const IDLE_BEATS = 8; // beats of play without an on-beat press before the combo fades
const MIN_BPM = 80;
const MAX_BPM = 160;
// Fewest beats an attack's cooldown can last. Spit and Shockwave are pressed on beats, so at
// least 1; the Tongue fires on its own, so it can go down to a 16th note.
const MIN_COOLDOWN_BEATS = 1;
const MIN_AUTO_COOLDOWN_BEATS = 0.25;
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
  <div class="beat-info"><span class="beat-combo"></span><span class="beat-bpm"></span></div>
  <div class="beat-judgement" aria-hidden="true"></div>`;
document.body.appendChild(hud);
const track = hud.querySelector('.beat-track');
const target = hud.querySelector('.beat-target');
const comboElement = hud.querySelector('.beat-combo');
const bpmElement = hud.querySelector('.beat-bpm');
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
  return beatAtTime(time);
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

// --- Tempo from the attack's cooldown ----------------------------------------------

/**
 * Tempo that makes `cooldown` (seconds) a whole power-of-two number of beats, between MIN_BPM and
 * MAX_BPM. Capped at MAX_BPM when even the shortest allowed cooldown would be faster.
 */
function tempoForCooldown(cooldown, auto) {
  let beats = auto ? MIN_AUTO_COOLDOWN_BEATS : MIN_COOLDOWN_BEATS;
  let bpm = (60 * beats) / cooldown;
  while (bpm < MIN_BPM) {
    beats *= 2;
    bpm *= 2;
  }
  return Math.round(Math.min(bpm, MAX_BPM));
}

/**
 * Keep the music's tempo in step with the attack's current cooldown (base, upgrades and difficulty).
 * The new tempo starts on the next bar.
 */
export function followCooldown(cooldown, auto) {
  if (isMusicPlaying()) setTempo(tempoForCooldown(cooldown, auto));
}

/**
 * The attack's cooldown locked to the beat: `cooldown` rounded to the nearest power-of-two number
 * of beats at the tempo playing now. Without music, `cooldown` itself.
 */
export function getBeatCooldown(cooldown, auto) {
  if (!isMusicPlaying()) return cooldown;
  const beatLength = getSecondsPerBeat();
  const minBeats = auto ? MIN_AUTO_COOLDOWN_BEATS : MIN_COOLDOWN_BEATS;
  const beats = Math.max(minBeats, 2 ** Math.round(Math.log2(cooldown / beatLength)));
  return beats * beatLength;
}

// --- Judging ------------------------------------------------------------------

/**
 * How close a press at `eventTimeStamp` (an event's timeStamp) was to the nearest beat.
 * Returns { grade, beat, offset, damage } or null while no music plays; `offset` is the seconds
 * the press came after the beat (negative when early). Has no side effects.
 */
export function judge(eventTimeStamp) {
  const time = isMusicPlaying() ? audibleTime(eventTimeStamp) : null;
  if (time === null) return null;
  const beat = beatAtTime(time);
  const nearest = Math.max(0, Math.round(beat));
  const offset = (beat - nearest) * getSecondsPerBeat(time);
  let grade = 'miss';
  if (Math.abs(offset) <= PERFECT_WINDOW) grade = 'perfect';
  else if (Math.abs(offset) <= GREAT_WINDOW) grade = 'great';
  return { grade, beat: nearest, offset, damage: GRADES[grade].damage };
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
 * Score multiplier for kills from the current combo: ×1 at no combo, up to ×2.
 */
export function getComboMultiplier() {
  return 1 + Math.min(MAX_COMBO_BONUS, combo * COMBO_STEP);
}

function updateComboText() {
  comboElement.textContent = combo > 0 ? `Combo ${combo} · ×${getComboMultiplier().toFixed(2)}` : 'Hop on the beat!';
  hud.classList.toggle('on-fire', getComboMultiplier() >= 1 + MAX_COMBO_BONUS);
}

// --- Run --------------------------------------------------------------------------

/**
 * Start a run's music at the tempo that fits the attack's starting cooldown.
 */
export function startRhythm(cooldown, auto) {
  combo = 0;
  bestCombo = 0;
  perfects = 0;
  greats = 0;
  idleBeats = 0;
  lastJudgedBeat = -Infinity;
  judgementElement.classList.remove('show');
  updateComboText();
  startMusic(tempoForCooldown(cooldown, auto));
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
 * `attackReadyIn` is the seconds until the attack is ready (null for the Tongue, which fires
 * on its own): beats the attack will be ready on get big markers.
 */
export function updateRhythmHud(visible, attackReadyIn = null) {
  const beat = visible ? beatAt(performance.now()) : null;
  hud.hidden = beat === null;
  beatRing.visible = beat !== null && beat >= 0;
  if (beat === null) return;

  const beatLength = getSecondsPerBeat();
  bpmElement.textContent = `${Math.round(getBpm())} BPM`;

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
    marker.classList.toggle('attack', attackReadyIn !== null && distance * beatLength >= attackReadyIn - GREAT_WINDOW);
  });
}

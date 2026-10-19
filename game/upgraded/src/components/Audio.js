// Music and sound effects, all synthesised with the Web Audio API (no sound files to load).
// The music is a 4-bar loop on the classic vi-IV-I-V progression (Am, F, C, G). It is the beat
// clock for the rhythm system in Rhythm.js: every beat time comes from the audio clock, so the
// beat the player sees and the beat they hear never drift apart. The tempo can change during a run
// (Rhythm.js sets it from the attack's cooldown); a new tempo starts on the next bar.

const MUTE_KEY = 'tode-muted';
const VOLUME_KEY = 'tode-volume';
const MASTER_VOLUME = 0.5;
const MUSIC_VOLUME = 0.55;
const SFX_VOLUME = 0.8;
const LOOKAHEAD = 0.12; // seconds of music scheduled ahead of the audio clock
const SCHEDULE_INTERVAL = 25; // ms between scheduler runs
const START_DELAY = 0.15; // seconds between starting a run and the first beat
const STEPS_PER_BEAT = 4; // the sequencer runs on 16th notes
const STEPS_PER_BAR = 16;

// One chord per bar: root note (MIDI) for the bass and chord tones for the arpeggio
const CHORDS = [
  { root: 45, tones: [69, 72, 76, 81] }, // Am
  { root: 41, tones: [65, 69, 72, 77] }, // F
  { root: 48, tones: [67, 72, 76, 79] }, // C
  { root: 43, tones: [67, 71, 74, 79] }, // G
];
// Which chord tone the arpeggio plays on each 16th step of a bar (-1 = rest)
const ARP_PATTERN = [0, 2, 1, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, -1];
// Lead melody, one note (MIDI) per 8th note of the 4-bar loop (0 = rest), sung by the voice synth
// from level 4 and in fever
const LEAD = [
  76, 0, 79, 81, 79, 76, 74, 0, 72, 0, 74, 76, 0, 72, 69, 0,
  72, 0, 76, 79, 76, 72, 0, 74, 79, 0, 76, 74, 72, 74, 76, 0,
];

// Vowel formants (Hz) for the voice synth: the lead sings "la" and "li"
const VOWELS = {
  a: [800, 1150, 2900],
  i: [300, 2300, 3000],
};
const L_FORMANTS = [350, 1100, 2700]; // the "l" each syllable starts from

const midiToHz = (note) => 440 * 2 ** ((note - 69) / 12);

function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

let muted = loadMuted();

// Music and sound effect volumes, each 0 to 1 (on top of the mix levels above)
function loadVolumes() {
  try {
    const saved = JSON.parse(localStorage.getItem(VOLUME_KEY));
    return { music: saved?.music ?? 1, sfx: saved?.sfx ?? 1 };
  } catch {
    return { music: 1, sfx: 1 };
  }
}

const volumes = loadVolumes();
let context = null;
let master = null;
let sfxBus = null;
let noiseBuffer = null;

// Music state for the current run
let musicBus = null;
let bpm = 120;
let pendingBpm = null; // tempo that starts on the next bar
// Tempo changes so far: { time, beat, bpm } from `time` (audio seconds) on, starting at `beat`.
// Kept so the audio the player hears now (a little behind the scheduler) is still timed right.
const tempoSegments = [];
const MAX_SEGMENTS = 4;
let nextStep = 0; // next 16th step to schedule
let nextStepTime = 0; // audio time of that step
let schedulerId = null;
let intensity = 1; // 1 = drums and bass, 2 = + snare and arpeggio, 3 = + lead
let fever = false; // a combo fever adds the lead (and an octave-up double) at any intensity
let metronome = false; // calibration: just a click on every beat

/**
 * Create the audio context. Browsers only allow this after a click or key press,
 * so it is called when a run starts. Returns false when Web Audio isn't available.
 */
export function ensureAudio() {
  if (context) return true;
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioContextClass) return false;

  context = new AudioContextClass({ latencyHint: 'interactive' });
  master = context.createGain();
  master.gain.value = muted ? 0 : MASTER_VOLUME;
  // A gentle compressor keeps stacked hits from clipping
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.ratio.value = 6;
  master.connect(limiter).connect(context.destination);

  sfxBus = context.createGain();
  sfxBus.gain.value = SFX_VOLUME * volumes.sfx;
  sfxBus.connect(master);

  // One second of white noise, shared by the drums and the shockwave
  noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return true;
}

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // Storage blocked: the setting just lasts for this visit
  }
  if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, context.currentTime, 0.02);
  return muted;
}

export function getVolumes() {
  return { ...volumes };
}

/**
 * Set the 'music' or 'sfx' volume (0 to 1); saved between visits.
 */
export function setVolume(kind, value) {
  volumes[kind] = Math.min(1, Math.max(0, value));
  try {
    localStorage.setItem(VOLUME_KEY, JSON.stringify(volumes));
  } catch {
    // Storage blocked: the setting just lasts for this visit
  }
  if (!context) return;
  if (kind === 'sfx') sfxBus.gain.setTargetAtTime(SFX_VOLUME * volumes.sfx, context.currentTime, 0.02);
  if (kind === 'music' && musicBus) musicBus.gain.setTargetAtTime(MUSIC_VOLUME * volumes.music, context.currentTime, 0.02);
}

/**
 * Audio time the speakers are playing right now, or null without audio.
 * Pass an event's `timeStamp` to get the audio time the player heard when the event happened.
 */
export function audibleTime(performanceTime = performance.now()) {
  if (!context || context.state !== 'running') return null;
  if (context.getOutputTimestamp) {
    const stamp = context.getOutputTimestamp();
    if (stamp.performanceTime > 0) {
      return stamp.contextTime + (performanceTime - stamp.performanceTime) / 1000;
    }
  }
  return context.currentTime - (context.outputLatency || context.baseLatency || 0);
}

// Beat clock for Rhythm.js
export const isMusicPlaying = () => musicBus !== null && context.state === 'running';

function segmentAt(time) {
  for (let i = tempoSegments.length - 1; i > 0; i--) {
    if (tempoSegments[i].time <= time) return tempoSegments[i];
  }
  return tempoSegments[0];
}

/**
 * Beats since the song started (a float) at audio time `time`.
 */
export function beatAtTime(time) {
  const segment = segmentAt(time);
  return segment.beat + ((time - segment.time) * segment.bpm) / 60;
}

/**
 * Length of a beat in seconds at audio time `time` (default: what is playing now).
 */
export function getSecondsPerBeat(time = audibleTime()) {
  if (time === null || tempoSegments.length === 0) return 60 / bpm;
  return 60 / segmentAt(time).bpm;
}

/**
 * Tempo the player hears right now, in beats per minute.
 */
export const getBpm = () => 60 / getSecondsPerBeat();

/**
 * Ask for a new tempo; it starts on the next bar, so the music never stumbles mid-bar.
 */
export function setTempo(newBpm) {
  pendingBpm = newBpm === bpm ? null : newBpm;
}

export function setMusicIntensity(level) {
  intensity = level;
}

export function setFever(on) {
  fever = on;
}

// --- Instruments -----------------------------------------------------------

// A short envelope: quick attack, exponential decay to silence
function envelope(gainNode, time, peak, decay) {
  gainNode.gain.setValueAtTime(0.0001, time);
  gainNode.gain.exponentialRampToValueAtTime(peak, time + 0.005);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, time + decay);
}

function tone(bus, time, { type = 'sine', from, to = from, peak = 0.3, decay = 0.15, filter = null }) {
  const osc = context.createOscillator();
  const gain = context.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, time);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, time + decay);
  envelope(gain, time, peak, decay);
  let node = osc;
  if (filter) {
    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = filter;
    node = node.connect(lowpass);
  }
  node.connect(gain).connect(bus);
  osc.start(time);
  osc.stop(time + decay + 0.02);
}

// A sung syllable: a buzzy sawtooth through three vowel formant filters, with a little vibrato.
// Each note glides from an "l" into its vowel, so the lead sings "la la li".
function voice(bus, time, { note, length, vowel = 'a', peak = 0.5 }) {
  const osc = context.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(midiToHz(note), time);
  // Vibrato fades in after the attack, like a held sung note
  const lfo = context.createOscillator();
  const lfoDepth = context.createGain();
  lfo.frequency.value = 5.5;
  lfoDepth.gain.setValueAtTime(0, time);
  lfoDepth.gain.linearRampToValueAtTime(18, time + Math.min(0.15, length));
  lfo.connect(lfoDepth).connect(osc.detune);

  const out = context.createGain();
  out.gain.setValueAtTime(0.0001, time);
  out.gain.exponentialRampToValueAtTime(peak, time + 0.03);
  out.gain.setValueAtTime(peak, time + length * 0.7);
  out.gain.exponentialRampToValueAtTime(0.0001, time + length);

  VOWELS[vowel].forEach((frequency, i) => {
    const formant = context.createBiquadFilter();
    formant.type = 'bandpass';
    formant.Q.value = 7;
    formant.frequency.setValueAtTime(L_FORMANTS[i], time);
    formant.frequency.exponentialRampToValueAtTime(frequency, time + 0.05);
    const level = context.createGain();
    level.gain.value = [1, 0.6, 0.25][i];
    osc.connect(formant).connect(level).connect(out);
  });
  out.connect(bus);
  osc.start(time);
  lfo.start(time);
  osc.stop(time + length + 0.02);
  lfo.stop(time + length + 0.02);
}

function noise(bus, time, { type = 'highpass', frequency, peak = 0.3, decay = 0.05, sweepTo = null }) {
  const source = context.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(frequency, time);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, time + decay);
  const gain = context.createGain();
  envelope(gain, time, peak, decay);
  source.connect(filter).connect(gain).connect(bus);
  source.start(time, Math.random() * 0.5);
  source.stop(time + decay + 0.02);
}

const kick = (bus, time) => tone(bus, time, { from: 160, to: 40, peak: 0.9, decay: 0.22 });
const hat = (bus, time, open) => noise(bus, time, { frequency: 7000, peak: open ? 0.12 : 0.08, decay: open ? 0.12 : 0.04 });

function snare(bus, time) {
  noise(bus, time, { frequency: 1500, peak: 0.35, decay: 0.14 });
  tone(bus, time, { type: 'triangle', from: 220, to: 160, peak: 0.25, decay: 0.08 });
}

// --- Music sequencer -------------------------------------------------------

function scheduleStep(step, time) {
  const inBar = step % STEPS_PER_BAR;
  if (metronome) {
    // Calibration click: a kick and a high tick on every beat, an accent on the bar
    if (inBar % STEPS_PER_BEAT === 0) {
      kick(musicBus, time);
      tone(musicBus, time, { type: 'square', from: inBar === 0 ? 1760 : 1320, peak: 0.08, decay: 0.05, filter: 5000 });
    }
    return;
  }
  const chord = CHORDS[Math.floor(step / STEPS_PER_BAR) % CHORDS.length];
  const onBeat = inBar % STEPS_PER_BEAT === 0;

  if (onBeat) kick(musicBus, time);
  if (inBar % STEPS_PER_BEAT === 2) hat(musicBus, time, inBar === 14);
  if (intensity >= 2 && (inBar === 4 || inBar === 12)) snare(musicBus, time);
  if (intensity >= 2 && inBar % 2 === 1) hat(musicBus, time, false);

  // Bass bounces root / octave on 8th notes
  if (inBar % 2 === 0) {
    const note = chord.root + (inBar % 4 === 2 ? 12 : 0);
    tone(musicBus, time, { type: 'sawtooth', from: midiToHz(note), peak: 0.22, decay: 0.2, filter: 700 });
  }

  // Twinkly square-wave arpeggio, the "synth pop" layer
  if (intensity >= 2 && ARP_PATTERN[inBar] >= 0) {
    const note = chord.tones[ARP_PATTERN[inBar]] + 12;
    tone(musicBus, time, { type: 'square', from: midiToHz(note), peak: 0.035, decay: 0.1, filter: 4000 });
  }

  // The sung lead; in fever it also sings an octave up
  if ((intensity >= 3 || fever) && inBar % 2 === 0) {
    const index = (step / 2) % LEAD.length;
    const note = LEAD[index];
    if (note) {
      // Hold each note until the next one (or a rest), up to a beat
      let eighths = 1;
      while (eighths < 2 && !LEAD[(index + eighths) % LEAD.length]) eighths++;
      const length = (60 / bpm / 2) * eighths * 0.95;
      const vowel = index % 4 === 3 ? 'i' : 'a';
      voice(musicBus, time, { note, length, vowel });
      if (fever) voice(musicBus, time, { note: note + 12, length, vowel, peak: 0.25 });
    }
  }
}

function runScheduler() {
  while (nextStepTime < context.currentTime + LOOKAHEAD) {
    if (pendingBpm !== null && nextStep % STEPS_PER_BAR === 0) {
      bpm = pendingBpm;
      pendingBpm = null;
      tempoSegments.push({ time: nextStepTime, beat: nextStep / STEPS_PER_BEAT, bpm });
      if (tempoSegments.length > MAX_SEGMENTS) tempoSegments.shift();
    }
    scheduleStep(nextStep, nextStepTime);
    nextStep++;
    nextStepTime += 60 / bpm / STEPS_PER_BEAT;
  }
}

/**
 * Start the music for a run at `newBpm`; beat 0 lands a moment after this call.
 * With `asMetronome`, play only a click on every beat (for timing calibration).
 */
export function startMusic(newBpm, asMetronome = false) {
  if (!ensureAudio()) return;
  stopMusic();
  context.resume();
  bpm = newBpm;
  pendingBpm = null;
  intensity = 1;
  fever = false;
  metronome = asMetronome;
  musicBus = context.createGain();
  musicBus.gain.value = MUSIC_VOLUME * (asMetronome ? 1 : volumes.music);
  musicBus.connect(master);
  nextStepTime = context.currentTime + START_DELAY;
  nextStep = 0;
  tempoSegments.length = 0;
  tempoSegments.push({ time: nextStepTime, beat: 0, bpm });
  schedulerId = setInterval(runScheduler, SCHEDULE_INTERVAL);
  runScheduler();
}

export function stopMusic() {
  if (schedulerId !== null) clearInterval(schedulerId);
  schedulerId = null;
  if (musicBus) {
    // Fade out instead of clicking off; notes already scheduled die with the bus
    const bus = musicBus;
    bus.gain.setTargetAtTime(0, context.currentTime, 0.05);
    setTimeout(() => bus.disconnect(), 400);
  }
  musicBus = null;
}

// Pausing freezes the audio clock, so the beat picks up exactly where it stopped
export function pauseAudio() {
  if (context && context.state === 'running') context.suspend();
}

export function resumeAudio() {
  if (context && context.state === 'suspended') context.resume();
}

// --- Sound effects -----------------------------------------------------------

const SFX_MIN_GAP = 0.04; // seconds; a shockwave that hits ten enemies plays one hit, not ten
const lastPlayed = {};

function play(callback, name = null) {
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  if (name) {
    if (now - (lastPlayed[name] ?? -1) < SFX_MIN_GAP) return;
    lastPlayed[name] = now;
  }
  callback(now);
}

// Pitch of chord tone `index` in the current bar, so SFX stay in key with the music
function chordTone(index, octave = 1) {
  const now = audibleTime();
  const bar = now === null || tempoSegments.length === 0 ? 0 : Math.max(0, Math.floor(beatAtTime(now) / 4));
  const { tones } = CHORDS[bar % CHORDS.length];
  return midiToHz(tones[index % tones.length] + 12 * octave);
}

export const SFX = {
  hop: () => play((t) => tone(sfxBus, t, { from: 420, to: 680, peak: 0.08, decay: 0.07 })),
  shockwave: () =>
    play((t) => {
      noise(sfxBus, t, { type: 'lowpass', frequency: 2500, sweepTo: 200, peak: 0.5, decay: 0.3 });
      tone(sfxBus, t, { from: 220, to: 55, peak: 0.5, decay: 0.25 });
    }),
  tongue: () => play((t) => tone(sfxBus, t, { type: 'triangle', from: 1100, to: 300, peak: 0.18, decay: 0.08 })),
  spit: () => play((t) => tone(sfxBus, t, { type: 'square', from: 340, to: 140, peak: 0.1, decay: 0.09, filter: 1800 })),
  hit: () => play((t) => tone(sfxBus, t, { type: 'triangle', from: 260, to: 180, peak: 0.18, decay: 0.06 }), 'hit'),
  kill: () =>
    play((t) => {
      tone(sfxBus, t, { type: 'square', from: chordTone(0), peak: 0.07, decay: 0.08, filter: 3000 });
      tone(sfxBus, t + 0.06, { type: 'square', from: chordTone(2), peak: 0.07, decay: 0.12, filter: 3000 });
    }, 'kill'),
  // Rhythm judgements: a bright chime on the chord, so on-beat play adds to the music
  perfect: () =>
    play((t) => {
      tone(sfxBus, t, { from: chordTone(1, 2), peak: 0.12, decay: 0.3 });
      tone(sfxBus, t, { from: chordTone(3, 2), peak: 0.08, decay: 0.3 });
    }),
  great: () => play((t) => tone(sfxBus, t, { from: chordTone(1, 2), peak: 0.08, decay: 0.2 })),
  comboBreak: () => play((t) => tone(sfxBus, t, { type: 'sawtooth', from: 200, to: 120, peak: 0.08, decay: 0.15, filter: 900 })),
  shield: () =>
    play((t) => {
      noise(sfxBus, t, { type: 'bandpass', frequency: 900, sweepTo: 3000, peak: 0.4, decay: 0.4 });
      [0, 1, 2].forEach((i) => tone(sfxBus, t + i * 0.05, { type: 'triangle', from: chordTone(i, 1), peak: 0.15, decay: 0.4 }));
    }),
  levelUp: () =>
    play((t) => {
      [72, 76, 79, 84].forEach((note, i) =>
        tone(sfxBus, t + i * 0.07, { type: 'square', from: midiToHz(note), peak: 0.08, decay: 0.2, filter: 3500 })
      );
    }),
  gameOver: () =>
    play((t) => {
      [64, 60, 57, 52].forEach((note, i) =>
        tone(sfxBus, t + i * 0.16, { type: 'triangle', from: midiToHz(note), peak: 0.22, decay: 0.35 })
      );
    }),
};

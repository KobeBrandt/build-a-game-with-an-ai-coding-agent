// Game modes: presets for the two numbers that shape the enemy pressure
// (see "Customize the difficulty" in the Adding enemies task).
// A high spawn rate with slow enemies feels like a horde; a few fast enemies feel like a hunt.
// `enemyHealth` is each enemy's starting health (see the damage values in Attack.js):
// horde enemies are weak, hunters are tough. `bpm` is the tempo of the run's music (see Rhythm.js).
export const MODES = [
  { key: '1', name: 'Classic', description: 'Balanced pressure', enemySpeed: 40, spawnDelay: 3, maxEnemies: 20, enemyHealth: 10, bpm: 120 },
  { key: '2', name: 'Horde', description: 'Many slow enemies', enemySpeed: 24, spawnDelay: 1.1, maxEnemies: 40, enemyHealth: 6, bpm: 136 },
  { key: '3', name: 'Hunter', description: 'Few fast enemies', enemySpeed: 75, spawnDelay: 6, maxEnemies: 6, enemyHealth: 18, bpm: 104 },
];

const MODE_KEY = 'tode-mode';

// The last mode played is remembered between visits when the browser allows it
function loadMode() {
  try {
    return MODES.find((mode) => mode.key === localStorage.getItem(MODE_KEY)) ?? MODES[0];
  } catch {
    return MODES[0];
  }
}

function saveMode() {
  try {
    localStorage.setItem(MODE_KEY, currentMode.key);
  } catch {
    // Storage blocked (private window etc.): the choice just lasts for this visit
  }
}

let currentMode = loadMode();

export function getMode() {
  return currentMode;
}

export function setModeByKey(key) {
  const mode = MODES.find((candidate) => candidate.key === key);
  if (!mode) return false;
  currentMode = mode;
  saveMode();
  return true;
}

// Step through the modes in menu order, wrapping around at either end
export function cycleMode(step) {
  const index = MODES.indexOf(currentMode);
  currentMode = MODES[(index + step + MODES.length) % MODES.length];
  saveMode();
}

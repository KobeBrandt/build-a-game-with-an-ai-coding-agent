// Game modes: presets for the two numbers that shape the enemy pressure
// (see "Customize the difficulty" in the Adding enemies task).
// A high spawn rate with slow enemies feels like a horde; a few fast enemies feel like a hunt.
export const MODES = [
  { key: '1', name: 'Classic', description: 'Balanced pressure', enemySpeed: 40, spawnDelay: 3, maxEnemies: 20 },
  { key: '2', name: 'Horde', description: 'Many slow enemies', enemySpeed: 24, spawnDelay: 1.1, maxEnemies: 40 },
  { key: '3', name: 'Hunter', description: 'Few fast enemies', enemySpeed: 75, spawnDelay: 6, maxEnemies: 6 },
];

let currentMode = MODES[0];

export function getMode() {
  return currentMode;
}

export function setModeByKey(key) {
  const mode = MODES.find((candidate) => candidate.key === key);
  if (!mode) return false;
  currentMode = mode;
  return true;
}

// In-game upgrades: earn XP during a run, and on every level up pick one of a few random upgrades.
// They only last until the run ends; base upgrades from the shop set the starting stats.

// XP tuning
const XP_PER_KILL = 1;
const XP_PER_SECOND = 0.15;
const FIRST_LEVEL_XP = 3; // XP needed for the first level up
const LEVEL_XP_GROWTH = 2; // extra XP needed for each following level up
const CHOICE_COUNT = 3;

export const RUN_UPGRADES = [
  { id: 'speed', name: 'Swift Hops', description: '+10% hop speed', maxStacks: 5, apply: (s) => { s.playerSpeed *= 1.1; } },
  { id: 'cooldown', name: 'Quick Recharge', description: '-12% attack cooldown', maxStacks: 5, apply: (s) => { s.attackCooldown *= 0.88; } },
  { id: 'radius', name: 'Wider Shockwave', description: '+15% attack reach', maxStacks: 4, apply: (s) => { s.attackRadius *= 1.15; } },
  { id: 'damage', name: 'Heavy Hits', description: '+15% attack damage', maxStacks: 4, apply: (s) => { s.attackDamage *= 1.15; } },
  { id: 'shield', name: 'Shield', description: 'Survive one more hit', maxStacks: 3, apply: (s) => { s.shields += 1; } },
  { id: 'slow', name: 'Sticky Ground', description: '-8% enemy speed', maxStacks: 4, apply: (s) => { s.enemySpeed *= 0.92; } },
  { id: 'xp', name: 'Quick Study', description: '+25% XP', maxStacks: 3, apply: (s) => { s.xpGain *= 1.25; } },
  { id: 'coins', name: 'Golden Touch', description: '+25% coins this run', maxStacks: 3, apply: (s) => { s.coinGain *= 1.25; } },
];

let stats = null;
let stacks = {};
let xp = 0;
let level = 0;
let pendingLevelUps = 0;

const xpToNextLevel = () => FIRST_LEVEL_XP + LEVEL_XP_GROWTH * level;

/**
 * Start a new run from the given base stats (see getBaseStats in Shop.js).
 */
export function resetRun(baseStats) {
  stats = { ...baseStats };
  stacks = {};
  xp = 0;
  level = 0;
  pendingLevelUps = 0;
}

export function getStats() {
  return stats;
}

export function addKillXp(kills) {
  addXp(kills * XP_PER_KILL);
}

export function addSurvivalXp(delta) {
  addXp(delta * XP_PER_SECOND);
}

function addXp(amount) {
  xp += amount * stats.xpGain;
  while (xp >= xpToNextLevel()) {
    xp -= xpToNextLevel();
    level++;
    pendingLevelUps++;
  }
}

/**
 * Share of the way to the next level up, from 0 to 1.
 */
export function getXpProgress() {
  return xp / xpToNextLevel();
}

export function hasPendingLevelUp() {
  return pendingLevelUps > 0;
}

/**
 * Up to CHOICE_COUNT random upgrades that can still be stacked.
 */
export function rollChoices() {
  const available = RUN_UPGRADES.filter((upgrade) => (stacks[upgrade.id] ?? 0) < upgrade.maxStacks);
  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  return available.slice(0, CHOICE_COUNT);
}

export function getStacks(upgrade) {
  return stacks[upgrade.id] ?? 0;
}

/**
 * Apply `upgrade` (or nothing, when every upgrade is maxed) and use up one pending level up.
 */
export function pickUpgrade(upgrade) {
  if (upgrade) {
    upgrade.apply(stats);
    stacks[upgrade.id] = getStacks(upgrade) + 1;
  }
  pendingLevelUps = Math.max(0, pendingLevelUps - 1);
}

/**
 * Use up one shield. Returns false if there was none left.
 */
export function useShield() {
  if (stats.shields <= 0) return false;
  stats.shields--;
  return true;
}

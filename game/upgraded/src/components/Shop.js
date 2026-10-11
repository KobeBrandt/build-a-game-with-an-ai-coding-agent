// Base upgrades: bought with coins in the menu and kept between runs (the "meta" half of the roguelite loop)
const PROGRESS_KEY = 'tode-progress';

// Each level costs `baseCost * (level + 1)` coins
export const BASE_UPGRADES = [
  { id: 'speed', name: 'Swift Legs', description: '+6% hop speed', maxLevel: 5, baseCost: 40 },
  { id: 'cooldown', name: 'Quick Recovery', description: '-6% attack cooldown', maxLevel: 5, baseCost: 40 },
  { id: 'radius', name: 'Big Shockwave', description: '+8% attack reach', maxLevel: 5, baseCost: 50 },
  { id: 'shield', name: 'Extra Life', description: 'Start each run with +1 shield', maxLevel: 2, baseCost: 150 },
  { id: 'xp', name: 'Fast Learner', description: '+15% XP', maxLevel: 5, baseCost: 30 },
  { id: 'coins', name: 'Treasure Hunter', description: '+20% coins', maxLevel: 5, baseCost: 30 },
];

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY));
    return { coins: saved?.coins ?? 0, levels: saved?.levels ?? {} };
  } catch {
    return { coins: 0, levels: {} };
  }
}

const progress = loadProgress();

function saveProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // Storage blocked (private window etc.): coins and upgrades just last for this visit
  }
}

export function getCoins() {
  return progress.coins;
}

export function addCoins(amount) {
  progress.coins += amount;
  saveProgress();
}

export function getUpgradeLevel(upgrade) {
  return progress.levels[upgrade.id] ?? 0;
}

export function isMaxed(upgrade) {
  return getUpgradeLevel(upgrade) >= upgrade.maxLevel;
}

export function getUpgradeCost(upgrade) {
  return upgrade.baseCost * (getUpgradeLevel(upgrade) + 1);
}

/**
 * Spend coins on the next level of `upgrade`. Returns true if it was bought.
 */
export function buyUpgrade(upgrade) {
  const cost = getUpgradeCost(upgrade);
  if (isMaxed(upgrade) || progress.coins < cost) return false;

  progress.coins -= cost;
  progress.levels[upgrade.id] = getUpgradeLevel(upgrade) + 1;
  saveProgress();
  return true;
}

/**
 * Starting stats for a run, as multipliers on the base values (plus a shield count).
 */
export function getBaseStats() {
  const level = (id) => progress.levels[id] ?? 0;
  return {
    playerSpeed: 1 + 0.06 * level('speed'),
    attackCooldown: 1 - 0.06 * level('cooldown'),
    attackRadius: 1 + 0.08 * level('radius'),
    enemySpeed: 1,
    shields: level('shield'),
    xpGain: 1 + 0.15 * level('xp'),
    coinGain: 1 + 0.2 * level('coins'),
  };
}

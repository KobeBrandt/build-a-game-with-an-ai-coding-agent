// Difficulty tuning
const DIFFICULTY_GROWTH_RATE = 0.005; // difficulty factor gained per score point (score 100 → factor 0.5)

// How strongly each side reacts to the difficulty factor.
// Enemies scale faster than the player so the hero never outgrows the threat.
const ENEMY_SCALING = 1;
const PLAYER_SCALING = 0.6;

// Limits so the game stays playable at very high scores
const MIN_SPAWN_DELAY_MULTIPLIER = 0.2;
const MIN_ATTACK_COOLDOWN_MULTIPLIER = 0.3;
const MAX_ATTACK_RADIUS_MULTIPLIER = 1.5;

/**
 * Multipliers applied to each system's base values, scaled linearly with the score.
 */
export function getDifficulty(score) {
  const factor = score * DIFFICULTY_GROWTH_RATE;
  const enemyGrowth = factor * ENEMY_SCALING;
  const playerGrowth = factor * PLAYER_SCALING;

  return {
    enemySpeed: 1 + enemyGrowth,
    enemySpawnDelay: Math.max(MIN_SPAWN_DELAY_MULTIPLIER, 1 - enemyGrowth),
    playerSpeed: 1 + playerGrowth,
    attackCooldown: Math.max(MIN_ATTACK_COOLDOWN_MULTIPLIER, 1 - playerGrowth),
    attackRadius: Math.min(MAX_ATTACK_RADIUS_MULTIPLIER, 1 + playerGrowth),
  };
}

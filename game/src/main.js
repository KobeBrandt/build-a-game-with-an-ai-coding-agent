import * as THREE from 'three';
import './style.css';
import { player, resetPlayer, setPlayerSpeed, updatePlayer } from './components/Player.js';
import { Camera } from './components/Camera.js';
import { Renderer } from './components/Renderer.js';
import { enemies, resetEnemies, setEnemyDifficulty, updateEnemies } from './components/Enemy.js';
import { resetAttack, setAttackDifficulty, updateAttack } from './components/Attack.js';
import { addKills, getScore, resetScore, stopScore, updateScore } from './components/Score.js';
import { getDifficulty } from './components/Difficulty.js';
import { isTouching } from './components/Collision.js';
import { GameMap, updateMap } from './components/Map.js';

const scene = new THREE.Scene();

const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(-100, -100, 200);
scene.add(directionalLight);

const map = GameMap();
scene.add(map);

scene.add(player);

const camera = Camera();
player.add(camera);

const renderer = Renderer();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const gameOverElement = document.createElement('div');
gameOverElement.className = 'game-over';
gameOverElement.hidden = true;
gameOverElement.innerHTML = `
  <h1>Game Over</h1>
  <p>Press <kbd>Space</kbd> to play again</p>
`;
document.body.appendChild(gameOverElement);

let isGameOver = false;

function gameOver() {
  isGameOver = true;
  player.visible = false;
  stopScore();
  gameOverElement.hidden = false;
}

function resetGame() {
  resetPlayer();
  resetEnemies(scene);
  resetAttack();
  resetScore();
  player.visible = true;
  gameOverElement.hidden = true;
  isGameOver = false;
}

// Registered after Attack.js, so this runs after its Space handler; resetAttack drops that press
window.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && !event.repeat && isGameOver) resetGame();
});

const playerTouchesEnemy = () =>
  enemies.some((enemy) =>
    isTouching(player.position.x, player.position.y, player.userData.radius, enemy)
  );

function applyDifficulty(score) {
  const difficulty = getDifficulty(score);
  setEnemyDifficulty(difficulty.enemySpeed, difficulty.enemySpawnDelay);
  setPlayerSpeed(difficulty.playerSpeed);
  setAttackDifficulty(difficulty.attackCooldown, difficulty.attackRadius);
}

const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();

  if (!isGameOver) {
    applyDifficulty(getScore());

    const playerHit = updatePlayer(delta);
    const enemyHit = playerHit || updateEnemies(scene, delta, player);
    if (enemyHit || playerTouchesEnemy()) {
      gameOver();
    } else {
      addKills(updateAttack(scene, delta, player, enemies));
      updateScore();
    }
  }

  updateMap(map, player.position);

  renderer.render(scene, camera);
});

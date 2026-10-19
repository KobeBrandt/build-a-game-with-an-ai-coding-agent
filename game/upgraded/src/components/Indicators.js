import * as THREE from 'three';

// Arrows on the edge of the screen pointing at enemies that are outside the view, so the player
// can see a threat coming instead of being caught by an enemy they never saw.
// Closer enemies get bigger, more solid arrows; hoppers get pink ones, like their danger rings.

const MAX_ARROWS = 12; // only the closest off-screen enemies get an arrow
const EDGE_MARGIN = 26; // px between an arrow and the edge of the screen
const NEAR_DISTANCE = 150; // world units: an enemy this close gets the biggest arrow
const FAR_DISTANCE = 600; // world units: an enemy this far gets the smallest arrow

const layer = document.createElement('div');
layer.className = 'enemy-arrows';
layer.setAttribute('aria-hidden', 'true');
document.body.appendChild(layer);

const arrows = [];
for (let i = 0; i < MAX_ARROWS; i++) {
  const arrow = document.createElement('div');
  arrow.className = 'enemy-arrow';
  arrow.hidden = true;
  layer.appendChild(arrow);
  arrows.push(arrow);
}

const projected = new THREE.Vector3();
const offScreen = []; // { enemy, distance, x, y } for this frame, reused

/**
 * Point arrows at the enemies outside the view. `visible` is false outside a run.
 */
export function updateEnemyArrows(visible, enemies, player, camera) {
  offScreen.length = 0;
  if (visible) {
    const halfWidth = window.innerWidth / 2;
    const halfHeight = window.innerHeight / 2;
    for (const enemy of enemies) {
      projected.copy(enemy.position).project(camera);
      // Behind the camera the projection is mirrored
      const behind = projected.z > 1;
      const x = (behind ? -projected.x : projected.x) * halfWidth;
      const y = (behind ? projected.y : -projected.y) * halfHeight;
      if (!behind && Math.abs(x) <= halfWidth && Math.abs(y) <= halfHeight) continue;
      const distance = Math.hypot(enemy.position.x - player.position.x, enemy.position.y - player.position.y);
      offScreen.push({ enemy, distance, x, y });
    }
    offScreen.sort((a, b) => a.distance - b.distance);
  }

  const limitX = window.innerWidth / 2 - EDGE_MARGIN;
  const limitY = window.innerHeight / 2 - EDGE_MARGIN;
  arrows.forEach((arrow, i) => {
    const entry = offScreen[i];
    arrow.hidden = !entry;
    if (!entry) return;

    // Slide the point along the line from the screen centre until it sits on the margin
    const fit = Math.min(limitX / Math.abs(entry.x || 1e-6), limitY / Math.abs(entry.y || 1e-6));
    const x = window.innerWidth / 2 + entry.x * fit;
    const y = window.innerHeight / 2 + entry.y * fit;
    const angle = Math.atan2(entry.y, entry.x);
    const closeness = 1 - Math.min(1, Math.max(0, (entry.distance - NEAR_DISTANCE) / (FAR_DISTANCE - NEAR_DISTANCE)));

    arrow.classList.toggle('hopper', Boolean(entry.enemy.userData.hopper));
    arrow.style.opacity = String(0.45 + 0.55 * closeness);
    arrow.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${angle}rad) scale(${0.7 + 0.6 * closeness})`;
  });
}

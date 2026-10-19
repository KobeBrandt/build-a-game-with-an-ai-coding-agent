import * as THREE from 'three';

export function Camera() {
  const camera = new THREE.PerspectiveCamera(
    30,
    window.innerWidth / window.innerHeight,
    1,
    9000
  );
  // Steep enough that houses and trees rarely hide Tode, low enough to still see the world in 3D
  camera.position.set(230, -230, 400);
  camera.up.set(0, 0, 1);
  camera.lookAt(0, 0, 0);

  return camera;
}

// On-screen touch controls: a D-pad for hops, an attack button and a pause button.
// Each button sends the same key events the keyboard does, at the moment the finger goes down,
// so hops and attacks are judged against the beat exactly like key presses.
// They show on touch screens (coarse pointer), or as soon as the screen is touched.

const BUTTONS = [
  { code: 'ArrowUp', label: 'Hop up', className: 'touch-up', text: '▲' },
  { code: 'ArrowLeft', label: 'Hop left', className: 'touch-left', text: '◀' },
  { code: 'ArrowRight', label: 'Hop right', className: 'touch-right', text: '▶' },
  { code: 'ArrowDown', label: 'Hop down', className: 'touch-down', text: '▼' },
  { code: 'Space', label: 'Attack', className: 'touch-attack', text: 'Attack' },
  { code: 'KeyP', label: 'Pause', className: 'touch-pause', text: 'II' },
];

const controls = document.createElement('div');
controls.className = 'touch-controls';
controls.hidden = true;
for (const { code, label, className, text } of BUTTONS) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.dataset.code = code;
  button.setAttribute('aria-label', label);
  // Touch only: keyboard users already have the keys, so the buttons stay out of the Tab order
  button.tabIndex = -1;
  button.textContent = text;
  controls.appendChild(button);
}
document.body.appendChild(controls);

let touchSeen = window.matchMedia('(pointer: coarse)').matches;
window.addEventListener('touchstart', () => {
  touchSeen = true;
}, { once: true, passive: true });

const send = (type, code) => window.dispatchEvent(new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code }));

// Buttons held down, so a finger sliding off still releases its key
const held = new Map(); // pointerId -> code

controls.addEventListener('pointerdown', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  event.preventDefault();
  button.setPointerCapture(event.pointerId);
  held.set(event.pointerId, button.dataset.code);
  button.classList.add('pressed');
  send('keydown', button.dataset.code);
});

function release(event) {
  const code = held.get(event.pointerId);
  if (code === undefined) return;
  held.delete(event.pointerId);
  controls.querySelector(`[data-code="${code}"]`)?.classList.remove('pressed');
  send('keyup', code);
}

controls.addEventListener('pointerup', release);
controls.addEventListener('pointercancel', release);
// No long-press menu or double-tap zoom on the controls
controls.addEventListener('contextmenu', (event) => event.preventDefault());

/**
 * Show the controls during a run on touch screens. `autoAttack` hides the attack button
 * (the Tongue fires on its own).
 */
export function updateTouchControls(playing, autoAttack) {
  controls.hidden = !(playing && touchSeen);
  document.body.classList.toggle('touch', touchSeen);
  controls.querySelector('.touch-attack').hidden = autoAttack;
}

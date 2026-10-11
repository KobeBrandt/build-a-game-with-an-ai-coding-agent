# Tode's Escape — upgraded

A copy of the course game with the "customize it your way" ideas from each course task built in.
The original game in `game/src` is unchanged.

## Run it

From the `game` directory:

```bash
npm run dev:upgraded
```

This starts the normal Vite dev server and opens `/upgraded/`. The upgraded game shares
`game/public` (models) and `game/node_modules` with the original game.

## Upgrades by course task

| Course task | Upgrade | Where |
| --- | --- | --- |
| Scene setup | Real shadows: the sun follows Tode, and all models and scenery cast shadows | `src/main.js`, `components/Renderer.js` |
| Player movement | Squash-and-stretch on every hop | `components/Player.js` |
| Adding enemies | Three game modes that tune spawn delay, speed and enemy cap: Classic, Horde (many slow enemies), Hunter (few fast enemies) | `components/Modes.js`, `components/Enemy.js` |
| Adding enemies | Enemies pop into the world when they spawn | `components/Enemy.js` |
| Attack | Expanding shockwave ring on top of the fading circle | `components/Attack.js` |
| Attack | Defeated enemies spin, rise and shrink away instead of vanishing | `components/Enemy.js` |
| Attack | Cooldown meter at the bottom of the screen | `src/main.js`, `src/style.css` |
| Score | Best score per mode, saved in the browser | `components/Score.js` |
| Score | Score "pops" on every kill | `components/Score.js`, `src/style.css` |
| Start, play, game over | Start screen with mode select and controls | `src/main.js` |
| Start, play, game over | Pause with `P` or `Esc`, and auto-pause when the tab is hidden | `src/main.js` |
| Start, play, game over | Game over screen shows the final score and "New high score!" | `src/main.js` |
| Increasing complexity | Mode and level indicator in the top-right corner | `components/Difficulty.js`, `src/main.js` |
| Game world | Grassy texture painted over the checkerboard | `components/Map.js` |
| Game world | Trees and rocks built from simple shapes, which block movement like houses | `components/Scenery.js`, `components/Map.js` |

## Controls

- Arrow keys: hop
- `Space`: attack, start, or play again
- `1` / `2` / `3`: choose a mode on the start and game over screens
- `P` or `Esc`: pause

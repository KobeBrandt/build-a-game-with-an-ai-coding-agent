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
| Roguelite | Coins earned each run (the score times the coin bonus) buy permanent base upgrades in the menu shop. See [Base upgrades](#base-upgrades-shop) | `components/Shop.js`, `src/main.js` |
| Roguelite | XP from kills and survival; every level up pauses the run to pick 1 of 3 random in-game upgrades that last until game over. See [In-game upgrades](#in-game-upgrades-level-up) | `components/RunUpgrades.js`, `src/main.js` |
| Roguelite | Shields absorb a hit and knock out nearby enemies; XP bar and shield count in the top-left corner | `src/main.js`, `src/style.css` |
| Controls | WASD as well as the arrow keys; `A`/`D` change the mode in the menu | `components/Player.js`, `src/main.js` |
| Accessibility | WCAG 2.2 and Game Accessibility Guidelines pass over the menus and HUD. See [Accessibility](#accessibility) | `index.html`, `src/main.js`, `src/style.css` |

## Base upgrades (shop)

Bought with coins from the start or game over screen (`U`, or the **Upgrades** button). They are permanent:
coins and levels are saved in the browser (`localStorage` key `tode-progress`) and set the starting stats of every run.

Each level costs `base cost × (current level + 1)` coins, so the first level costs the base cost, the second costs twice that, and so on.

| Upgrade | Effect per level | Max level | Base cost | Cost per level | Total to max |
| --- | --- | --- | --- | --- | --- |
| Swift Legs | +6% hop speed | 5 | 40 | 40, 80, 120, 160, 200 | 600 |
| Quick Recovery | -6% attack cooldown | 5 | 40 | 40, 80, 120, 160, 200 | 600 |
| Big Shockwave | +8% attack reach | 5 | 50 | 50, 100, 150, 200, 250 | 750 |
| Extra Life | Start each run with +1 shield | 2 | 150 | 150, 300 | 450 |
| Fast Learner | +15% XP | 5 | 30 | 30, 60, 90, 120, 150 | 450 |
| Treasure Hunter | +20% coins | 5 | 30 | 30, 60, 90, 120, 150 | 450 |

Base bonuses add up linearly: for example Swift Legs at level 5 is +30% hop speed.
Coins earned at game over are `floor(score × coin bonus)`.

## In-game upgrades (level up)

During a run, XP comes from kills (1 XP each) and from surviving (0.15 XP per second), both multiplied by the XP bonus.
The first level up needs 3 XP, and each one after that needs 2 more than the last (3, 5, 7, 9, ...).

Each level up pauses the game and offers 3 random upgrades that aren't maxed yet. Pick one with `1`/`2`/`3`,
`A`/`D` and `Space`, `Tab` and `Enter`, or a click. They stack on top of the base upgrades and are lost at game over.
If every upgrade is maxed, a **Continue** button appears instead.

| Upgrade | Effect per pick | Max picks |
| --- | --- | --- |
| Swift Hops | +10% hop speed | 5 |
| Quick Recharge | -12% attack cooldown | 5 |
| Wider Shockwave | +15% attack reach | 4 |
| Shield | Survive one more hit | 3 |
| Sticky Ground | -8% enemy speed | 4 |
| Quick Study | +25% XP | 3 |
| Golden Touch | +25% coins this run | 3 |

In-game upgrades multiply: for example two Swift Hops picks give `1.1 × 1.1` = +21% hop speed.

## Accessibility

Built against WCAG 2.2 AA and the basic tier of the [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/).

| Upgrade | WCAG criteria | Where |
| --- | --- | --- |
| Every menu choice (modes, Start, Play again, Upgrades, shop cards, Back, level-up cards, Resume, Continue) is a real `<button>`, so it works with Tab, Enter, mouse, touch and screen readers | 2.1.1 Keyboard, 4.1.2 Name, Role, Value | `src/main.js` |
| Each screen moves focus to the current choice; Tab moves the selection with the focus; Space or Enter on a focused button presses only that button | 2.4.3 Focus Order | `src/main.js` |
| Thick white focus ring (3px, offset 3px) on keyboard focus | 2.4.7 Focus Visible, 2.4.11 Focus Not Obscured | `src/style.css` |
| Mouse users can start, play again and resume (before, only the keyboard could) | 2.1.1 Keyboard, 2.5 Input Modalities | `src/main.js` |
| The 3D canvas is hidden from screen readers; the menu overlay is a dialog labelled by its title | 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value | `index.html`, `src/main.js` |
| A polite live region reads out mode changes, purchases, shields used, new difficulty levels and the game over score | 4.1.3 Status Messages | `src/main.js` |
| With the system's reduced-motion setting on, the score pop, high score pulse, XP bar easing and shield flash are turned off | 2.3.3 Animation from Interactions | `src/style.css` |
| "New high score!" pulses 4 times and stops, instead of looping forever | 2.2.2 Pause, Stop, Hide | `src/style.css` |
| The selected mode has a tick (✓) as well as a gold border; unaffordable upgrades say "(need N more)" instead of only turning red | 1.4.1 Use of Color | `src/main.js`, `src/style.css` |
| Upgrade levels and pick counts have hidden text for screen readers (the pips are hidden) | 1.1.1 Non-text Content | `src/main.js` |
| Font sizes in `rem`, no text smaller than 14px, title scales down on narrow screens, the overlay scrolls when zoomed in | 1.4.4 Resize Text, 1.4.10 Reflow | `src/style.css` |
| Pause with `P`/`Esc` or the **Resume** button, auto-pause when the tab is hidden; keys pressed while paused don't carry into the game | 2.2.2 Pause, Stop, Hide | `src/main.js` |

Not done yet: adjustable game speed, key remapping and on-screen touch controls.

## Controls

- `W` `A` `S` `D` or arrow keys: hop
- `Space`: attack, start, or play again
- `1` / `2` / `3`, or `A` / `D`: choose a mode on the start and game over screens
- `U`: open the upgrade shop from the start and game over screens (`W`/`S` choose, `Space` or `Enter` buy, `U`/`Esc` back)
- Level up: `1` / `2` / `3`, or `A`/`D` and `Space`, or click a card
- `P` or `Esc`: pause and resume
- `Tab` / `Shift+Tab`: move between buttons on any menu screen; `Enter` or `Space` presses the focused button

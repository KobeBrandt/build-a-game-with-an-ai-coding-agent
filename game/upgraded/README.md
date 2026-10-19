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

## Deploy to GitHub Pages

From the `game` directory:

```bash
npm run build:upgraded
```

This builds a static copy of the upgraded game into `game/dist-upgraded` (git-ignored), using
`upgraded/vite.config.js`. The build uses a relative base (`./`), and the game loads its models and
images through `import.meta.env.BASE_URL`, so the site works under any path, such as
`https://<user>.github.io/<repo>/`. Check the build locally with `npm run preview:upgraded`.

The workflow [`.github/workflows/deploy-upgraded.yml`](../../.github/workflows/deploy-upgraded.yml)
runs this build and publishes `game/dist-upgraded` on every push to `main` (or by hand from the
Actions tab). To turn it on once, set **Settings > Pages > Source** to **GitHub Actions**.

## Upgrades by course task

| Course task | Upgrade | Where |
| --- | --- | --- |
| Scene setup | Real shadows: the sun follows Tode, and all models and scenery cast shadows | `src/main.js`, `components/Renderer.js` |
| Player movement | Squash-and-stretch on every hop | `components/Player.js` |
| Adding enemies | Three game modes that tune spawn delay, speed and enemy cap: Classic, Horde (many slow enemies), Hunter (few fast enemies) | `components/Modes.js`, `components/Enemy.js` |
| Adding enemies | Enemies pop into the world when they spawn | `components/Enemy.js` |
| Adding enemies | Enemies spawn in a random direction just outside the view (300 units from Tode), so the first one arrives within seconds and spawns can't be predicted | `components/Enemy.js` |
| Adding enemies | Readable enemies: drawn 1.3× bigger than their collision body (a forgiving hitbox), on a red danger ring (pink for hoppers) | `components/Enemy.js`, `src/main.js` |
| Adding enemies | Arrows on the screen edge point at the 12 closest enemies outside the view; closer enemies get bigger, more solid arrows | `components/Indicators.js`, `src/style.css` |
| Attack | Expanding shockwave ring on top of the fading circle | `components/Attack.js` |
| Attack | Defeated enemies spin, rise and shrink away instead of vanishing | `components/Enemy.js` |
| Attack | Cooldown meter at the bottom of the screen, labelled with the chosen attack | `src/main.js`, `src/style.css` |
| Attack | Three attacks to choose from on the start and game over screens: Shockwave, Tongue (fires on its own) and Spit. See [Attacks](#attacks) | `components/Attack.js`, `components/Player.js`, `src/main.js` |
| Attack | Enemy health and balanced damage per attack: enemies take several hits, show a health bar once hurt, squash and get knocked back when hit. See [Enemy health and damage](#enemy-health-and-damage) | `components/Enemy.js`, `components/Attack.js`, `components/Modes.js`, `components/Difficulty.js` |
| Score | Best score per mode and attack, saved in the browser (each attack plays at its own tempo, so scores are only compared within one attack; older per-mode bests carry over to every attack) | `components/Score.js` |
| Score | Score "pops" on every kill | `components/Score.js`, `src/style.css` |
| Start, play, game over | Start screen with mode select and controls | `src/main.js` |
| Start, play, game over | Pause with `P` or `Esc`, and auto-pause when the tab is hidden or the window loses focus | `src/main.js` |
| Start, play, game over | Game over screen shows the final score, kills, time survived and "New high score!" | `src/main.js`, `components/Score.js` |
| Start, play, game over | The level-up and game over screens ignore input for 0.6 s after they open, so a Space press meant as an attack can't pick an upgrade or restart the run unseen | `src/main.js`, `src/style.css` |
| Start, play, game over | Start and Play again stay greyed out ("Loading…") until Tode, the enemy and the house models have loaded | `src/main.js`, `components/Player.js`, `components/Enemy.js`, `src/style.css` |
| Start, play, game over | The chosen mode and attack are remembered between visits | `components/Modes.js`, `components/Attack.js` |
| Increasing complexity | Mode and level indicator in the top-right corner | `components/Difficulty.js`, `src/main.js` |
| Increasing complexity | Difficulty grows with the time survived (one level every 20 seconds), not the score, so kills and combos never make the run harder | `components/Difficulty.js`, `src/main.js` |
| Game world | Grassy texture painted over the checkerboard | `components/Map.js` |
| Game world | Trees and rocks built from simple shapes, which block movement like houses | `components/Scenery.js`, `components/Map.js` |
| Game world | A steeper camera, and houses, trees and rocks between the camera and Tode turn see-through, so they never hide Tode or an enemy | `components/Camera.js`, `components/Map.js` |
| Roguelite | Coins earned each run (the score times the coin bonus) buy permanent base upgrades in the menu shop. See [Base upgrades](#base-upgrades-shop) | `components/Shop.js`, `src/main.js` |
| Roguelite | XP from kills and survival; every level up pauses the run to pick 1 of 3 random in-game upgrades that last until game over. See [In-game upgrades](#in-game-upgrades-level-up) | `components/RunUpgrades.js`, `src/main.js` |
| Roguelite | Shields absorb a hit and knock out nearby enemies; XP bar and shield count in the top-left corner | `src/main.js`, `src/style.css` |
| Controls | WASD as well as the arrow keys; `A`/`D` change the mode in the menu | `components/Player.js`, `src/main.js` |
| UI | Menus and HUD in the game world's style: checkerboard grass panel, white wall blocks with dark green sides, red roof buttons and a light sky haze over the world. See [Game-world UI](#game-world-ui) | `index.html`, `src/main.js`, `src/style.css` |
| Accessibility | WCAG 2.2 and Game Accessibility Guidelines pass over the menus and HUD. See [Accessibility](#accessibility) | `index.html`, `src/main.js`, `src/style.css` |
| Rhythm | Synthesised music and sound effects, and a beat system: hops and attacks on the beat build a combo that multiplies kill points, and on-beat attacks hit harder. See [Rhythm and sound](#rhythm-and-sound) | `components/Audio.js`, `components/Rhythm.js`, `components/Attack.js`, `src/main.js`, `src/style.css` |
| Deploy | Static GitHub Pages build that works under any repository path. See [Deploy to GitHub Pages](#deploy-to-github-pages) | `vite.config.js`, `../package.json`, `../../.github/workflows/deploy-upgraded.yml`, `components/Enemy.js`, `components/House.js`, `components/Player.js`, `src/main.js` |

## Attacks

Pick an attack on the start or game over screen with `Q`/`E`, a click, or `Tab` and `Enter`.
The choice is saved in the browser (`localStorage` key `tode-attack`), like the chosen mode (`tode-mode`).

| Attack | How it fires | Base cooldown | Base damage | Base reach | What it hits |
| --- | --- | --- | --- | --- | --- |
| Shockwave | `Space` | 1 s | 10 | 60 around Tode | Every enemy in the circle |
| Tongue | Automatically, as soon as an enemy is in reach | 0.55 s | 6 | 120 to the enemy's edge | The nearest enemy, one per lash |
| Spit | `Space` | 0.7 s | 7 | Flies 320 in the direction of Tode's last hop | Every enemy the glob touches, once each (it pierces); pops on houses |

The cooldown, reach and damage upgrades (shop, level-up and difficulty scaling) apply to every attack:
cooldown upgrades shorten each attack's own cooldown, reach upgrades grow the Shockwave circle,
the Tongue's reach, and Spit's range and glob size (a bigger glob also pops on houses sooner), and damage upgrades raise each attack's own damage.

## Enemy health and damage

Enemies no longer fall to any single hit. Each enemy spawns with health set by the game mode,
and every attack deals its own damage (see [Attacks](#attacks)). A hit that doesn't defeat an enemy:

- shows a red health bar above it (hidden until the first hit),
- squashes it flat for a moment,
- knocks it back 14 units, away from Tode (Shockwave, Tongue) or along the glob's path (Spit), unless a house or another body is in the way.

Only defeated enemies count as kills for the score and XP. Shields still knock out every enemy close to Tode, whatever its health.

### Enemy health per mode

| Mode | Base health | Shockwave hits | Tongue lashes | Spit hits |
| --- | --- | --- | --- | --- |
| Classic | 10 | 1 | 2 | 2 |
| Horde | 6 | 1 | 1 | 1 |
| Hunter | 18 | 2 | 3 | 3 |

Hits needed are for a fresh enemy at level 1 with no damage upgrades.

### How the damage is balanced

Each attack's damage is set against how it hits, so no attack is best everywhere:

- **Shockwave** is the slowest, has the shortest reach and only hits when enemies are close, but it hits every enemy around Tode. It hits hardest, so it one-shots a fresh Classic or Horde enemy.
- **Tongue** aims and fires on its own, but at one enemy per lash. It hits softest and most often (about 11 damage per second on one target).
- **Spit** pierces a whole line of enemies but has to be aimed by hopping. It sits in between (10 damage per second, on every enemy in the line).

### Health scaling

Enemy health grows with the difficulty factor (`seconds survived × 0.005`) at half the rate of enemy speed:
health multiplier = `1 + factor × 0.5`, capped at 3×. So after 100 seconds new enemies have 1.25× health
(Classic: 13, so the Shockwave now needs 2 hits). The health is rounded and fixed when an enemy spawns.
Attack damage does not grow with difficulty; the damage upgrades below are how you keep up.

## Base upgrades (shop)

Bought with coins from the start or game over screen (`U`, or the **Upgrades** button). They are permanent:
coins and levels are saved in the browser (`localStorage` key `tode-progress`) and set the starting stats of every run.

Each level costs `base cost × (current level + 1)` coins, so the first level costs the base cost, the second costs twice that, and so on.

| Upgrade | Effect per level | Max level | Base cost | Cost per level | Total to max |
| --- | --- | --- | --- | --- | --- |
| Swift Legs | +6% hop speed | 5 | 40 | 40, 80, 120, 160, 200 | 600 |
| Quick Recovery | -6% attack cooldown | 5 | 40 | 40, 80, 120, 160, 200 | 600 |
| Long Reach | +8% attack reach | 5 | 50 | 50, 100, 150, 200, 250 | 750 |
| Strong Jaw | +10% attack damage | 5 | 50 | 50, 100, 150, 200, 250 | 750 |
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
| Longer Reach | +15% attack reach | 4 |
| Heavy Hits | +15% attack damage | 4 |
| Shield | Survive one more hit | 3 |
| Sticky Ground | -8% enemy speed | 4 |
| Quick Study | +25% XP | 3 |
| Golden Touch | +25% coins this run | 3 |

In-game upgrades multiply: for example two Swift Hops picks give `1.1 × 1.1` = +21% hop speed.

## Rhythm and sound

Every run plays a synthesised synth-pop loop (Am, F, C, G) made with the Web Audio API, so there are no sound files.
More layers join the music as the level rises: drums and bass at level 1, snare and arpeggio from level 2, a lead melody from level 4.
The beat clock is the audio clock itself, so what you see and what you hear stay in time, and pausing freezes both.

### The beat follows the attack

The tempo comes from the chosen attack's cooldown, and the cooldown is measured in beats:

- The tempo is set so the cooldown is a whole power-of-two number of beats (1, 2, 4...), between 80 and 160 BPM.
  An attack fired on the beat is ready again exactly on a later beat, so you can keep attacking on the beat.
- The cooldown upgrades (shop and level up) and the difficulty shorten the cooldown, so they speed the music up.
  A new tempo starts on the next bar. When it would pass 160 BPM it drops to half time (80 BPM), and the cooldown is then half as many beats.
- Shockwave and Spit cooldowns last at least 1 beat. When even that would need more than 160 BPM, the tempo stays at 160 and the cooldown at 1 beat.
  The Tongue fires on its own, on 16th notes, so its cooldown can go down to a 16th note.
- When an attack fires on the beat, its cooldown counts from that beat, not from the key press.
  A press up to 0.12 s before the cooldown ends is kept and fires the moment the attack is ready, so an early press that is still on the beat isn't lost.
- On the beat track, tall teal markers show the beats the attack will be ready on.

| Attack | Base cooldown | Starting tempo | Cooldown in beats |
| --- | --- | --- | --- |
| Shockwave | 1 s | 120 BPM | 2 |
| Spit | 0.7 s | 86 BPM | 1 |
| Tongue | 0.55 s | 109 BPM | 1 |

Without audio (no Web Audio support), the cooldowns are the plain seconds and there is no beat.

### Judging and combo

| Element | What it does |
| --- | --- |
| Beat track | Bottom of the screen, above the attack meter: markers slide in from both sides and meet in the target on every beat. It also shows the current tempo |
| Beat ring | A teal ring under Tode pulses on every beat; enemies bob to the beat (not with reduced motion) |
| Judgement | Each hop key press and each Shockwave or Spit is judged against the nearest beat: **Perfect** (within 45 ms), **Great** (within 90 ms) or **Off beat** |
| Combo | Perfect and Great add 1 (once per beat, so pressing every key on one beat doesn't pad it). Off beat resets it. It also fades after 8 beats of play without an on-beat press |
| Combo bonus | Kill points × (1 + 0.05 per combo), up to ×2 at combo 20 |
| On-beat damage | A Perfect attack deals ×1.4 damage, a Great one ×1.2. A Shockwave on the beat turns teal |
| Sound effects | Hop, each attack, hit, kill, shield, level up, game over and judgement chimes; the chimes and kill blips use the notes of the current chord |
| Game over | Shows the best combo and number of Perfects |

### Feel and extras

| Feature | What it does | Where |
| --- | --- | --- |
| Hops on the beat grid | A hop lasts a whole number of 1/8 beats, so a hop started on the beat lands on the music's grid. At 120 BPM the base hop (0.25 s) is exactly half a beat; hop speed upgrades step by 1/8 beat | `components/Player.js`, `components/Rhythm.js` |
| Tode dances | Tode bounces a little on every beat while standing still, and squashes on landing (not with reduced motion) | `components/Player.js` |
| Hoppers | Pink enemies that only move on the beat: they crouch just before it (the tell), then hop toward Tode. A hop covers a beat's worth of walking, so they average the same speed as walkers. None at level 1, then 10% of new enemies per level, up to 40% | `components/Enemy.js`, `src/main.js` |
| Spawns on the beat | Regular spawns wait for the next beat | `components/Enemy.js` |
| Loop waves | Each time the 4-bar loop starts again, a small wave spawns around Tode (Classic 1, Horde 3, Hunter 0, plus 1 for every 2 levels after the first), within the mode's enemy cap | `src/main.js`, `components/Enemy.js` |
| The drop | The first time the lead comes in (level 4), a big wave spawns (Classic 4, Horde 8, Hunter 2) with a "Drop!" banner | `src/main.js` |
| Fever | At combo 20 the music sings an octave-up double, the screen glows teal and Tode leaves a teal trail. The bonuses don't change | `components/Rhythm.js`, `components/Audio.js`, `src/main.js` |
| Sung lead | The lead melody (level 4 and fever) is a voice synth: a sawtooth through three vowel formant filters with vibrato, singing "la" and "li" | `components/Audio.js` |
| Hit feedback | Damage numbers float up from every hit (kills bigger and red); kills burst into cubes (pink for hoppers); a Perfect attack freezes the game for 0.05 s; kills, Perfect attacks, shields and the drop shake the camera (not with reduced motion) | `components/Effects.js`, `src/main.js` |
| Attack meter | Turns ready as soon as a press would fire (the last 0.12 s of the cooldown keeps the press), instead of flickering on only on the beat | `components/Attack.js`, `src/main.js` |

### Sound and timing settings

Open with `O` or **Sound & timing** on the start and game over screens.

- **Music** and **Sound effects** volume sliders (saved in `localStorage` key `tode-volume`).
- **Timing offset**: Bluetooth headphones and some screens delay the sound by 100 to 250 ms, more than the Great window.
  Press **Start tapping** and tap `Space`, `T` or the **Tap** button along with the clicks (100 BPM). After 8 taps,
  **Use** saves the median delay (`localStorage` key `tode-audio-offset`), and every judgement subtracts it.
  Mouse and finger taps are timed when they go down, not when the click ends. **Reset to 0** clears it.

### Touch controls

On touch screens (or once the screen is touched) a D-pad, an attack button and a pause button show during a run.
They send the same key events as the keyboard at the moment the finger goes down, so they are judged against the beat the same way.
The beat track and attack meter move up to make room. The attack button hides for the Tongue.

### Balance notes

- On-beat play costs no attack speed (the cooldown lines up with the beat), so the bonuses are kept small: ×1.4 damage at most.
  A Perfect Spit deals 9.8, just short of one-shotting a fresh Classic enemy (10 health), so Spit still needs aim and timing.
  A Perfect Shockwave (14) still one-shots Classic enemies for the first 100 seconds (13 health), but Hunter enemies (18) still take 2 hits.
- The combo bonus tops out at ×2 instead of ×3, so rhythm runs don't make the old best scores unreachable.
- The timing windows are tighter (45 / 90 ms instead of 50 / 110 ms), because at 160 BPM a 110 ms window covered more than half of every beat.

The rhythm is optional: playing off the beat only loses the combo and damage bonuses.
Press `M` on any screen to turn the sound off or on (saved in `localStorage` key `tode-muted`).

## Game-world UI

The menus and HUD use the colours and shapes of the game world itself, so they look like part of it.
All colours are CSS variables at the top of `src/style.css`.

| Colour | Value | Taken from | Used for |
| --- | --- | --- | --- |
| Grass light / shade | `#90ee90` / `#86e386` | Light checkerboard tile (`components/Map.js`) | Menu panel checker pattern, ready attack meter |
| Grass dark / pick | `#228b22` / `#1e7a1e` | Dark checkerboard tile | Upgrade pips; selected mode and attack (a little darker so white text stays readable) |
| Leaf deep | `#1b5e20` | Darkest tree foliage (`components/Scenery.js`) | Outlines, the side faces of every block, title outline |
| Wall | `#ffffff` | House walls (`public/models/small_house.glb`) | Buttons, cards, HUD panels, keycaps, title letters |
| Roof / roof side | `#d93a2b` / `#8f2219` | House roof | Start/Play again/Resume button, selection border, ready attack meter border, score pop |
| Rock | `#d5d9d0` | Rocks | Recharging attack meter, empty XP bar, loading Start button |
| Trunk | `#6b3f14` | Tree trunks, darkened for contrast | Coins and costs |
| Tongue pink | `#ff7a9c` | The Tongue attack | XP bar fill |

- **Blocks:** like the low-poly models, every panel and button is a near-square block with a solid dark green "side face" under it (a hard bottom shadow). Buttons sink onto that side face when pressed.
- **Menus:** the world stays visible behind a light sky-blue haze with a slight blur. Each menu sits on one panel that looks like a chunk of the checkerboard ground. Modes, attacks, shop items and level-up cards are white wall blocks; the selected one turns dark grass green with a red roof border.
- **Main button:** Start, Play again and Resume are red roof blocks with white text. While the models load, Start is a grey rock block.
- **HUD:** score, level, XP and the attack meter sit on white wall panels with dark text.
- **Title:** white block letters with a dark green outline, extruded downwards like the 3D models. Tode (`public/tode.svg`) hops above it on the start screen, and lies belly-up on the game over screen.
- **Font:** [Fredoka](https://fonts.google.com/specimen/Fredoka) from Google Fonts (`index.html`), a rounded, chunky font. Without a connection it falls back to Trebuchet MS, then the system font.
- **Accessibility kept:** the ✓ on the selected mode and attack and "(need N more)" on prices are unchanged. The focus ring is now dark instead of white, so it shows on the light panel. All text is at least 4.5:1 against its background, except the big white text on the red button (bold 24px, large text, at least 3:1). Tode's picture has an empty `alt` because it is decoration. With reduced motion on, Tode doesn't hop and buttons don't animate.

## Accessibility

Built against WCAG 2.2 AA and the basic tier of the [Game Accessibility Guidelines](https://gameaccessibilityguidelines.com/).

| Upgrade | WCAG criteria | Where |
| --- | --- | --- |
| Every menu choice (modes, attacks, Start, Play again, Upgrades, shop cards, Back, level-up cards, Resume, Continue) is a real `<button>`, so it works with Tab, Enter, mouse, touch and screen readers | 2.1.1 Keyboard, 4.1.2 Name, Role, Value | `src/main.js` |
| Each screen moves focus to the current choice; Tab moves the selection with the focus; Space or Enter on a focused button presses only that button | 2.4.3 Focus Order | `src/main.js` |
| Thick dark focus ring (3px, offset 3px) on keyboard focus | 2.4.7 Focus Visible, 2.4.11 Focus Not Obscured | `src/style.css` |
| Mouse users can start, play again and resume (before, only the keyboard could) | 2.1.1 Keyboard, 2.5 Input Modalities | `src/main.js` |
| The 3D canvas is hidden from screen readers; the menu overlay is a dialog labelled by its title | 1.3.1 Info and Relationships, 4.1.2 Name, Role, Value | `index.html`, `src/main.js` |
| A polite live region reads out mode changes, purchases, shields used, new difficulty levels and the game over score | 4.1.3 Status Messages | `src/main.js` |
| With the system's reduced-motion setting on, the score pop, high score pulse, XP bar easing and shield flash are turned off | 2.3.3 Animation from Interactions | `src/style.css` |
| "New high score!" pulses 4 times and stops, instead of looping forever | 2.2.2 Pause, Stop, Hide | `src/style.css` |
| The selected mode has a tick (✓) as well as a gold border; unaffordable upgrades say "(need N more)" instead of only turning red | 1.4.1 Use of Color | `src/main.js`, `src/style.css` |
| Upgrade levels and pick counts have hidden text for screen readers (the pips are hidden) | 1.1.1 Non-text Content | `src/main.js` |
| Font sizes in `rem`, no text smaller than 14px, title scales down on narrow screens, the overlay scrolls when zoomed in | 1.4.4 Resize Text, 1.4.10 Reflow | `src/style.css` |
| Pause with `P`/`Esc` or the **Resume** button, auto-pause when the tab is hidden or the window loses focus; keys pressed while paused don't carry into the game | 2.2.2 Pause, Stop, Hide | `src/main.js` |

Not done yet: adjustable game speed and key remapping.

## Controls

- `W` `A` `S` `D` or arrow keys: hop
- `Space`: attack (Shockwave and Spit), start, or play again; the Tongue attacks on its own
- `1` / `2` / `3`, or `A` / `D`: choose a mode on the start and game over screens
- `Q` / `E`: choose an attack on the start and game over screens
- `U`: open the upgrade shop from the start and game over screens (`W`/`S` choose, `Space` or `Enter` buy, `U`/`Esc` back)
- Level up: `1` / `2` / `3`, or `A`/`D` and `Space`, or click a card
- `P` or `Esc`: pause and resume
- `O`: sound and timing settings (volumes, timing calibration) from the start and game over screens
- `M`: sound on/off
- `Tab` / `Shift+Tab`: move between buttons on any menu screen; `Enter` or `Space` presses the focused button

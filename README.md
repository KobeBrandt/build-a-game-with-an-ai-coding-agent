# Tode's Escape

A 3D browser game about Tode the Frog, built with [three.js](https://threejs.org/) and [Vite](https://vite.dev/)
while working through the JetBrains Academy course
[Build a Game with an AI Coding Agent](https://github.com/jetbrains-academy/game-course).

Help Tode survive waves of monsters around his home: hop and attack on the beat of the music to build combos,
pick one of three attacks, earn coins and XP, and upgrade Tode between and during runs.

**Play online:** https://kobebrandt.github.io/build-a-game-with-an-ai-coding-agent/

This is a personal project. It is not an official JetBrains project and is not maintained by JetBrains.

## What I added

Compared with the original course project, the upgraded version (`game/upgraded`) adds:

- a rhythm system: synthesised music and sound effects, a beat track, Perfect/Great timing, combos, fever,
  enemies that hop on the beat and a timing calibration screen;
- three game modes (Classic, Horde, Hunter) with a best score per mode and attack;
- three attacks to choose from (Shockwave, Tongue, Spit), enemy health, damage, knockback and damage numbers;
- roguelite progression: a coin shop with permanent upgrades and level-up choices during a run;
- start, pause, level-up and game over screens, plus a restyled HUD and menus in the game world's style;
- trees, rocks, a grassy ground texture, shadows, see-through obstacles, off-screen enemy arrows and hop/hit effects;
- WASD and on-screen touch controls, and an accessibility pass (keyboard and screen reader support, reduced motion);
- a static build that deploys to GitHub Pages.

See [game/upgraded/README.md](game/upgraded/README.md) for the full list and the balance numbers.

## What is in this repository

- `game/src` – the game as built by following the course tasks.
- `game/upgraded` – the extended game described above.
- `game/public` – models and images shared by both versions.
- `Introduction`, `Skeleton`, `Core_loop`, `Visual`, `Conclusion` – the course lessons and task descriptions
  from the original JetBrains Academy course.

## Build and run

Requires [Node.js](https://nodejs.org/) 20.19 or later (needed by Vite 7).

```bash
cd game
npm install
```

Run a dev server:

```bash
npm run dev:upgraded   # upgraded version, opens http://localhost:5173/upgraded/
npm run dev            # course version, at http://localhost:5173/
```

Build a static copy:

```bash
npm run build:upgraded     # upgraded version, into game/dist-upgraded
npm run preview:upgraded   # serve that build locally
npm run build              # course version, into game/dist
```

### Controls

- `W` `A` `S` `D` or arrow keys: hop
- `Space`: attack (Shockwave and Spit), start, or play again
- `Q` / `E`: choose an attack, `1` / `2` / `3`: choose a mode, `U`: upgrade shop
- `P` or `Esc`: pause
- `O`: sound and timing settings, `M`: sound on/off
- Touch screens: on-screen D-pad, attack and pause buttons

## Third-party assets and libraries

| Asset | Author / source | License |
| --- | --- | --- |
| `game/public/models/tode.glb`, `game/public/tode.svg` (Tode the Frog) | [JetBrains Academy game course](https://github.com/jetbrains-academy/game-course) | MIT |
| `game/public/models/small_house.glb` | "Small House" by Jarlan Perez, via [Poly Pizza](https://poly.pizza/m/053kskrV4U_) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `game/public/models/enemy.glb` | "Armabee Evolved" by Quaternius, via [Poly Pizza](https://poly.pizza/m/GcttdvsqsQ) | [CC0 1.0 (public domain)](https://creativecommons.org/publicdomain/zero/1.0/) |
| Course lessons, task text and starter project | [JetBrains Academy](https://github.com/jetbrains-academy/game-course) | MIT |
| [three.js](https://github.com/mrdoob/three.js) | three.js authors | MIT |
| [Vite](https://github.com/vitejs/vite) | Vite contributors | MIT |
| [Fredoka](https://fonts.google.com/specimen/Fredoka) font, loaded from Google Fonts | Milena Brandão | [SIL Open Font License 1.1](https://openfontlicense.org/) |

Trees, rocks, the ground texture, attack effects and all UI are made in code in this repository.
The music and sound effects are original and synthesised in code with the Web Audio API
(`game/upgraded/src/components/Audio.js`); the game uses no sound or music files.
No commercially released music or sound recordings, third-party logos or trademarks are used.

## AI tools used

This game was built with AI coding agents, as the course intends:

- **Claude Code** (Anthropic, Claude models) – wrote and changed most of the game code in `game/src` and
  `game/upgraded` from my prompts: the course tasks, the game modes, attacks, enemy health, the shop and
  level-up upgrades, the rhythm system with its synthesised music and sound effects, touch controls, the UI restyle, the accessibility pass and the GitHub Pages deploy. It also helped write
  the documentation (this README and `game/upgraded/README.md`).

I chose the features, wrote the prompts and specs, played and tested the game, and reviewed the changes.
No AI-generated images, models or audio files are used in the game; the music and sounds are generated at runtime by that code.

## Credits

- Course material, lesson structure, starter project and the Tode model:
  [JetBrains Academy](https://github.com/jetbrains-academy/game-course), MIT License.
- Game changes and upgrades: Kobe Brandt.
- Other assets: see [Third-party assets and libraries](#third-party-assets-and-libraries).

## License

The code is released under the [MIT License](LICENSE). It keeps the original JetBrains Academy copyright
notice next to mine. The models keep their own licenses listed above.

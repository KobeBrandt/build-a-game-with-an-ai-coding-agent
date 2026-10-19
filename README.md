# Tode's Escape

A 3D browser game about Tode the Frog, built with [three.js](https://threejs.org/) and [Vite](https://vite.dev/)
while working through the JetBrains Academy course
[Build a Game with an AI Coding Agent](https://github.com/jetbrains-academy/game-course).

This is a personal project. It is not an official JetBrains project and is not maintained by JetBrains.

## What is in this repository

- `game/src` – the game as built by following the course tasks.
- `game/upgraded` – an extended copy of the game with extra features: game modes, three attacks,
  enemy health, a shop, roguelite level-up upgrades, a restyled UI and an accessibility pass.
  See [game/upgraded/README.md](game/upgraded/README.md) for the full list.
- `Introduction`, `Skeleton`, `Core_loop`, `Visual`, `Conclusion` – the course lessons and task descriptions
  from the original JetBrains Academy course.

## Run the game

Requires [Node.js](https://nodejs.org/) 20.19 or later.

```bash
cd game
npm install
npm run dev            # course version
npm run dev:upgraded   # upgraded version
```

## Credits

- Course material, lesson structure and game models: [JetBrains Academy](https://github.com/jetbrains-academy/game-course),
  licensed under the MIT License.
- Game changes and upgrades: Kobe Brandt.

## License

[MIT](LICENSE)

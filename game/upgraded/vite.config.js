import { defineConfig } from 'vite';

// Static build of the upgraded game for GitHub Pages: `npm run build:upgraded` from `game`.
// The relative base lets the site work under any path, such as https://<user>.github.io/<repo>/.
export default defineConfig({
  root: __dirname,
  base: './',
  publicDir: '../public',
  build: {
    outDir: '../dist-upgraded',
    emptyOutDir: true,
  },
});

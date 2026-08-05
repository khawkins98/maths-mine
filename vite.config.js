import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths, so the built site works from a GitHub Pages project
  // subpath (/<repo>/) as well as from a domain root — without hard-coding the
  // repo name here and having to remember to change it if the repo is renamed.
  base: './',
  server: {
    host: true, // bind on the LAN so a tablet on the same Wi-Fi can open it
  },
  build: {
    // three.js is ~600 kB of the bundle on its own; the default 500 kB warning
    // is noise for a single-page WebGL app that loads everything up front.
    chunkSizeWarningLimit: 900,
  },
});

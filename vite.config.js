import { defineConfig } from 'vite';

export default defineConfig({
  // Path relatif supaya isi dist/ bisa di-upload ke itch.io atau host statis mana pun.
  base: './',
  server: { host: true },
  // three.js sendiri sudah ~600 kB; graybox tidak perlu code-splitting.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    include: ['tests/**/*.test.js'],
  },
});

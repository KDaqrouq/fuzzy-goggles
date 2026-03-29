import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/content.ts'),
      output: {
        entryFileNames: 'content.js',
        format: 'iife',
        name: 'AslMeetCaptions',
      },
    },
  },
  publicDir: 'public',
});

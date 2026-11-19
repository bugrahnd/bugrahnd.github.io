import {fileURLToPath, URL} from 'node:url';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  resolve: {
    // The Magic UI components import their helper as "@/lib/utils".
    alias: {'@': fileURLToPath(new URL('./src', import.meta.url))},
  },
  build: {
    // public/assets holds the site's images and PDFs; keep Vite's bundles apart from them.
    assetsDir: '_app',
  },
});

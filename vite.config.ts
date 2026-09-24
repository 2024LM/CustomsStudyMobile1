import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  // GitHub Pages serves project sites from /<repository>/.
  // Keep "/" for Android/Capacitor and normal web builds.
  base: process.env.GITHUB_PAGES === 'true' ? '/CustomsStudyMobile1/' : '/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
});

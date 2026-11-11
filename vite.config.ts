import { defineConfig } from 'vite';

// Relative base so the build works at any path (GitHub Pages serves under /<repo>/).
export default defineConfig({ base: './' });

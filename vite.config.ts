import {defineConfig} from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import browserslist from 'browserslist';
import {browserslistToTargets} from 'lightningcss';

// PROVEN on the TV (webOS 24 / Chromium 108): downlevel Tailwind v4's oklch
// palette + color-mix opacity utilities to 108-safe fallbacks at build time.
// Do NOT remove — without it, colors break on the panel. See memory: tv-homescreen-stack.
const targets = browserslistToTargets(browserslist('chrome >= 108'));

export default defineConfig({
	base: './', // webOS apps load from a local file path — assets must be relative.
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {'@': path.resolve(__dirname, './src')}
	},
	css: {
		transformer: 'lightningcss',
		lightningcss: {targets}
	},
	build: {
		target: 'chrome108',
		cssMinify: 'lightningcss',
		outDir: 'dist'
	}
});

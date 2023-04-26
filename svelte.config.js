import adapter from '@sveltejs/adapter-static';
import svelte_proprocess from 'svelte-preprocess';
const dev = process.argv.includes('dev');

console.log(dev);
const config = {
	kit: {
		adapter: adapter({
			pages: 'docs',
			assets: 'docs',
			fallback: null,
			precompress: false,
			strict: true
		}),
		paths: {
			base: '/ifc-extractor',
			relative: false,
		}
	},
	preprocess: [
		svelte_proprocess({
			scss: {
				prependData: `
				@import './src/main.scss';
				`,
			},
		}),
	],

};

export default config;

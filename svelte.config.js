import adapter from '@sveltejs/adapter-auto';
import svelte_proprocess from 'svelte-preprocess';


/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: adapter()
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

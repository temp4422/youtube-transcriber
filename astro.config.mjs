import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
export default defineConfig({ output: 'server', session: false, adapter: node({ mode: 'standalone' }), server: { port: 3000 } });

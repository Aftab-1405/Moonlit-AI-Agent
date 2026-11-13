import { mergeConfig } from 'vite';
import path from 'node:path';
import config from '../vite.config.js';
export default mergeConfig(config, {
  resolve: { alias: [{ find: '@/contexts/AuthContext', replacement: path.resolve('tests/fixtures/focus-auth.js') }] },
  optimizeDeps: { entries: ['tests/fixtures/focus-interactions.html'] },
});

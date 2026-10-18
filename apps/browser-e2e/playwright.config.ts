import { fileURLToPath } from 'node:url';
import { defineConfig } from '@experiencequality/test-browser/config';

export default defineConfig({
  testDir: './test',
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  mock: {},
  application: {
    command: 'node --experimental-strip-types src/server.ts',
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    url: 'http://127.0.0.1:4100/',
    env: { PORT: '4100' },
  },
});

import { fileURLToPath } from 'node:url';
import { defineConfig } from '@experiencequality/test/vitest/config';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
  databases: {
    payments: { urlEnv: 'DATABASE_URL' }
  },
  application: {
    command: 'node --experimental-strip-types src/app.ts',
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    url: 'http://127.0.0.1:4000/health'
  }
});

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = 'apps/backend-e2e/docker-compose.yml';

if (process.argv.length !== 2) {
  throw new Error('usage: node scripts/ci-test.mjs');
}

run('pnpm', ['run', 'check']);
run('pnpm', ['test']);
run('pnpm', ['run', 'ci:cucumber']);

let validationError;
try {
  run('docker', ['compose', '-f', composeFile, 'up', '-d', '--wait']);
  run('pnpm', ['run', 'test:e2e']);
} catch (error) {
  validationError = error;
} finally {
  try {
    run('docker', ['compose', '-f', composeFile, 'down', '--volumes', '--remove-orphans']);
  } catch (cleanupError) {
    if (!validationError) throw cleanupError;
    console.error(`Compose cleanup failed after validation failure: ${cleanupError.message}`);
  }
}
if (validationError) throw validationError;

run('pnpm', [
  '--filter',
  '@experiencequality/showcase-browser-e2e',
  'exec',
  'playwright',
  'install',
  ...(process.platform === 'linux' ? ['--with-deps'] : []),
  'chromium',
]);
run('pnpm', ['run', 'test:e2e:browser']);
run('pnpm', ['run', 'test:e2e:infra']);

run('pnpm', ['run', 'verify:packages']);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`,
    );
  }
}

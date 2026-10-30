import assert from 'node:assert/strict';
import test from 'node:test';

import { createPlatformRelease } from './create-platform-release.mjs';

const releaseSha = 'a'.repeat(40);

test('creates an annotated tag and platform release when both are missing', () => {
  const calls = [];
  createPlatformRelease({
    version: '1.0.5',
    sha: releaseSha,
    repository: 'ExperienceQuality/xq-platform',
    run: (command, args) => {
      calls.push(args);
      if (args[1]?.includes('/git/ref/tags/')) {
        const error = new Error('HTTP 404: Not Found');
        error.stderr = 'HTTP 404: Not Found';
        throw error;
      }
      if (args[1]?.endsWith('/git/tags')) return JSON.stringify({ sha: 'tag-object-sha' });
      if (args[0] === 'release' && args[1] === 'view') {
        const error = new Error('release not found');
        error.stderr = 'release not found';
        throw error;
      }
      return '{}';
    },
  });

  const argumentsJson = JSON.stringify(calls);
  assert.match(argumentsJson, /git\/tags/);
  assert.match(argumentsJson, /git\/refs/);
  assert.match(argumentsJson, /release","create/);
});

test('reuses an existing correct tag but creates the missing release', () => {
  const calls = [];
  const result = createPlatformRelease({
    version: '1.0.5',
    sha: releaseSha,
    repository: 'ExperienceQuality/xq-platform',
    run: (command, args) => {
      calls.push(args);
      if (args[1]?.includes('/git/ref/tags/'))
        return JSON.stringify({ object: { type: 'tag', sha: 'tag-object-sha' } });
      if (args[1]?.endsWith('/git/tags/tag-object-sha'))
        return JSON.stringify({ object: { type: 'commit', sha: releaseSha } });
      if (args[0] === 'release' && args[1] === 'view') {
        const error = new Error('release not found');
        error.stderr = 'release not found';
        throw error;
      }
      return '{}';
    },
  });

  assert.equal(result.createdTag, false);
  assert.equal(result.createdRelease, true);
  assert.equal(JSON.stringify(calls).includes('release","create'), true);
});

test('refuses to retarget an existing tag', () => {
  assert.throws(
    () =>
      createPlatformRelease({
        version: '1.0.5',
        sha: releaseSha,
        repository: 'ExperienceQuality/xq-platform',
        run: () => JSON.stringify({ object: { type: 'commit', sha: 'b'.repeat(40) } }),
      }),
    /refusing to retarget/,
  );
});

test('skips release creation when the platform release already exists', () => {
  const calls = [];
  const result = createPlatformRelease({
    version: '1.0.5',
    sha: releaseSha,
    repository: 'ExperienceQuality/xq-platform',
    run: (command, args) => {
      calls.push(args);
      if (args[1]?.includes('/git/ref/tags/'))
        return JSON.stringify({ object: { type: 'commit', sha: releaseSha } });
      return '{}';
    },
  });

  assert.equal(result.createdRelease, false);
  assert.equal(JSON.stringify(calls).includes('release","create'), false);
});

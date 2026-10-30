import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { publishablePackageNames } from './publishable-packages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('changesets keeps every approved package in one fixed release group', () => {
  const config = JSON.parse(readFileSync(resolve(root, '.changeset/config.json'), 'utf8'));

  assert.deepEqual(config.fixed, [publishablePackageNames]);
  assert.equal(config.access, 'restricted');
  assert.equal(config.baseBranch, 'main');
  assert.deepEqual(config.privatePackages, { version: false, tag: false });
  assert.deepEqual(config.changedFilePatterns, [
    'src/**',
    'test/**',
    'package.json',
    'tsconfig*.json',
    '*.config.ts',
    '*.config.js',
  ]);
});

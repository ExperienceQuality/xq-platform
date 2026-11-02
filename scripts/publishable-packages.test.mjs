import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { publishablePackageNames, publishablePackages } from './publishable-packages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('publishable inventory lists seven packages with matching directories', () => {
  assert.equal(publishablePackages.length, 7);
  assert.deepEqual(
    publishablePackageNames,
    publishablePackages.map((name) => `@experiencequality/${name}`),
  );

  for (const name of publishablePackages) {
    assert.equal(
      existsSync(resolve(root, 'packages', name, 'package.json')),
      true,
      `missing packages/${name}/package.json`,
    );
  }
});

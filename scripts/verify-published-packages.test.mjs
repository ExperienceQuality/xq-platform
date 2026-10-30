import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { publishablePackages } from './publishable-packages.mjs';
import { verifyPublishedPackages } from './verify-published-packages.mjs';

function createPackageFixture(t, version = '1.0.5') {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'xq-published-fixture-'));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  for (const packageDirectory of publishablePackages) {
    const directory = join(fixtureRoot, 'packages', packageDirectory);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, 'package.json'),
      `${JSON.stringify({ name: `@experiencequality/${packageDirectory}`, version })}\n`,
    );
  }
  return fixtureRoot;
}

test('verifies every expected package at the release version', (t) => {
  const fixtureRoot = createPackageFixture(t);
  const inspected = [];

  assert.doesNotThrow(() =>
    verifyPublishedPackages({
      packageRoot: fixtureRoot,
      version: '1.0.5',
      lookup: (name, version) => {
        inspected.push([name, version]);
        return '1.0.5';
      },
    }),
  );

  assert.deepEqual(
    inspected.map(([name]) => name),
    publishablePackages.map((name) => `@experiencequality/${name}`),
  );
  assert.deepEqual([...new Set(inspected.map(([, version]) => version))], ['1.0.5']);
});

test('fails when any expected package version is missing', (t) => {
  const fixtureRoot = createPackageFixture(t);

  assert.throws(
    () =>
      verifyPublishedPackages({
        packageRoot: fixtureRoot,
        version: '1.0.5',
        lookup: (name) => (name === '@experiencequality/test-infra' ? null : '1.0.5'),
      }),
    /missing published package versions: @experiencequality\/test-infra/,
  );
});

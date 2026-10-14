import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { verifyReleaseVersion } from './verify-release-version.mjs';

const packageNames = ['rest-client', 'db', 'stub', 'core', 'test'];
const root = new URL('..', import.meta.url).pathname;

test('the repository release contract accepts aligned workspace manifests', () => {
  assert.doesNotThrow(() => verifyReleaseVersion('1.0.3'));
});

test('the release contract rejects a package version mismatch', () => {
  const fixtureRoot = createFixture();
  writePackage(fixtureRoot, 'core', { version: '1.0.4' });

  assert.throws(
    () => verifyReleaseVersion('1.0.3', fixtureRoot),
    /core\/package\.json has version "1\.0\.4"; expected 1\.0\.3/,
  );
  rmSync(fixtureRoot, { recursive: true, force: true });
});

test('the release contract rejects unsupported internal dependency ranges', () => {
  const fixtureRoot = createFixture();
  writePackage(fixtureRoot, 'core', {
    dependencies: {
      '@experiencequality/rest-client': '^1.0.3',
      '@experiencequality/stub': 'workspace:*',
    },
  });

  assert.throws(
    () => verifyReleaseVersion('1.0.3', fixtureRoot),
    /core\/package\.json declares @experiencequality\/rest-client at "\^1\.0\.3"; expected workspace:\* in the source manifest/,
  );
  rmSync(fixtureRoot, { recursive: true, force: true });
});

test('pnpm packs exact versions into core and test manifests', () => {
  const destination = mkdtempSync(join(tmpdir(), 'xq-release-pack-'));

  try {
    for (const packageName of ['core', 'test']) {
      execFileSync(
        'pnpm',
        [
          '--filter',
          `@experiencequality/${packageName}`,
          'pack',
          '--pack-destination',
          destination,
        ],
        { cwd: root, stdio: 'pipe' },
      );

      const archive = join(destination, `experiencequality-${packageName}-1.0.3.tgz`);
      const manifest = JSON.parse(
        execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }),
      );
      for (const [dependencyName, dependencyVersion] of Object.entries(
        manifest.dependencies ?? {},
      )) {
        if (!dependencyName.startsWith('@experiencequality/')) continue;
        assert.equal(
          dependencyVersion,
          '1.0.3',
          `${packageName} packs ${dependencyName} at ${dependencyVersion}`,
        );
      }
    }
  } finally {
    rmSync(destination, { recursive: true, force: true });
  }
});

function createFixture() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'xq-release-fixture-'));
  for (const packageName of packageNames) writePackage(fixtureRoot, packageName);
  return fixtureRoot;
}

function writePackage(fixtureRoot, packageName, overrides = {}) {
  const dependencies =
    packageName === 'core'
      ? {
          '@experiencequality/rest-client': 'workspace:*',
          '@experiencequality/stub': 'workspace:*',
        }
      : packageName === 'test'
        ? {
            '@experiencequality/core': 'workspace:*',
            '@experiencequality/db': 'workspace:*',
            '@experiencequality/rest-client': 'workspace:*',
            '@experiencequality/stub': 'workspace:*',
          }
        : {};
  const packageJson = {
    name: `@experiencequality/${packageName}`,
    version: '1.0.3',
    dependencies,
    ...overrides,
  };
  const packageDirectory = join(fixtureRoot, 'packages', packageName);
  execFileSync('mkdir', ['-p', packageDirectory]);
  writeFileSync(join(packageDirectory, 'package.json'), `${JSON.stringify(packageJson)}\n`);
}

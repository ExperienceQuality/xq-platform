import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { publishablePackages as packageNames } from './publishable-packages.mjs';
import { resolveReleaseVersion, verifyReleaseVersion } from './verify-release-version.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('the repository release contract accepts aligned workspace manifests', () => {
  const version = readManifest('rest-client').version;
  assert.doesNotThrow(() => verifyReleaseVersion(version));
});

test('release context accepts a version on a branch push', () => {
  const version = resolveReleaseVersion(['--version', '1.0.5'], {
    GITHUB_REF_NAME: 'main',
    GITHUB_REF: 'refs/heads/main',
  });
  assert.equal(version, '1.0.5');
});

test('release context derives the version from a tag ref', () => {
  const version = resolveReleaseVersion([], { GITHUB_REF: 'refs/tags/v1.0.5' });
  assert.equal(version, '1.0.5');
});

test('the release contract rejects a package version mismatch', (t) => {
  const fixtureRoot = createFixture(t);
  writePackage(fixtureRoot, 'core', { version: '1.0.4' });

  assert.throws(
    () => verifyReleaseVersion('1.0.3', fixtureRoot),
    /core\/package\.json has version "1\.0\.4"; expected 1\.0\.3/,
  );
});

test('the release contract rejects unsupported internal dependency ranges', (t) => {
  const fixtureRoot = createFixture(t);
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
});

test('the release contract rejects a test-infra version mismatch', (t) => {
  const fixtureRoot = createFixture(t);
  writePackage(fixtureRoot, 'test-infra', { version: '1.0.4' });

  assert.throws(
    () => verifyReleaseVersion('1.0.3', fixtureRoot),
    /test-infra\/package\.json has version "1\.0\.4"; expected 1\.0\.3/,
  );
});

test('the release contract rejects a missing test-infra manifest', (t) => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'xq-release-fixture-'));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
  for (const packageName of packageNames) {
    if (packageName === 'test-infra') continue;
    writePackage(fixtureRoot, packageName);
  }

  assert.throws(() => verifyReleaseVersion('1.0.3', fixtureRoot), /could not read .*test-infra/);
});

test('pnpm packs exact versions into core, test, and test-browser manifests', (t) => {
  const destination = mkdtempSync(join(tmpdir(), 'xq-release-pack-'));
  t.after(() => rmSync(destination, { recursive: true, force: true }));

  for (const packageName of ['core', 'test', 'test-browser']) {
    const sourceManifest = readManifest(packageName);
    execFileSync(
      'pnpm',
      ['--filter', sourceManifest.name, 'pack', '--pack-destination', destination],
      { cwd: root, stdio: 'pipe' },
    );

    const archive = join(
      destination,
      `${sourceManifest.name.replace(/^@/, '').replace('/', '-')}-${sourceManifest.version}.tgz`,
    );
    const manifest = JSON.parse(
      execFileSync('tar', ['-xOf', archive, 'package/package.json'], { encoding: 'utf8' }),
    );
    for (const [dependencyName, dependencyVersion] of Object.entries(manifest.dependencies ?? {})) {
      if (!dependencyName.startsWith('@experiencequality/')) continue;
      const expectedVersion = readManifest(
        dependencyName.slice('@experiencequality/'.length),
      ).version;
      assert.equal(
        dependencyVersion,
        expectedVersion,
        `${packageName} packs ${dependencyName} at ${dependencyVersion}`,
      );
    }
  }
});

function readManifest(packageDirectory) {
  const manifestPath = join(root, 'packages', packageDirectory, 'package.json');
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function createFixture(t) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'xq-release-fixture-'));
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));
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
  mkdirSync(packageDirectory, { recursive: true });
  writeFileSync(join(packageDirectory, 'package.json'), `${JSON.stringify(packageJson)}\n`);
}

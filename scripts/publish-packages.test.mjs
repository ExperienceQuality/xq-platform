import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createPublishPlan,
  lookupPublishedVersion,
  publishPackage,
  publishPackages,
} from './publish-packages.mjs';

const packageRoot = new URL('..', import.meta.url).pathname;

test('plans missing packages in dependency order and skips exact versions', () => {
  const seen = new Map([
    ['@experiencequality/rest-client', '1.0.3'],
    ['@experiencequality/db', null],
    ['@experiencequality/stub', '1.0.3'],
    ['@experiencequality/core', null],
    ['@experiencequality/test', null],
    ['@experiencequality/test-browser', null],
  ]);

  const plan = createPublishPlan({
    packageRoot,
    version: '1.0.3',
    lookup: (name) => seen.get(name),
  });

  assert.deepEqual(
    plan.map(({ action, name }) => ({ action, name })),
    [
      { action: 'skip', name: '@experiencequality/rest-client' },
      { action: 'publish', name: '@experiencequality/db' },
      { action: 'skip', name: '@experiencequality/stub' },
      { action: 'publish', name: '@experiencequality/core' },
      { action: 'publish', name: '@experiencequality/test' },
      { action: 'publish', name: '@experiencequality/test-browser' },
    ],
  );
});

test('fails when a local package version does not match the release version', () => {
  assert.throws(
    () => createPublishPlan({ packageRoot, version: '9.9.9', lookup: () => null }),
    /expected 9\.9\.9/,
  );
});

test('publishes only missing packages in plan order', () => {
  const published = [];
  publishPackages({
    packageRoot,
    version: '1.0.3',
    lookup: (name) => (name === '@experiencequality/rest-client' ? '1.0.3' : null),
    publish: (item) => published.push(item.name),
  });

  assert.deepEqual(published, [
    '@experiencequality/db',
    '@experiencequality/stub',
    '@experiencequality/core',
    '@experiencequality/test',
    '@experiencequality/test-browser',
  ]);
});

test('uses pnpm for registry lookup with the configured registry', () => {
  const calls = [];
  const version = lookupPublishedVersion(
    '@experiencequality/core',
    '1.0.3',
    'https://registry.example',
    (...args) => {
      calls.push(args);
      return '"1.0.3"';
    },
  );

  assert.equal(version, '1.0.3');
  assert.equal(calls[0][0], 'pnpm');
  assert.deepEqual(calls[0][1], [
    'view',
    '@experiencequality/core@1.0.3',
    'version',
    '--json',
    '--registry',
    'https://registry.example',
  ]);
});

test('treats pnpm not-found lookup failures as unpublished packages', () => {
  assert.equal(
    lookupPublishedVersion(
      '@experiencequality/missing',
      '1.0.3',
      'https://registry.example',
      () => {
        const error = new Error('not found');
        error.status = 1;
        error.stderr = 'ERR_PNPM_FETCH_404 GET ...: Not Found - 404';
        throw error;
      },
    ),
    null,
  );
});

test('preserves pnpm registry lookup failures other than not-found', () => {
  assert.throws(
    () =>
      lookupPublishedVersion('@experiencequality/core', '1.0.3', 'https://registry.example', () => {
        const error = new Error('unauthorized');
        error.status = 1;
        error.stderr = 'ERR_PNPM_FETCH_401 Unauthorized';
        throw error;
      }),
    /could not inspect .*ERR_PNPM_FETCH_401 Unauthorized/,
  );
});

test('publishes one selected workspace package through pnpm', () => {
  const calls = [];
  publishPackage(
    { packageDirectory: 'core', name: '@experiencequality/core' },
    'https://registry.example',
    (...args) => calls.push(args),
  );

  assert.equal(calls[0][0], 'pnpm');
  assert.deepEqual(calls[0][1], [
    '--filter',
    '@experiencequality/core',
    'publish',
    '--registry',
    'https://registry.example',
  ]);
});

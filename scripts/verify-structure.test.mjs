import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { discoverWorkspaces, verifyStructure } from './verify-structure.mjs';

test('discovers the approved libraries and applications through pnpm', () => {
  const workspaces = discoverWorkspaces();

  assert.deepEqual(workspaces.map(({ name }) => name).sort(), [
    '@experiencequality/core',
    '@experiencequality/db',
    '@experiencequality/rest-client',
    '@experiencequality/showcase-backend-e2e',
    '@experiencequality/showcase-browser-e2e',
    '@experiencequality/showcase-infra-e2e',
    '@experiencequality/stub',
    '@experiencequality/test',
    '@experiencequality/test-browser',
    '@experiencequality/test-infra',
  ]);
});

test('accepts the current workspace topology and policy', () => {
  assert.doesNotThrow(() => verifyStructure());
});

test('rejects duplicate workspace discovery', () => {
  const workspaces = discoverWorkspaces();
  const privateWorkspace = workspaces.find((workspace) => workspace.name.includes('showcase'));
  assert.throws(
    () => verifyStructure({ workspaces: [...workspaces, privateWorkspace] }),
    /duplicate workspace/,
  );
});

const FIXTURE_LIBRARIES = [
  'rest-client',
  'db',
  'stub',
  'core',
  'test',
  'test-browser',
  'test-infra',
];
const FIXTURE_INTERNAL_DEPENDENCIES = {
  core: ['@experiencequality/rest-client', '@experiencequality/stub'],
  test: [
    '@experiencequality/core',
    '@experiencequality/db',
    '@experiencequality/rest-client',
    '@experiencequality/stub',
  ],
  'test-browser': [
    '@experiencequality/core',
    '@experiencequality/db',
    '@experiencequality/rest-client',
    '@experiencequality/stub',
  ],
};

const FACADE_EXPORTS = {
  '.': { types: './dist/index.d.ts', import: './dist/index.js' },
  './vitest': { types: './dist/vitest/test.d.ts', import: './dist/vitest/test.js' },
  './vitest/config': { types: './dist/vitest/config.d.ts', import: './dist/vitest/config.js' },
  './cucumber': { types: './dist/cucumber/index.d.ts', import: './dist/cucumber/index.js' },
  './cucumber/config': {
    types: './dist/cucumber/config.d.ts',
    import: './dist/cucumber/config.js',
  },
  './cucumber/register': {
    types: './dist/cucumber/register.d.ts',
    import: './dist/cucumber/register.js',
  },
  './cucumber/bootstrap': {
    types: './dist/cucumber/bootstrap.d.ts',
    import: './dist/cucumber/bootstrap.js',
  },
  './cucumber/plugin': {
    types: './dist/cucumber/plugin.d.ts',
    import: './dist/cucumber/plugin.js',
  },
  './cucumber/json': { types: './dist/cucumber/json.d.ts', import: './dist/cucumber/json.js' },
  './package.json': './package.json',
};

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function mutateJson(filePath, mutate) {
  const value = readJson(filePath);
  mutate(value);
  writeJson(filePath, value);
}

function createLibraryManifest(name) {
  const manifest = {
    name: `@experiencequality/${name}`,
    version: '1.0.3',
    repository: {
      type: 'git',
      url: 'https://github.com/ExperienceQuality/xq-platform.git',
      directory: `packages/${name}`,
    },
    type: 'module',
    files: ['dist', 'package.json'],
    exports: {
      '.': { types: './dist/index.d.ts', import: './dist/index.js' },
    },
    scripts: {
      build: 'tsc -b',
      check: 'tsc -p tsconfig.test.json --noEmit',
      test: 'vitest run',
    },
    engines: { node: '>=24' },
    publishConfig: { registry: 'https://npm.pkg.github.com' },
  };
  const internalDependencies = FIXTURE_INTERNAL_DEPENDENCIES[name];
  if (internalDependencies) {
    manifest.dependencies = Object.fromEntries(
      internalDependencies.map((dependency) => [dependency, 'workspace:*']),
    );
  }
  if (name === 'test') {
    manifest.exports = FACADE_EXPORTS;
    manifest.peerDependencies = {
      vitest: '^4.0.0',
      '@cucumber/cucumber': '>=13.2.1 <14',
    };
    manifest.peerDependenciesMeta = { '@cucumber/cucumber': { optional: true } };
  }
  if (name === 'test-infra') {
    delete manifest.exports;
    manifest.bin = { 'xq-infra': './dist/bin/xq-infra.js' };
    manifest.scripts = {
      build: 'tsc -b',
      check: 'tsc -p tsconfig.test.json --noEmit',
      test: 'vitest run --config vitest.config.ts',
    };
  }
  return manifest;
}

function createFixtureRoot() {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'xq-verify-structure-'));

  writeJson(join(fixtureRoot, 'package.json'), {
    name: 'fixture-root',
    private: true,
    scripts: {
      test: 'pnpm --filter @experiencequality/rest-client --filter @experiencequality/test-infra --workspace-concurrency=1 run test',
    },
  });
  writeJson(join(fixtureRoot, 'tsconfig.json'), {
    files: [],
    references: FIXTURE_LIBRARIES.map((name) => ({ path: `./packages/${name}` })),
  });

  for (const name of FIXTURE_LIBRARIES) {
    const packageDir = join(fixtureRoot, 'packages', name);
    mkdirSync(join(packageDir, 'src'), { recursive: true });
    mkdirSync(join(packageDir, 'test'), { recursive: true });
    writeJson(join(packageDir, 'package.json'), createLibraryManifest(name));
  }
  mkdirSync(join(fixtureRoot, 'packages/test-infra/src/bin'), { recursive: true });
  writeFileSync(
    join(fixtureRoot, 'packages/test-infra/src/bin/xq-infra.ts'),
    '#!/usr/bin/env node\n',
    'utf8',
  );

  const appDir = join(fixtureRoot, 'apps', 'backend-e2e');
  mkdirSync(join(appDir, 'src'), { recursive: true });
  mkdirSync(join(appDir, 'test'), { recursive: true });
  writeJson(join(appDir, 'package.json'), {
    name: '@experiencequality/showcase-backend-e2e',
    private: true,
  });

  return fixtureRoot;
}

function fixtureWorkspaces(fixtureRoot, { omitNames = [], extra = [] } = {}) {
  const entries = [
    ...FIXTURE_LIBRARIES.map((name) => ({
      name: `@experiencequality/${name}`,
      path: join(fixtureRoot, 'packages', name),
    })),
    {
      name: '@experiencequality/showcase-backend-e2e',
      path: join(fixtureRoot, 'apps/backend-e2e'),
    },
  ];
  return [...entries.filter((entry) => !omitNames.includes(entry.name)), ...extra];
}

function verifyFixture(fixtureRoot, workspaces = fixtureWorkspaces(fixtureRoot)) {
  return () => verifyStructure({ workspaceRoot: fixtureRoot, workspaces });
}

test('accepts a valid seven-package fixture root', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  assert.doesNotThrow(verifyFixture(fixtureRoot));
});

test('rejects a fixture missing the seventh workspace', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  assert.throws(
    verifyFixture(
      fixtureRoot,
      fixtureWorkspaces(fixtureRoot, { omitNames: ['@experiencequality/test-infra'] }),
    ),
    /exactly 7 public libraries/,
  );
});

test('rejects duplicate workspace discovery in a fixture', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  const privateEntry = {
    name: '@experiencequality/showcase-backend-e2e',
    path: join(fixtureRoot, 'apps/backend-e2e'),
  };
  assert.throws(
    verifyFixture(fixtureRoot, fixtureWorkspaces(fixtureRoot, { extra: [privateEntry] })),
    /duplicate workspace/,
  );
});

test('rejects a test-infra manifest publishing to the wrong registry', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  mutateJson(join(fixtureRoot, 'packages/test-infra/package.json'), (manifest) => {
    manifest.publishConfig.registry = 'https://registry.npmjs.org';
  });

  assert.throws(verifyFixture(fixtureRoot), /must publish to the company npm registry/);
});

test('rejects test-infra depending on another internal package', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  mutateJson(join(fixtureRoot, 'packages/test-infra/package.json'), (manifest) => {
    manifest.dependencies = { '@experiencequality/test': 'workspace:*' };
  });

  assert.throws(verifyFixture(fixtureRoot), /unexpected internal dependency boundary/);
});

test('rejects test-infra depending on test-browser', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  mutateJson(join(fixtureRoot, 'packages/test-infra/package.json'), (manifest) => {
    manifest.dependencies = { '@experiencequality/test-browser': 'workspace:*' };
  });

  assert.throws(verifyFixture(fixtureRoot), /unexpected internal dependency boundary/);
});

test('rejects an existing package depending on test-infra', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  mutateJson(join(fixtureRoot, 'packages/rest-client/package.json'), (manifest) => {
    manifest.dependencies = { '@experiencequality/test-infra': 'workspace:*' };
  });

  assert.throws(verifyFixture(fixtureRoot), /unexpected internal dependency boundary/);
});

test('rejects a test-infra manifest with the wrong module type', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  mutateJson(join(fixtureRoot, 'packages/test-infra/package.json'), (manifest) => {
    manifest.type = 'commonjs';
  });

  assert.throws(verifyFixture(fixtureRoot), /must be an ES module package/);
});

test('rejects a test-infra manifest with the wrong bin mapping', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  mutateJson(join(fixtureRoot, 'packages/test-infra/package.json'), (manifest) => {
    manifest.bin = { 'xq-infra': './dist/cli/index.js' };
  });

  assert.throws(verifyFixture(fixtureRoot), /must map xq-infra/);
});

test('rejects a test-infra manifest with the wrong build script', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  mutateJson(join(fixtureRoot, 'packages/test-infra/package.json'), (manifest) => {
    manifest.scripts.build = 'tsc -p tsconfig.json';
  });

  assert.throws(verifyFixture(fixtureRoot), /must build with tsc -b/);
});

test('rejects a root tsconfig missing the test-infra reference', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  mutateJson(join(fixtureRoot, 'tsconfig.json'), (tsconfig) => {
    tsconfig.references = tsconfig.references.filter(
      (reference) => reference.path !== './packages/test-infra',
    );
  });

  assert.throws(verifyFixture(fixtureRoot), /must reference packages\/test-infra/);
});

test('rejects a test-infra package missing its bin source', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  rmSync(join(fixtureRoot, 'packages/test-infra/src/bin/xq-infra.ts'));

  assert.throws(verifyFixture(fixtureRoot), /must own src\/bin\/xq-infra\.ts/);
});

test('rejects a root test script missing the test-infra selector', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  mutateJson(join(fixtureRoot, 'package.json'), (manifest) => {
    manifest.scripts.test =
      'pnpm --filter @experiencequality/rest-client --workspace-concurrency=1 run test';
  });

  assert.throws(verifyFixture(fixtureRoot), /must include @experiencequality\/test-infra/);
});

test('rejects a package manifest with the wrong repository metadata', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  mutateJson(join(fixtureRoot, 'packages/core/package.json'), (manifest) => {
    manifest.repository.url = 'https://github.com/ExperienceQuality/node-test-kit.git';
  });

  assert.throws(verifyFixture(fixtureRoot), /must reference the xq-platform repository/);
});

test('rejects a library manifest without a public entrypoint', (t) => {
  const fixtureRoot = createFixtureRoot();
  t.after(() => rmSync(fixtureRoot, { recursive: true, force: true }));

  mutateJson(join(fixtureRoot, 'packages/core/package.json'), (manifest) => {
    delete manifest.exports;
    delete manifest.bin;
  });

  assert.throws(verifyFixture(fixtureRoot), /must declare a typed package entrypoint or CLI bin/);
});

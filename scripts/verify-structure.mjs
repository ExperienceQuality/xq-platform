import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const libraryNames = ['rest-client', 'db', 'stub', 'core', 'test'];
const publicPackageNames = new Set(libraryNames.map((name) => `@experiencequality/${name}`));
const workspacePaths = [...libraryNames.map((name) => `packages/${name}`), 'showcase/backend-e2e'];
const expectedDependencies = new Map([
  ['rest-client', []],
  ['db', []],
  ['stub', []],
  ['core', ['@experiencequality/rest-client', '@experiencequality/stub']],
  [
    'test',
    [
      '@experiencequality/core',
      '@experiencequality/db',
      '@experiencequality/rest-client',
      '@experiencequality/stub',
    ],
  ],
]);

const rootPackage = readJson('package.json');
assert(rootPackage.private === true, 'root package must remain private');
assert(
  JSON.stringify(rootPackage.workspaces) === JSON.stringify(['packages/*', 'showcase/*']),
  'unexpected root workspace globs',
);

const actualLibraries = readdirSync(resolve(root, 'packages'), { withFileTypes: true })
  .filter(
    (entry) =>
      entry.isDirectory() && existsSync(resolve(root, 'packages', entry.name, 'package.json')),
  )
  .map((entry) => entry.name)
  .sort();
assert(
  JSON.stringify(actualLibraries) === JSON.stringify([...libraryNames].sort()),
  'packages/* must contain exactly the five approved flat libraries',
);

for (const workspacePath of workspacePaths) {
  const packageJson = readJson(`${workspacePath}/package.json`);
  if (workspacePath.startsWith('packages/')) {
    assert(packageJson.private !== true, `${workspacePath} must be publishable`);
    assert(
      publicPackageNames.has(packageJson.name),
      `${workspacePath} has an unexpected public package name`,
    );
    assert(
      packageJson.publishConfig?.registry === 'https://npm.pkg.github.com',
      `${workspacePath} must publish to the company npm registry`,
    );
  } else {
    assert(packageJson.private === true, `${workspacePath} must remain private`);
  }
  for (const directory of ['src', 'test']) {
    assert(
      existsSync(resolve(root, workspacePath, directory)),
      `${workspacePath} must own ${directory}/`,
    );
  }
}

for (const name of libraryNames) {
  const workspacePath = `packages/${name}`;
  const packageJson = readJson(`${workspacePath}/package.json`);
  const internalDependencies = Object.keys(packageJson.dependencies ?? {}).filter((dependency) =>
    [
      '@experiencequality/core',
      '@experiencequality/db',
      '@experiencequality/rest-client',
      '@experiencequality/stub',
    ].includes(dependency),
  );
  assert(
    JSON.stringify(internalDependencies.sort()) ===
      JSON.stringify(expectedDependencies.get(name).sort()),
    `${workspacePath} has an unexpected internal dependency boundary`,
  );

  for (const sourceFile of filesUnder(resolve(root, workspacePath, 'src')).filter((path) =>
    path.endsWith('.ts'),
  )) {
    const content = readFileSync(sourceFile, 'utf8');
    for (const match of content.matchAll(/(?:from\s+|import\s*\()(['"])(\.[^'"]+)\1/g)) {
      const target = resolve(dirname(sourceFile), match[2]);
      const packageRoot = resolve(root, workspacePath);
      assert(
        target === packageRoot || target.startsWith(`${packageRoot}${sep}`),
        `${relative(root, sourceFile)} crosses a package boundary with ${match[2]}`,
      );
    }
  }
}

const facade = readJson('packages/test/package.json');
const expectedExports = {
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
assert(
  JSON.stringify(facade.exports) === JSON.stringify(expectedExports),
  '@experiencequality/test exports changed',
);
assert(
  facade.peerDependencies?.vitest === '^4.0.0',
  '@experiencequality/test must expose its Vitest peer requirement',
);
assert(
  facade.peerDependencies?.['@cucumber/cucumber'] === '>=13.2.1 <14',
  '@experiencequality/test must expose its Cucumber peer requirement',
);
assert(
  facade.peerDependenciesMeta?.['@cucumber/cucumber']?.optional === true,
  '@experiencequality/test Cucumber peer must remain optional',
);

for (const legacyRoot of ['src', 'test', 'demo']) {
  assert(
    filesUnder(resolve(root, legacyRoot)).length === 0,
    `legacy root ${legacyRoot}/ still owns files`,
  );
}

console.log('workspace structure and dependency boundaries verified');

function readJson(path) {
  return JSON.parse(readFileSync(resolve(root, path), 'utf8'));
}

function filesUnder(path) {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(`verify:structure: ${message}`);
}

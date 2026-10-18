import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const libraryNames = ['rest-client', 'db', 'stub', 'core', 'test', 'test-browser'];
const publicPackageNames = new Set(libraryNames.map((name) => `@experiencequality/${name}`));
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
  [
    'test-browser',
    [
      '@experiencequality/core',
      '@experiencequality/db',
      '@experiencequality/rest-client',
      '@experiencequality/stub',
    ],
  ],
]);

export function discoverWorkspaces(workspaceRoot = root) {
  const output = execFileSync(
    'pnpm',
    ['--dir', workspaceRoot, 'list', '--recursive', '--json', '--depth', '-1'],
    { encoding: 'utf8' },
  );
  return JSON.parse(output).filter(
    (workspace) => resolve(workspace.path) !== resolve(workspaceRoot),
  );
}

export function verifyStructure({
  workspaceRoot = root,
  workspaces = discoverWorkspaces(workspaceRoot),
} = {}) {
  const readWorkspaceJson = (workspacePath) =>
    JSON.parse(readFileSync(resolve(workspaceRoot, workspacePath, 'package.json'), 'utf8'));
  const rootPackage = readJsonAt(workspaceRoot, 'package.json');
  assert(rootPackage.private === true, 'root package must remain private');
  assert(!('workspaces' in rootPackage), 'root package must not define workspace globs');

  const workspacePaths = workspaces.map((workspace) => relative(workspaceRoot, workspace.path));
  const publicWorkspaces = workspaces.filter((workspace) => publicPackageNames.has(workspace.name));
  const privateWorkspaces = workspaces.filter(
    (workspace) => !publicPackageNames.has(workspace.name),
  );
  const privatePaths = privateWorkspaces
    .map((workspace) => relative(workspaceRoot, workspace.path))
    .sort();
  assert(
    workspacePaths.length === publicWorkspaces.length + privateWorkspaces.length,
    'pnpm must discover only approved workspaces',
  );
  assert(
    publicWorkspaces.length === publicPackageNames.size,
    `pnpm must discover exactly ${publicPackageNames.size} public libraries`,
  );
  assert(
    JSON.stringify(publicWorkspaces.map((workspace) => workspace.name).sort()) ===
      JSON.stringify([...publicPackageNames].sort()),
    'pnpm discovered an unexpected public package set',
  );
  assert(
    privatePaths.every((workspacePath) => workspacePath.startsWith(`apps${sep}`)),
    'private workspaces must live under apps/',
  );
  assert(
    privatePaths.includes('apps/backend-e2e'),
    'showcase application must live under apps/backend-e2e',
  );
  for (const workspace of privateWorkspaces) {
    const workspacePath = relative(workspaceRoot, workspace.path);
    assert(
      readWorkspaceJson(workspacePath).private === true,
      `${workspacePath} must remain private`,
    );
  }

  const discoveredPaths = new Set(workspacePaths);
  assert(
    JSON.stringify([...discoveredPaths].sort()) === JSON.stringify([...workspacePaths].sort()),
    'pnpm discovered duplicate workspace paths',
  );

  const actualLibraries = readdirSync(resolve(workspaceRoot, 'packages'), { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(resolve(workspaceRoot, 'packages', entry.name, 'package.json')),
    )
    .map((entry) => entry.name)
    .sort();
  assert(
    JSON.stringify(actualLibraries) === JSON.stringify([...libraryNames].sort()),
    'packages/* must contain exactly the approved flat libraries',
  );

  for (const workspacePath of workspacePaths) {
    const packageJson = readWorkspaceJson(workspacePath);
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
        existsSync(resolve(workspaceRoot, workspacePath, directory)),
        `${workspacePath} must own ${directory}/`,
      );
    }
  }

  for (const name of libraryNames) {
    const workspacePath = `packages/${name}`;
    const packageJson = readWorkspaceJson(workspacePath);
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

    for (const sourceFile of filesUnder(resolve(workspaceRoot, workspacePath, 'src')).filter(
      (path) => path.endsWith('.ts'),
    )) {
      const content = readFileSync(sourceFile, 'utf8');
      for (const match of content.matchAll(/(?:from\s+|import\s*\()(['"])(\.[^'"]+)\1/g)) {
        const target = resolve(dirname(sourceFile), match[2]);
        const packageRoot = resolve(workspaceRoot, workspacePath);
        assert(
          target === packageRoot || target.startsWith(`${packageRoot}${sep}`),
          `${relative(workspaceRoot, sourceFile)} crosses a package boundary with ${match[2]}`,
        );
      }
    }
  }

  const facade = readWorkspaceJson('packages/test');
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
      filesUnder(resolve(workspaceRoot, legacyRoot)).length === 0,
      `legacy root ${legacyRoot}/ still owns files`,
    );
  }

  for (const lockfile of findExtraLockfiles(workspaceRoot)) {
    assert(false, `unexpected extra lockfile ${relative(workspaceRoot, lockfile)}`);
  }

  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  verifyStructure();
  console.log('workspace structure and dependency boundaries verified');
}

function readJsonAt(workspaceRoot, path) {
  return JSON.parse(readFileSync(resolve(workspaceRoot, path), 'utf8'));
}

function filesUnder(path) {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

function findExtraLockfiles(workspaceRoot) {
  return filesUnder(workspaceRoot).filter(
    (path) =>
      !path.includes(`${sep}node_modules${sep}`) &&
      !path.includes(`${sep}.git${sep}`) &&
      ['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'pnpm-lock.yaml'].includes(
        path.split(sep).at(-1),
      ) &&
      path !== resolve(workspaceRoot, 'pnpm-lock.yaml'),
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(`verify:structure: ${message}`);
}

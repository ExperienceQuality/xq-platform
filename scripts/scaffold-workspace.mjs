#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

if (isMainModule()) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await scaffoldWorkspace({ root, ...options });
    console.log(`Created ${result.type} workspace at ${result.directory}`);
    console.log(
      'Next: run pnpm install, then add the workspace to root build/test/release contracts.',
    );
  } catch (error) {
    console.error(`scaffold: ${error.message}`);
    process.exitCode = 1;
  }
}

export async function scaffoldWorkspace({ root: workspaceRoot, type, name, packageName }) {
  const slug = validateSlug(name);
  if (type !== 'package' && type !== 'app') {
    throw new Error('--type must be "package" or "app"');
  }

  const directory = resolve(workspaceRoot, type === 'package' ? 'packages' : 'apps', slug);
  if (existsSync(directory)) throw new Error(`workspace already exists: ${directory}`);

  const qualifiedName = packageName ?? `@experiencequality/${slug}`;
  validatePackageName(qualifiedName);
  const relativeDirectory = `${type === 'package' ? 'packages' : 'apps'}/${slug}`;
  const files =
    type === 'package'
      ? packageTemplate({ qualifiedName, relativeDirectory })
      : appTemplate({ qualifiedName, relativeDirectory });

  for (const [relativePath, content] of Object.entries(files)) {
    const path = join(directory, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return { type, directory, files: Object.keys(files) };
}

function packageTemplate({ qualifiedName, relativeDirectory }) {
  return {
    'package.json': `${JSON.stringify(
      {
        name: qualifiedName,
        version: '0.1.0',
        private: false,
        repository: {
          type: 'git',
          url: 'https://github.com/ExperienceQuality/xq-platform.git',
          directory: relativeDirectory,
        },
        publishConfig: { registry: 'https://npm.pkg.github.com' },
        type: 'module',
        exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } },
        scripts: {
          build: 'tsc -b',
          check: 'tsc -p tsconfig.test.json --noEmit',
          test: 'vitest run',
        },
        engines: { node: '>=24' },
        files: ['dist', 'package.json'],
      },
      null,
      2,
    )}\n`,
    'src/index.ts': `export {};\n`,
    'test/index.test.ts': `import { describe, expect, it } from 'vitest';\n\ndescribe('${qualifiedName}', () => {\n  it('loads', () => {\n    expect(true).toBe(true);\n  });\n});\n`,
    'tsconfig.json': `${JSON.stringify(
      {
        extends: '../../tsconfig.base.json',
        compilerOptions: {
          composite: true,
          rootDir: 'src',
          outDir: 'dist',
          tsBuildInfoFile: '.tsbuildinfo',
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    )}\n`,
    'tsconfig.test.json': `${JSON.stringify(
      {
        extends: '../../tsconfig.test.base.json',
        compilerOptions: {
          composite: false,
          rootDir: '.',
          noEmit: true,
          declaration: false,
          declarationMap: false,
        },
        include: ['src/**/*.ts', 'test/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  };
}

function appTemplate({ qualifiedName, relativeDirectory }) {
  return {
    'package.json': `${JSON.stringify(
      {
        name: qualifiedName,
        version: '0.1.0',
        private: true,
        repository: {
          type: 'git',
          url: 'https://github.com/ExperienceQuality/xq-platform.git',
          directory: relativeDirectory,
        },
        type: 'module',
        scripts: { check: 'tsc -p tsconfig.json --noEmit', test: 'vitest run' },
        engines: { node: '>=24' },
      },
      null,
      2,
    )}\n`,
    'src/index.ts': `export {};\n`,
    'test/index.test.ts': `import { describe, expect, it } from 'vitest';\n\ndescribe('${qualifiedName}', () => {\n  it('loads', () => {\n    expect(true).toBe(true);\n  });\n});\n`,
    'tsconfig.json': `${JSON.stringify(
      {
        extends: '../../tsconfig.base.json',
        compilerOptions: { rootDir: '.', noEmit: true, declaration: false, declarationMap: false },
        include: ['src/**/*.ts', 'test/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  };
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith('--')) throw new Error(`unexpected argument ${argument}`);
    const key = argument.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for --${key}`);
    const normalizedKey = key === 'package-name' ? 'packageName' : key;
    values[normalizedKey] = value;
    index += 1;
  }
  if (!values.type || !values.name)
    throw new Error('usage: pnpm scaffold --type package|app --name <slug>');
  return values;
}

function validateSlug(value) {
  if (!value || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(`invalid workspace name ${JSON.stringify(value)}; use kebab-case`);
  }
  return value;
}

function validatePackageName(value) {
  if (!/^@experiencequality\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)) {
    throw new Error(
      `invalid package name ${JSON.stringify(value)}; use @experiencequality/<kebab-case>`,
    );
  }
}

function isMainModule() {
  return (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  );
}

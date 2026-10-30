import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { publishablePackages } from './publishable-packages.mjs';
import { lookupPublishedVersion } from './registry.mjs';
import { verifyReleaseVersion } from './verify-release-version.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultRegistry = 'https://npm.pkg.github.com';

if (isMainModule()) {
  try {
    const version = readPackageVersion(root, 'rest-client');
    const registry = process.env.NPM_CONFIG_REGISTRY ?? defaultRegistry;
    verifyPublishedPackages({ packageRoot: root, version, registry });
    console.log(`verified ${publishablePackages.length} packages at ${version}`);
  } catch (error) {
    console.error(`verify:published-packages: ${error.message}`);
    process.exitCode = 1;
  }
}

export function verifyPublishedPackages({
  packageRoot,
  version,
  registry = defaultRegistry,
  lookup = lookupPublishedVersion,
}) {
  verifyReleaseVersion(version, packageRoot);
  const missing = [];
  for (const packageDirectory of publishablePackages) {
    const packageJson = readPackage(packageRoot, packageDirectory);
    const publishedVersion = lookup(packageJson.name, version, registry);
    if (publishedVersion !== version) missing.push(packageJson.name);
  }
  if (missing.length > 0) {
    throw new Error(`missing published package versions: ${missing.join(', ')}`);
  }
}

function readPackageVersion(packageRoot, packageDirectory) {
  return readPackage(packageRoot, packageDirectory).version;
}

function readPackage(packageRoot, packageDirectory) {
  const path = resolve(packageRoot, 'packages', packageDirectory, 'package.json');
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`could not read ${path}: ${error.message}`);
  }
}

function isMainModule() {
  return (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  );
}

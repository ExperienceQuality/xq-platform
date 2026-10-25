import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyReleaseVersion } from './verify-release-version.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const publishablePackages = [
  'rest-client',
  'db',
  'stub',
  'core',
  'test',
  'test-browser',
  'test-infra',
];
const defaultRegistry = 'https://npm.pkg.github.com';

if (isMainModule()) {
  try {
    const version = process.env.RELEASE_VERSION;
    if (!version) throw new Error('RELEASE_VERSION is required');
    verifyReleaseVersion(version);
    const registry = process.env.NPM_CONFIG_REGISTRY ?? defaultRegistry;
    publishPackages({ packageRoot: root, version, registry });
  } catch (error) {
    console.error(`publish:packages: ${error.message}`);
    process.exitCode = 1;
  }
}

export function publishPackages({
  packageRoot,
  version,
  registry = defaultRegistry,
  lookup = lookupPublishedVersion,
  publish = publishPackage,
}) {
  const plan = createPublishPlan({ packageRoot, version, registry, lookup });
  for (const item of plan) {
    if (item.action === 'skip') {
      console.log(`Skipping ${item.name}@${version}; exact version is already published.`);
      continue;
    }
    publish(item, registry);
  }
  return plan;
}

export function createPublishPlan({ packageRoot, version, registry = defaultRegistry, lookup }) {
  const plan = [];
  for (const packageDirectory of publishablePackages) {
    const packageJson = readPackage(packageRoot, packageDirectory);
    if (packageJson.version !== version) {
      throw new Error(
        `${packageDirectory}/package.json has version ${JSON.stringify(packageJson.version)}; expected ${version}`,
      );
    }
    const publishedVersion = lookup(packageJson.name, version, registry);
    if (publishedVersion === version) {
      plan.push({ action: 'skip', packageDirectory, name: packageJson.name });
      continue;
    }
    if (publishedVersion !== null) {
      throw new Error(
        `registry returned ${JSON.stringify(publishedVersion)} for ${packageJson.name}@${version}`,
      );
    }
    plan.push({ action: 'publish', packageDirectory, name: packageJson.name });
  }
  return plan;
}

export function lookupPublishedVersion(
  name,
  version,
  registry = defaultRegistry,
  run = execFileSync,
) {
  try {
    const output = run(
      'pnpm',
      ['view', `${name}@${version}`, 'version', '--json', '--registry', registry],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
    return JSON.parse(output) === version ? version : JSON.parse(output);
  } catch (error) {
    const stderr = String(error.stderr ?? '');
    if (
      error.status === 1 &&
      /ERR_PNPM_FETCH_404|E404|404 Not Found|is not in this registry/i.test(stderr)
    )
      return null;
    throw new Error(`could not inspect ${name}@${version}: ${stderr.trim() || error.message}`);
  }
}

export function publishPackage(
  { packageDirectory, name },
  registry = defaultRegistry,
  run = execFileSync,
) {
  run('pnpm', ['--filter', name, 'publish', '--registry', registry], {
    cwd: root,
    stdio: 'inherit',
  });
  console.log(`Published ${name} from packages/${packageDirectory}.`);
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

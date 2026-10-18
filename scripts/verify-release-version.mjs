import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publishablePackages = ['rest-client', 'db', 'stub', 'core', 'test', 'test-browser'];
const internalPackageNames = new Set(
  publishablePackages.map((name) => `@experiencequality/${name}`),
);
const versionPattern = /^\d+\.\d+\.\d+$/;
const tagPattern = /^v(\d+\.\d+\.\d+)$/;

if (isMainModule()) {
  try {
    const version = resolveReleaseVersion(process.argv.slice(2), process.env);
    verifyReleaseVersion(version);
    console.log(
      `release version ${version} matches all ${publishablePackages.length} publishable packages and internal dependencies`,
    );
  } catch (error) {
    console.error(`verify:release-version: ${error.message}`);
    process.exitCode = 1;
  }
}

export function verifyReleaseVersion(version, packageRoot = root) {
  if (!versionPattern.test(version)) {
    throw new Error(
      `release version must use MAJOR.MINOR.PATCH, received ${JSON.stringify(version)}`,
    );
  }

  const packages = new Map();
  for (const packageDirectory of publishablePackages) {
    const packagePath = resolve(packageRoot, 'packages', packageDirectory, 'package.json');
    const packageJson = readJson(packagePath);
    packages.set(packageJson.name, { packageDirectory, packageJson });

    if (packageJson.version !== version) {
      throw new Error(
        `${packageDirectory}/package.json has version ${JSON.stringify(packageJson.version)}; expected ${version}`,
      );
    }
  }

  for (const { packageDirectory, packageJson } of packages.values()) {
    for (const [dependencyName, dependencyVersion] of Object.entries(
      packageJson.dependencies ?? {},
    )) {
      if (!internalPackageNames.has(dependencyName)) continue;
      if (dependencyVersion !== 'workspace:*') {
        throw new Error(
          `${packageDirectory}/package.json declares ${dependencyName} at ${JSON.stringify(dependencyVersion)}; expected workspace:* in the source manifest`,
        );
      }
    }
  }
}

export function resolveReleaseVersion(args, environment = process.env) {
  const context = parseArguments(args);
  const tag =
    context.tag ??
    environment.RELEASE_TAG ??
    environment.GITHUB_REF_NAME ??
    refTag(environment.GITHUB_REF);
  const suppliedVersion = context.version ?? environment.RELEASE_VERSION;
  const tagVersion = tag === undefined ? undefined : versionFromTag(tag);

  if (suppliedVersion !== undefined) {
    if (!versionPattern.test(suppliedVersion)) {
      throw new Error(
        `release version must use MAJOR.MINOR.PATCH, received ${JSON.stringify(suppliedVersion)}`,
      );
    }
    if (tagVersion !== undefined && suppliedVersion !== tagVersion) {
      throw new Error(`release version ${suppliedVersion} does not match release tag ${tag}`);
    }
    return suppliedVersion;
  }

  if (tagVersion !== undefined) return tagVersion;
  throw new Error(
    'release context is required; pass --version 1.2.3, --tag v1.2.3, or set RELEASE_VERSION/RELEASE_TAG',
  );
}

function parseArguments(args) {
  const context = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--version' || argument === '--tag') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      context[argument.slice(2)] = value;
      index += 1;
    } else if (argument.startsWith('--')) {
      throw new Error(`unknown option ${argument}`);
    } else if (context.tag === undefined && context.version === undefined) {
      if (tagPattern.test(argument)) context.tag = argument;
      else context.version = argument;
    } else {
      throw new Error(`unexpected argument ${argument}`);
    }
  }
  return context;
}

function versionFromTag(tag) {
  const match = tagPattern.exec(tag);
  if (!match)
    throw new Error(`release tag must use vMAJOR.MINOR.PATCH, received ${JSON.stringify(tag)}`);
  return match[1];
}

function refTag(ref) {
  if (!ref) return undefined;
  return ref.startsWith('refs/tags/') ? ref.slice('refs/tags/'.length) : undefined;
}

function readJson(path) {
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

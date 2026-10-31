import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const EXPECTED_NAME = '@experiencequality/test-infra';
const EXPECTED_REGISTRY = 'https://npm.pkg.github.com';
const EXPECTED_BIN_TARGET = './dist/bin/xq-infra.js';
const EXPECTED_LICENSE_SHA256 = 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4';
const EXPECTED_UPSTREAM_URL = 'https://github.com/chauhaidang/xq-test-infra';
const EXPECTED_UPSTREAM_COMMIT = '3d74803af7b71c9e946523ac7dd6d6e695cc8f07';

const REQUIRED_ENTRIES = [
  'package/package.json',
  'package/dist/bin/xq-infra.js',
  'package/dist/cli/index.js',
  'package/dist/types.js',
  'package/dist/services/serviceLoader.js',
  'package/dist/services/gateway.js',
  'package/dist/services/composeGenerator.js',
  'package/dist/services/composeInvoker.js',
  'package/dist/services/registryAuth.js',
  'package/LICENSE',
  'package/UPSTREAM.md',
];

const FORBIDDEN_PATTERNS = [
  /(^|\/)node_modules(\/|$)/,
  /(^|\/)(src|test|tests|coverage|demo|demos|examples|env-registry)(\/|$)/,
  /\.test\./,
  /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/,
  /(^|\/)(tsconfig|vitest\.config|eslint\.config|jest\.config)[^/]*$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.env(\.|$)/,
];

const CLI_TIMEOUT_MS = 30_000;
const INSTALL_TIMEOUT_MS = 300_000;

if (isMainModule()) {
  try {
    const { archive, consumerSmoke } = parseInfraVerifyArgs(process.argv.slice(2));
    const sourceManifest = JSON.parse(
      readFileSync(resolve(root, 'packages/test-infra/package.json'), 'utf8'),
    );
    const inspection = inspectInfraArchive(archive);
    assertInfraArchiveContents({ ...inspection, expectedVersion: sourceManifest.version });
    console.log(`verified archive contents for ${archive}`);
    if (consumerSmoke) {
      const consumerDir = await verifyInfraConsumer(archive);
      console.log(`consumer smoke passed (cleaned up ${consumerDir})`);
    }
  } catch (error) {
    console.error(`verify:infra-package: ${error.message}`);
    process.exitCode = 1;
  }
}

export function parseInfraVerifyArgs(args) {
  const parsed = { archive: undefined, consumerSmoke: false };
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--archive') {
      const value = args[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--archive requires a value');
      parsed.archive = value;
      index += 1;
    } else if (argument === '--consumer-smoke') {
      parsed.consumerSmoke = true;
    } else {
      throw new Error(`unknown option ${argument}`);
    }
  }
  if (parsed.archive === undefined) throw new Error('--archive <tarball> is required');
  if (!isAbsolute(parsed.archive)) throw new Error('--archive must be an absolute path');
  return parsed;
}

export function assertInfraArchiveContents({
  manifest,
  entries,
  binMode,
  binSource,
  license,
  provenance,
  expectedVersion,
}) {
  assert.equal(manifest.name, EXPECTED_NAME, `package must be named ${EXPECTED_NAME}`);
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/, 'manifest version must be semver');
  if (expectedVersion !== undefined) {
    assert.equal(
      manifest.version,
      expectedVersion,
      `manifest version ${manifest.version} must match source manifest ${expectedVersion}`,
    );
  }
  assert.equal(manifest.type, 'module', 'package must be an ES module package');
  assert.equal(manifest.engines?.node, '>=24', 'engines.node must be >=24');
  assert.equal(
    manifest.bin?.['xq-infra'],
    EXPECTED_BIN_TARGET,
    `bin.xq-infra must be ${EXPECTED_BIN_TARGET}`,
  );
  assert.equal(
    manifest.publishConfig?.registry,
    EXPECTED_REGISTRY,
    `publishConfig.registry must be ${EXPECTED_REGISTRY}`,
  );
  assert.equal(manifest.scripts?.build, 'tsc -b', 'scripts.build must be tsc -b');
  assert.equal(
    manifest.scripts?.check,
    'tsc -p tsconfig.test.json --noEmit',
    'scripts.check must be tsc -p tsconfig.test.json --noEmit',
  );
  assert.equal(
    manifest.scripts?.test,
    'vitest run --config vitest.config.ts',
    'scripts.test must be vitest run --config vitest.config.ts',
  );

  for (const entry of entries) {
    assertSafeEntry(entry);
  }
  for (const required of REQUIRED_ENTRIES) {
    assert(entries.includes(required), `archive is missing required entry ${required}`);
  }
  for (const entry of entries) {
    for (const pattern of FORBIDDEN_PATTERNS) {
      assert(!pattern.test(entry), `archive must not include forbidden entry ${entry}`);
    }
  }

  assert.match(binMode, /^-[rwxstST-]{9}/, `bin file must be a regular file, got mode ${binMode}`);
  assert(
    binMode.slice(1, 10).includes('x'),
    `bin file mode ${binMode} must mark the file executable`,
  );
  assert(
    binSource.startsWith('#!/usr/bin/env node'),
    'compiled bin must start with the #!/usr/bin/env node shebang',
  );

  assert.match(license, /Apache License/, 'LICENSE must contain Apache License text');
  assert.match(license, /Version 2\.0/, 'LICENSE must contain Version 2.0');
  assert.equal(
    createHash('sha256').update(license).digest('hex'),
    EXPECTED_LICENSE_SHA256,
    'LICENSE must be byte-identical to the upstream Apache-2.0 license',
  );

  assert(
    provenance.includes(EXPECTED_UPSTREAM_URL),
    `UPSTREAM.md must name ${EXPECTED_UPSTREAM_URL}`,
  );
  assert(
    provenance.includes(EXPECTED_UPSTREAM_COMMIT),
    `UPSTREAM.md must pin upstream commit ${EXPECTED_UPSTREAM_COMMIT}`,
  );
  assert.match(provenance, /Apache-2\.0/, 'UPSTREAM.md must record the Apache-2.0 license');
}

export function inspectInfraArchive(archive, { run = runProcess } = {}) {
  const entries = tarRead(run, ['-tzf', archive])
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((entry) => entry.replace(/\/$/, ''));
  for (const entry of entries) {
    assertSafeEntry(entry);
  }

  const verbose = tarRead(run, ['-tvzf', archive, 'package/dist/bin/xq-infra.js']).trim();
  const binMode = verbose.split('\n').at(-1)?.split(/\s+/)[0];
  assert(binMode, `could not determine file mode for package/dist/bin/xq-infra.js in ${archive}`);

  return {
    manifest: JSON.parse(tarRead(run, ['-xOf', archive, 'package/package.json'])),
    entries,
    binMode,
    binSource: tarRead(run, ['-xOf', archive, 'package/dist/bin/xq-infra.js']),
    license: tarRead(run, ['-xOf', archive, 'package/LICENSE']),
    provenance: tarRead(run, ['-xOf', archive, 'package/UPSTREAM.md']),
  };
}

export async function verifyInfraConsumer(archive, { run = runProcess } = {}) {
  const consumer = await mkdtemp(join(tmpdir(), 'xq-infra-consumer-'));
  const storeDir = join(consumer, '.pnpm-store');
  let succeeded = false;
  try {
    await writeFile(
      join(consumer, 'package.json'),
      `${JSON.stringify(
        {
          name: 'xq-infra-consumer-smoke',
          version: '0.0.0',
          private: true,
          type: 'module',
          dependencies: { [EXPECTED_NAME]: `file:${archive}` },
        },
        null,
        2,
      )}\n`,
    );
    const env = consumerEnv();
    const install = run('pnpm', ['install', '--ignore-scripts', '--store-dir', storeDir], {
      cwd: consumer,
      env,
      timeout: INSTALL_TIMEOUT_MS,
    });
    assert.equal(install.status, 0, `consumer install failed\n${install.stderr}`);

    const bin = join(consumer, 'node_modules', '.bin', 'xq-infra');
    assert(existsSync(bin), `consumer must link ${bin}`);

    const help = run(bin, ['--help'], { cwd: consumer, env, timeout: CLI_TIMEOUT_MS });
    assert.equal(help.status, 0, `xq-infra --help failed\n${help.stderr}`);
    assert.match(help.stdout, /CLI to generate docker-compose and manage test infra/);

    const manifest = JSON.parse(tarRead(run, ['-xOf', archive, 'package/package.json']));
    const version = run(bin, ['--version'], { cwd: consumer, env, timeout: CLI_TIMEOUT_MS });
    assert.equal(version.status, 0, `xq-infra --version failed\n${version.stderr}`);
    assert.equal(version.stdout.trim(), manifest.version);

    // pnpm keeps the package's own deps beside its realpath under .pnpm/.
    const infraManifestPath = await realpath(
      join(consumer, 'node_modules', '@experiencequality', 'test-infra', 'package.json'),
    );
    const requireFromInfra = createRequire(infraManifestPath);
    const { parse: parseYaml } = requireFromInfra('yaml');

    const singleSpec = `portRange:\n  start: 4100\nservices:\n  api:\n    image: node\n    tag: 18-alpine\n    port: 3000\n    depends_on:\n      - db\n  db:\n    image: postgres\n    tag: "15"\n    ports:\n      - "5432:5432"\n`;

    // Single-file spec without a gateway.
    const specPath = join(consumer, 'spec.yaml');
    await writeFile(specPath, singleSpec);
    const noGateway = run(bin, ['generate', '-f', specPath, '--no-gateway'], {
      cwd: consumer,
      env,
      timeout: CLI_TIMEOUT_MS,
    });
    assert.equal(noGateway.status, 0, `generate --no-gateway failed\n${noGateway.stderr}`);
    const noGatewayCompose = parseYaml(await readFile(join(consumer, 'xq-compose.yml'), 'utf8'));
    assert.equal(noGatewayCompose.version, '3.8');
    assert.equal(noGatewayCompose.services.api.image, 'node:18-alpine');
    assert.deepEqual(noGatewayCompose.services.api.networks, ['xq-network']);
    assert.deepEqual(noGatewayCompose.services.api.ports, ['4100:3000']);
    assert.deepEqual(noGatewayCompose.services.api.depends_on, ['db']);
    assert.equal(noGatewayCompose.services.db.image, 'postgres:15');
    assert.deepEqual(noGatewayCompose.services.db.ports, ['5432:5432']);
    assert.equal(noGatewayCompose.services['xq-gateway'], undefined);
    // WireMock is attached by default even without a gateway.
    assert.equal(noGatewayCompose.services['xq-wiremock'].image, 'wiremock/wiremock:3.13.1');
    assert.deepEqual(noGatewayCompose.services['xq-wiremock'].ports, ['18080:8080']);
    assert.equal(noGatewayCompose.services['xq-wiremock'].volumes, undefined);
    assert.equal(
      noGatewayCompose.services.api.environment.WIREMOCK_BASE_URL,
      'http://xq-wiremock:8080',
    );
    assert.equal(
      noGatewayCompose.services.db.environment.WIREMOCK_BASE_URL,
      'http://xq-wiremock:8080',
    );
    assert.deepEqual(noGatewayCompose.networks, { 'xq-network': { driver: 'bridge' } });
    assert(!existsSync(join(consumer, 'nginx-gateway.conf')));

    // Single-file spec with the default gateway.
    const withGateway = run(bin, ['generate', '-f', specPath], {
      cwd: consumer,
      env,
      timeout: CLI_TIMEOUT_MS,
    });
    assert.equal(withGateway.status, 0, `generate failed\n${withGateway.stderr}`);
    const consumerRealpath = await realpath(consumer);
    const gatewayCompose = parseYaml(await readFile(join(consumer, 'xq-compose.yml'), 'utf8'));
    assert.equal(gatewayCompose.services['xq-gateway'].image, 'nginx:alpine');
    assert.deepEqual(gatewayCompose.services['xq-gateway'].volumes, [
      `${consumerRealpath}/nginx-gateway.conf:/etc/nginx/nginx.conf:ro`,
    ]);
    assert.deepEqual(gatewayCompose.services['xq-gateway'].depends_on, {
      api: { condition: 'service_started' },
      db: { condition: 'service_started' },
      'xq-wiremock': { condition: 'service_healthy' },
    });
    const nginxConf = await readFile(join(consumer, 'nginx-gateway.conf'), 'utf8');
    assert.match(nginxConf, /upstream api_upstream \{\n {4}server api:3000;\n\}/);
    assert.match(nginxConf, /upstream db_upstream \{\n {4}server db:5432;\n\}/);
    assert.match(nginxConf, /location \/api\/ \{\n {8}proxy_pass http:\/\/api_upstream\/;/);
    assert.match(nginxConf, /location \/db\/ \{\n {8}proxy_pass http:\/\/db_upstream\/;/);

    // A directory spec with the same services must produce identical parsed output.
    const servicesDir = join(consumer, 'services');
    await mkdir(servicesDir, { recursive: true });
    await writeFile(
      join(servicesDir, 'api.service.yml'),
      `name: api\nimage: node\ntag: 18-alpine\nport: 3000\ndepends_on:\n  - db\n`,
    );
    await writeFile(
      join(servicesDir, 'db.service.yml'),
      `name: db\nimage: postgres\ntag: "15"\nports:\n  - "5432:5432"\n`,
    );
    await writeFile(join(servicesDir, 'xq.config.yml'), `portRange:\n  start: 4100\n`);
    const fromDirectory = run(bin, ['generate', '-f', servicesDir, '--no-gateway'], {
      cwd: consumer,
      env,
      timeout: CLI_TIMEOUT_MS,
    });
    assert.equal(fromDirectory.status, 0, `directory generate failed\n${fromDirectory.stderr}`);
    const directoryCompose = parseYaml(await readFile(join(consumer, 'xq-compose.yml'), 'utf8'));
    assert.deepEqual(directoryCompose, noGatewayCompose);

    // An overrides file adjusts a service while preserving the rest of the spec.
    const overridesPath = join(consumer, 'overrides.json');
    await writeFile(
      overridesPath,
      `${JSON.stringify({ services: { api: { tag: '20-alpine' } } })}\n`,
    );
    const withOverrides = run(
      bin,
      ['generate', '-f', specPath, '--no-gateway', '--overrides', overridesPath],
      { cwd: consumer, env, timeout: CLI_TIMEOUT_MS },
    );
    assert.equal(withOverrides.status, 0, `overrides generate failed\n${withOverrides.stderr}`);
    const overridden = parseYaml(await readFile(join(consumer, 'xq-compose.yml'), 'utf8'));
    assert.equal(overridden.services.api.image, 'node:20-alpine');
    assert.equal(overridden.services.db.image, 'postgres:15');

    // --no-wiremock opts out of the default WireMock injection.
    const noWiremock = run(bin, ['generate', '-f', specPath, '--no-gateway', '--no-wiremock'], {
      cwd: consumer,
      env,
      timeout: CLI_TIMEOUT_MS,
    });
    assert.equal(noWiremock.status, 0, `generate --no-wiremock failed\n${noWiremock.stderr}`);
    const noWiremockCompose = parseYaml(await readFile(join(consumer, 'xq-compose.yml'), 'utf8'));
    assert.equal(noWiremockCompose.services['xq-wiremock'], undefined);
    assert.equal(noWiremockCompose.services.api.environment, undefined);

    // Failure paths keep exit code 2.
    const missingSpec = run(bin, ['generate', '-f', join(consumer, 'missing.yaml')], {
      cwd: consumer,
      env,
      timeout: CLI_TIMEOUT_MS,
    });
    assert.equal(
      missingSpec.status,
      2,
      `missing spec must exit 2\n${missingSpec.stdout}\n${missingSpec.stderr}`,
    );
    assert.match(missingSpec.stderr, /Failed to generate compose file:/);

    const badOverrides = join(consumer, 'bad-overrides.json');
    await writeFile(badOverrides, 'not json');
    const malformedOverrides = run(bin, ['generate', '-f', specPath, '--overrides', badOverrides], {
      cwd: consumer,
      env,
      timeout: CLI_TIMEOUT_MS,
    });
    assert.equal(
      malformedOverrides.status,
      2,
      `bad overrides must exit 2\n${malformedOverrides.stdout}\n${malformedOverrides.stderr}`,
    );
    assert.match(malformedOverrides.stderr, /Failed to load overrides file:/);

    succeeded = true;
    return consumer;
  } finally {
    if (succeeded) {
      await rm(consumer, { recursive: true, force: true });
    } else {
      console.error(`consumer smoke failed; evidence preserved at ${consumer}`);
    }
  }
}

function assertSafeEntry(entry) {
  assert(
    !entry.startsWith('/') && !entry.split('/').includes('..') && !entry.includes('\\'),
    `archive contains an unsafe entry (absolute path or traversal): ${entry}`,
  );
}

function tarRead(run, args) {
  const result = run('tar', args);
  if (result.error || result.status !== 0) {
    throw new Error(
      `tar ${args.join(' ')} failed\n${result.stdout ?? ''}\n${result.stderr ?? ''}${result.error?.message ?? ''}`,
    );
  }
  return result.stdout;
}

function consumerEnv() {
  const env = { ...process.env };
  delete env.NODE_PATH;
  return env;
}

function runProcess(command, args, { cwd, env, timeout } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: env ?? { ...process.env },
    encoding: 'utf8',
    timeout,
  });
  if (result.error) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.error.message}`);
  }
  return result;
}

function isMainModule() {
  return (
    process.argv[1] !== undefined &&
    import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  );
}

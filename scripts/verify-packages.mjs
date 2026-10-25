import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  assertInfraArchiveContents,
  inspectInfraArchive,
  verifyInfraConsumer,
} from './verify-infra-package.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = resolve(root, 'artifacts');
const packageNames = [
  '@experiencequality/rest-client',
  '@experiencequality/db',
  '@experiencequality/stub',
  '@experiencequality/core',
  '@experiencequality/test',
  '@experiencequality/test-browser',
  '@experiencequality/test-infra',
];
const documentedBrowserSubpaths = ['./config', './package.json'];
const documentedTestSubpaths = [
  './vitest/config',
  './cucumber',
  './cucumber/config',
  './cucumber/plugin',
  './cucumber/json',
  './package.json',
];
const consumer = await mkdtemp(join(tmpdir(), 'xq-test-consumer-'));
const pnpmStore = resolve(consumer, '.pnpm-store');

try {
  run('pnpm', ['run', 'build'], root);
  await mkdir(artifacts, { recursive: true });
  const artifactRun = await mkdtemp(join(artifacts, 'packages-'));

  for (const packageName of packageNames) {
    run('pnpm', ['--filter', packageName, 'pack', '--pack-destination', artifactRun], root);
  }

  const archives = (await readdir(artifactRun))
    .filter((name) => name.endsWith('.tgz'))
    .sort()
    .map((name) => resolve(artifactRun, name));
  if (archives.length !== packageNames.length) {
    throw new Error(`expected ${packageNames.length} package archives, found ${archives.length}`);
  }
  const archiveByPackageName = Object.fromEntries(
    archives.map((archive) => [
      JSON.parse(readArchiveFile(archive, 'package/package.json')).name,
      archive,
    ]),
  );

  // Given a package archive produced by pnpm pack,
  // When its manifest and file list are inspected,
  // Then every declared public target must resolve and private source must be absent.
  for (const archive of archives) {
    await assertPackedPackageContract(archive);
  }

  const infraArchive = archiveByPackageName['@experiencequality/test-infra'];
  if (!infraArchive) throw new Error('missing @experiencequality/test-infra archive');
  const infraSourceManifest = JSON.parse(
    await readFile(resolve(root, 'packages/test-infra/package.json'), 'utf8'),
  );
  assertInfraArchiveContents({
    ...inspectInfraArchive(infraArchive),
    expectedVersion: infraSourceManifest.version,
  });
  await verifyInfraConsumer(infraArchive);

  await writeFile(
    join(consumer, 'package.json'),
    `${JSON.stringify(
      {
        name: 'xq-test-package-smoke',
        version: '0.0.0',
        private: true,
        type: 'module',
        dependencies: {
          ...Object.fromEntries(
            packageNames.map((packageName) => [
              packageName,
              `file:${archiveByPackageName[packageName]}`,
            ]),
          ),
          '@cucumber/cucumber': '^13.2.1',
          '@playwright/test': '^1.64.0',
          vitest: '^4.0.0',
          typescript: '^5.9.0',
          '@types/node': '^24.0.0',
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(consumer, 'pnpm-workspace.yaml'),
    `overrides:\n${packageNames
      .map(
        (packageName) =>
          `  ${JSON.stringify(packageName)}: file:${archiveByPackageName[packageName]}`,
      )
      .join('\n')}\n`,
  );
  await writeFile(
    join(consumer, 'tsconfig.json'),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2023',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          types: ['node'],
        },
        include: ['vitest.config.ts', 'test/**/*.ts'],
      },
      null,
      2,
    )}\n`,
  );
  await mkdir(join(consumer, 'test'), { recursive: true });
  await writeFile(
    join(consumer, 'vitest.config.ts'),
    `import { defineConfig } from '@experiencequality/test/vitest/config';

export default defineConfig({
  databases: { orders: { urlEnv: 'PACKAGE_SMOKE_DATABASE_URL', defaultSchema: 'sales' } },
  test: { include: ['test/**/*.test.ts'] }
});
`,
  );
  await writeFile(
    join(consumer, 'test', 'package-imports.test.ts'),
    `import * as root from '@experiencequality/test';
import type { Kysely } from '@experiencequality/db';
import { expect, test } from '@experiencequality/test/vitest';
import { defineConfig } from '@experiencequality/test/vitest/config';
import { CUCUMBER_REPORT_PATH } from '@experiencequality/test/cucumber';
import { defineCucumberConfig } from '@experiencequality/test/cucumber/config';

interface OrdersDatabase {
  orders: { id: number; status: string };
}

test('loads every public package entrypoint from packed archives', ({ kit }) => {
  expect(root.test).toBe(test);
  expect(root.expect).toBe(expect);
  expect(root.defineConfig).toBe(defineConfig);
  expect(CUCUMBER_REPORT_PATH).toBe('artifacts/index.html');
  expect(defineCucumberConfig({ steps: 'features/steps/**/*.ts' }).format)
    .toEqual(['progress', ['html', CUCUMBER_REPORT_PATH]]);
  expect(defineCucumberConfig({
    steps: 'features/steps/**/*.ts',
    reportPath: 'reports/custom-cucumber.html'
  }).format).toEqual(['progress', ['html', 'reports/custom-cucumber.html']]);
  expect(kit.api).toBeDefined();
  const orders = kit.db.get<OrdersDatabase>('orders');
  expect(orders.selectFrom('orders').select('status').compile().sql)
    .toBe('select "status" from "sales"."orders"');
  expect(defineConfig()).toBeDefined();
});
`,
  );
  await mkdir(join(consumer, 'features/steps'), { recursive: true });
  await writeFile(
    join(consumer, 'cucumber.mjs'),
    `import { CUCUMBER_REPORT_PATH } from '@experiencequality/test/cucumber';
import { defineCucumberConfig } from '@experiencequality/test/cucumber/config';

export default defineCucumberConfig({
  steps: 'features/steps/**/*.ts',
  reportPath: process.env.XQ_CUCUMBER_REPORT_PATH ?? CUCUMBER_REPORT_PATH
});
`,
  );
  await writeFile(
    join(consumer, 'features/order.feature'),
    `Feature: Packed Cucumber consumer

  @smoke
  Scenario: compose nested JSON
    Given a fresh company scenario context
    When I compose this body:
      | customer.id | items[0].sku |
      | "cust-123"  | "SKU-1"      |
    Then the body contains the nested customer

  @response-table
  Scenario: assert the packed order from the request builder
    Given a fresh company scenario context
    When I retrieve the packed order expecting:
      | id  | customer.id | customer.name | customer.email      | items[0].sku | items[0].quantity | status    |
      | 123 | "cust-123"  | "Ada"         | "ada@example.test" | "SKU-1"      | 2                 | "created" |

  @response-table
  Scenario: assert multiple packed response paths without repeating the request
    Given a fresh company scenario context
    When I retrieve the packed order
    Then response JSON at "$.customer" exactly matches:
      | id         | name  | email               |
      | "cust-123" | "Ada" | "ada@example.test" |
    And response JSON at "items[0]" contains:
      | sku     | quantity |
      | "SKU-1" | 2        |
`,
  );
  await writeFile(
    join(consumer, 'features/steps/order.steps.ts'),
    `import assert from 'node:assert/strict';
import { Given, Then, When, type DataTable } from '@cucumber/cucumber';
import { assertJsonTable, composeJsonTable, expectJsonTable, type JsonTableResponse, type XqWorld } from '@experiencequality/test/cucumber';

type OrderWorld = XqWorld & { body?: unknown };
type ResponseWorld = XqWorld & { orderResponse?: JsonTableResponse };

Given('a fresh company scenario context', function (this: XqWorld) {
  assert.ok(this.run.id);
  assert.ok(this.api);
});

When('I compose this body:', function (this: OrderWorld, table: DataTable) {
  this.body = composeJsonTable(table);
});

Then('the body contains the nested customer', function (this: OrderWorld) {
  assert.deepEqual(this.body, { customer: { id: 'cust-123' }, items: [{ sku: 'SKU-1' }] });
});

When('I retrieve the packed order expecting:', async function (this: XqWorld, table: DataTable) {
  await expectJsonTable(this.api.get('/orders/123'), table, { mode: 'exact' }).expectStatus(200);
});

When('I retrieve the packed order', async function (this: ResponseWorld) {
  const orderSpec = this.api.get('/orders/123').expectStatus(200);
  this.orderResponse = await orderSpec;
});

Then('response JSON at {string} exactly matches:', async function (this: ResponseWorld, path: string, table: DataTable) {
  if (!this.orderResponse) throw new Error('order request has not executed');
  await assertJsonTable(this.orderResponse, table, { mode: 'exact', path });
});

Then('response JSON at {string} contains:', async function (this: ResponseWorld, path: string, table: DataTable) {
  if (!this.orderResponse) throw new Error('order request has not executed');
  await assertJsonTable(this.orderResponse, table, { mode: 'contains', path });
});
`,
  );

  run('pnpm', ['install', '--ignore-scripts', '--store-dir', pnpmStore], consumer);
  // Given a fresh consumer installed only from packed archives,
  // When each public package root is imported,
  // Then package resolution must work without workspace links.
  for (const packageName of packageNames) {
    // The CLI-only infra package has no root module export; resolve its manifest instead.
    const specifier =
      packageName === '@experiencequality/test-infra'
        ? '@experiencequality/test-infra/package.json'
        : packageName;
    run(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `if (!import.meta.resolve(${JSON.stringify(specifier)})) throw new Error('package did not resolve')`,
      ],
      consumer,
    );
  }
  run(resolve(consumer, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], consumer);
  run(
    resolve(consumer, 'node_modules/.bin/vitest'),
    ['run', '--config', 'vitest.config.ts'],
    consumer,
    {
      PACKAGE_SMOKE_DATABASE_URL: 'postgres://test:test@127.0.0.1:1/test',
    },
  );
  const cucumberEvents = join(consumer, 'cucumber-events.ndjson');
  run(resolve(consumer, 'node_modules/.bin/cucumber-js'), ['--tags', '@smoke'], consumer, {
    XQ_TEST_BASE_URL: 'http://127.0.0.1:4000',
    XQ_CUCUMBER_EVENTS_FILE: cucumberEvents,
  });
  const events = (await readFile(cucumberEvents, 'utf8'))
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    events.map((event) => event.event),
    ['scenario.started', 'scenario.finished'],
  );
  assert.equal(events[0].name, 'compose nested JSON');
  assert.equal(events[1].status, 'PASSED');
  await assertHtmlReport(join(consumer, 'artifacts/index.html'), 'default packed Cucumber report');

  const customReport = join(consumer, 'reports', 'custom-cucumber.html');
  await runAsync(
    resolve(consumer, 'node_modules/.bin/cucumber-js'),
    ['--tags', '@smoke'],
    consumer,
    {
      XQ_TEST_BASE_URL: 'http://127.0.0.1:4000',
      XQ_CUCUMBER_REPORT_PATH: 'reports/custom-cucumber.html',
    },
  );
  await assertHtmlReport(customReport, 'custom packed Cucumber report');

  for (const subpath of documentedTestSubpaths) {
    const specifier = `@experiencequality/test${subpath.slice(1)}`;
    const importExpression =
      subpath === './package.json'
        ? `const packageJson = (await import(${JSON.stringify(specifier)}, { with: { type: 'json' } })).default; if (packageJson.name !== '@experiencequality/test') throw new Error('unexpected packed package metadata')`
        : `await import(${JSON.stringify(specifier)})`;
    run(process.execPath, ['--input-type=module', '-e', importExpression], consumer);
  }

  for (const subpath of documentedBrowserSubpaths) {
    const specifier = `@experiencequality/test-browser${subpath.slice(1)}`;
    const importExpression =
      subpath === './package.json'
        ? `const packageJson = (await import(${JSON.stringify(specifier)}, { with: { type: 'json' } })).default; if (packageJson.name !== '@experiencequality/test-browser') throw new Error('unexpected packed package metadata')`
        : `await import(${JSON.stringify(specifier)})`;
    run(process.execPath, ['--input-type=module', '-e', importExpression], consumer);
  }

  // Given the package exposes an explicit export map,
  // When an undocumented source or missing subpath is requested,
  // Then Node must reject the import instead of leaking an internal file.
  await assertImportFails(consumer, '@experiencequality/test/src/index.js');
  await assertImportFails(consumer, '@experiencequality/test/not-public');
  await assertImportFails(consumer, '@experiencequality/test-browser/src/index.js');
  await assertImportFails(consumer, '@experiencequality/test-browser/not-public');

  let orderRequests = 0;
  const api = createServer((_request, response) => {
    orderRequests += 1;
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      '{"id":123,"customer":{"id":"cust-123","name":"Ada","email":"ada@example.test"},"items":[{"sku":"SKU-1","quantity":2}],"status":"created"}',
    );
  });
  await new Promise((resolveListen, rejectListen) => {
    api.once('error', rejectListen);
    api.listen(0, '127.0.0.1', resolveListen);
  });
  const apiAddress = api.address();
  if (!apiAddress || typeof apiAddress === 'string')
    throw new Error('packed consumer API server failed to bind');
  try {
    const responseEvents = join(consumer, 'response-events.ndjson');
    await runAsync(
      resolve(consumer, 'node_modules/.bin/cucumber-js'),
      ['--tags', '@response-table'],
      consumer,
      {
        XQ_TEST_BASE_URL: `http://127.0.0.1:${apiAddress.port}`,
        XQ_CUCUMBER_EVENTS_FILE: responseEvents,
      },
    );
    const responseLifecycle = (await readFile(responseEvents, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.deepEqual(
      responseLifecycle
        .filter((event) => event.event === 'scenario.finished')
        .map((event) => event.status),
      ['PASSED', 'PASSED'],
    );
    assert.equal(orderRequests, 2, 'BDD path assertions should reuse one executed request');
  } finally {
    await new Promise((resolveClose, rejectClose) =>
      api.close((error) => (error ? rejectClose(error) : resolveClose())),
    );
  }

  console.log(
    `verified ${archives.length} archives in fresh NodeNext/Vitest and Cucumber consumers`,
  );
  console.log(`packed archives retained in ${artifactRun}`);
} finally {
  await rm(consumer, { recursive: true, force: true });
}

async function assertPackedPackageContract(archive) {
  const archiveEntries = listArchiveEntries(archive);
  const manifest = JSON.parse(readArchiveFile(archive, 'package/package.json'));
  const packagePrefix = `${manifest.name.replace(/^@/, '').replaceAll('/', '-')}-${manifest.version}.tgz`;

  assert.equal(
    archive.endsWith(packagePrefix),
    true,
    `${manifest.name} archive name must match its manifest`,
  );
  assert(
    archiveEntries.includes('package/package.json'),
    `${manifest.name} must include package.json`,
  );
  assert(
    archiveEntries.some((entry) => entry.startsWith('package/dist/')),
    `${manifest.name} must include dist`,
  );
  assert(
    !archiveEntries.some((entry) => /(^|\/)(src|test|tests|coverage)(\/|$)|\.test\./.test(entry)),
    `${manifest.name} must not include source or test files`,
  );
  assert(
    !archiveEntries.some((entry) => /(^|\/)(tsconfig|vitest\.config|eslint\.config)/.test(entry)),
    `${manifest.name} must not include development config files`,
  );

  for (const target of exportTargets(manifest.exports)) {
    assert(target.startsWith('./'), `${manifest.name} export target must be relative: ${target}`);
    assert(
      archiveEntries.includes(`package/${target.slice(2)}`),
      `${manifest.name} export target is missing from the archive: ${target}`,
    );
  }
}

function exportTargets(exportsField) {
  if (typeof exportsField === 'string') return [exportsField];
  if (!exportsField || typeof exportsField !== 'object') return [];
  return Object.values(exportsField).flatMap((value) => exportTargets(value));
}

function listArchiveEntries(archive) {
  const result = spawnSync('tar', ['-tzf', archive], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`could not inspect ${archive}\n${result.stderr}`);
  return result.stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((entry) => entry.replace(/\/$/, ''));
}

function readArchiveFile(archive, entry) {
  const result = spawnSync('tar', ['-xOf', archive, entry], { encoding: 'utf8' });
  if (result.status !== 0)
    throw new Error(`could not read ${entry} from ${archive}\n${result.stderr}`);
  return result.stdout;
}

async function assertImportFails(cwd, specifier) {
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', `await import(${JSON.stringify(specifier)})`],
    {
      cwd,
      encoding: 'utf8',
    },
  );
  assert.notEqual(result.status, 0, `${specifier} must not be importable`);
}

function run(command, args, cwd, extraEnvironment = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnvironment, npm_config_store_dir: pnpmStore },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  }
  if (result.stdout.trim()) process.stdout.write(result.stdout);
  if (result.stderr.trim()) process.stderr.write(result.stderr);
}

function runAsync(command, args, cwd, extraEnvironment = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...extraEnvironment, npm_config_store_dir: pnpmStore },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', rejectRun);
    child.once('close', (status) => {
      if (status === 0) {
        if (stdout.trim()) process.stdout.write(stdout);
        if (stderr.trim()) process.stderr.write(stderr);
        resolveRun();
      } else {
        rejectRun(new Error(`${command} ${args.join(' ')} failed\n${stdout}\n${stderr}`));
      }
    });
  });
}

async function assertHtmlReport(path, label) {
  let report;
  try {
    report = await readFile(path, 'utf8');
  } catch (error) {
    throw new Error(`${label} is missing at ${path}`, { cause: error });
  }
  assert(report.trim().length > 0, `${label} must be non-empty`);
  assert(/<html[\s>]/i.test(report), `${label} must contain an HTML document`);
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  assertInfraArchiveContents,
  inspectInfraArchive,
  parseInfraVerifyArgs,
} from './verify-infra-package.mjs';

// The committed LICENSE is the pinned upstream Apache-2.0 text (byte-identical).
const APACHE_LICENSE_TEXT = readFileSync(
  new URL('../packages/test-infra/LICENSE', import.meta.url),
  'utf8',
);
const APACHE_LICENSE_SHA256 = createHash('sha256').update(APACHE_LICENSE_TEXT).digest('hex');

const UPSTREAM_TEXT = `# Upstream

- Source repository: <https://github.com/chauhaidang/xq-test-infra>
- Pinned commit: \`3d74803af7b71c9e946523ac7dd6d6e695cc8f07\`
- Original package identity: \`@chauhaidang/xq-test-infra@1.0.3\`
- License: Apache-2.0 (see \`LICENSE\`)
`;

const VALID_ENTRIES = [
  'package/package.json',
  'package/dist/cli/index.js',
  'package/dist/bin/xq-infra.js',
  'package/dist/types.js',
  'package/dist/services/serviceLoader.js',
  'package/dist/services/gateway.js',
  'package/dist/services/composeGenerator.js',
  'package/dist/services/composeInvoker.js',
  'package/dist/services/registryAuth.js',
  'package/dist/bin/xq-infra.d.ts',
  'package/dist/bin/xq-infra.js.map',
  'package/dist/bin/xq-infra.d.ts.map',
  'package/LICENSE',
  'package/UPSTREAM.md',
  'package/README.md',
];

function validInspection(overrides = {}) {
  const { manifest: manifestOverrides, extraEntries, ...rest } = overrides;
  return {
    manifest: {
      name: '@experiencequality/test-infra',
      version: '1.0.3',
      type: 'module',
      engines: { node: '>=24' },
      bin: { 'xq-infra': './dist/bin/xq-infra.js' },
      publishConfig: { registry: 'https://npm.pkg.github.com' },
      scripts: {
        build: 'tsc -b',
        check: 'tsc -p tsconfig.test.json --noEmit',
        test: 'vitest run --config vitest.config.ts',
      },
      ...manifestOverrides,
    },
    entries: [...VALID_ENTRIES, ...(extraEntries ?? [])],
    binMode: '-rwxr-xr-x',
    binSource: '#!/usr/bin/env node\nimport main from "../cli/index.js";\n',
    license: APACHE_LICENSE_TEXT,
    provenance: UPSTREAM_TEXT,
    expectedVersion: '1.0.3',
    ...rest,
  };
}

test('accepts a well-formed test-infra archive inspection', () => {
  assert.equal(
    APACHE_LICENSE_SHA256,
    'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4',
  );
  assert.doesNotThrow(() => assertInfraArchiveContents(validInspection()));
});

test('rejects a wrong package name', () => {
  const inspection = validInspection({ manifest: { name: '@other/test-infra' } });
  assert.throws(() => assertInfraArchiveContents(inspection), /@experiencequality\/test-infra/);
});

test('rejects a manifest version mismatch against the source manifest', () => {
  const inspection = validInspection({ expectedVersion: '9.9.9' });
  assert.throws(() => assertInfraArchiveContents(inspection), /9\.9\.9/);
});

test('rejects a non-module manifest type', () => {
  const inspection = validInspection({ manifest: { type: 'commonjs' } });
  assert.throws(() => assertInfraArchiveContents(inspection), /module/);
});

test('rejects a missing Node >=24 engine floor', () => {
  const inspection = validInspection({ manifest: { engines: { node: '>=18' } } });
  assert.throws(() => assertInfraArchiveContents(inspection), />=24|engines/);
});

test('rejects a wrong bin mapping', () => {
  const inspection = validInspection({ manifest: { bin: { 'xq-infra': './dist/cli.js' } } });
  assert.throws(() => assertInfraArchiveContents(inspection), /\.\/dist\/bin\/xq-infra\.js/);
});

test('rejects a wrong publish registry', () => {
  const inspection = validInspection({
    manifest: { publishConfig: { registry: 'https://registry.npmjs.org' } },
  });
  assert.throws(() => assertInfraArchiveContents(inspection), /npm\.pkg\.github\.com/);
});

test('rejects a missing compiled bin entry', () => {
  const inspection = validInspection();
  inspection.entries = inspection.entries.filter(
    (entry) => entry !== 'package/dist/bin/xq-infra.js',
  );
  assert.throws(() => assertInfraArchiveContents(inspection), /dist\/bin\/xq-infra\.js/);
});

test('rejects a missing compiled CLI or service file', () => {
  for (const missing of [
    'package/dist/cli/index.js',
    'package/dist/services/serviceLoader.js',
    'package/dist/services/gateway.js',
    'package/dist/services/composeGenerator.js',
    'package/dist/services/composeInvoker.js',
    'package/dist/services/registryAuth.js',
  ]) {
    const inspection = validInspection();
    inspection.entries = inspection.entries.filter((entry) => entry !== missing);
    assert.throws(
      () => assertInfraArchiveContents(inspection),
      new RegExp(missing.replace(/[/.]/g, '\\$&')),
      `${missing} must be required`,
    );
  }
});

test('rejects a non-executable bin mode', () => {
  const inspection = validInspection({ binMode: '-rw-r--r--' });
  assert.throws(() => assertInfraArchiveContents(inspection), /executable|mode/);
});

test('rejects a bin without the node shebang', () => {
  const inspection = validInspection({ binSource: 'import main from "../cli/index.js";\n' });
  assert.throws(() => assertInfraArchiveContents(inspection), /shebang|env node/);
});

test('rejects a license without the exact Apache-2.0 hash', () => {
  const inspection = validInspection({ license: 'MIT License\n' });
  assert.throws(() => assertInfraArchiveContents(inspection), /license|Apache/i);
});

test('rejects provenance missing the upstream commit', () => {
  const inspection = validInspection({
    provenance: '# Upstream\n- Source repository: <https://github.com/chauhaidang/xq-test-infra>\n',
  });
  assert.throws(() => assertInfraArchiveContents(inspection), /3d74803|commit|upstream/i);
});

test('rejects forbidden archive members', () => {
  for (const forbidden of [
    'package/src/cli/index.ts',
    'package/test/cli.test.ts',
    'package/dist/cli/index.test.js',
    'package/tests/integration.js',
    'package/coverage/lcov.info',
    'package/demo/app.js',
    'package/examples/basic.yaml',
    'package/env-registry/config.yml',
    'package/node_modules/commander/index.js',
    'package/package-lock.json',
    'package/pnpm-lock.yaml',
    'package/tsconfig.json',
    'package/vitest.config.ts',
    'package/.npmrc',
    'package/.env',
  ]) {
    const inspection = validInspection({ extraEntries: [forbidden] });
    assert.throws(
      () => assertInfraArchiveContents(inspection),
      /forbidden|must not include/,
      `${forbidden} must be rejected`,
    );
  }
});

test('rejects absolute and path-traversal archive entries', () => {
  for (const hostile of ['/etc/passwd', 'package/../evil.js', 'package/dist/../../escape']) {
    const inspection = validInspection({ extraEntries: [hostile] });
    assert.throws(
      () => assertInfraArchiveContents(inspection),
      /unsafe|traversal|absolute/,
      `${hostile} must be rejected`,
    );
  }
});

test('inspectInfraArchive parses stubbed tar output without extracting', () => {
  const calls = [];
  const stubRun = (command, args) => {
    calls.push([command, args]);
    if (args[0] === '-tzf') {
      return { status: 0, stdout: VALID_ENTRIES.map((e) => `${e}/`).join('\n'), stderr: '' };
    }
    if (args[0] === '-tvzf') {
      return {
        status: 0,
        stdout: '-rwxr-xr-x  1 user  staff  396 Jan  1 00:00 package/dist/bin/xq-infra.js\n',
        stderr: '',
      };
    }
    if (args[0] === '-xOf') {
      const member = args[2];
      const content = {
        'package/package.json': JSON.stringify({
          name: '@experiencequality/test-infra',
          version: '1.0.3',
          type: 'module',
          engines: { node: '>=24' },
          bin: { 'xq-infra': './dist/bin/xq-infra.js' },
          publishConfig: { registry: 'https://npm.pkg.github.com' },
          scripts: {
            build: 'tsc -b',
            check: 'tsc -p tsconfig.test.json --noEmit',
            test: 'vitest run --config vitest.config.ts',
          },
        }),
        'package/dist/bin/xq-infra.js':
          '#!/usr/bin/env node\nimport main from "../cli/index.js";\n',
        'package/LICENSE': APACHE_LICENSE_TEXT,
        'package/UPSTREAM.md': UPSTREAM_TEXT,
      }[member];
      if (content === undefined) return { status: 1, stdout: '', stderr: 'not found' };
      return { status: 0, stdout: content, stderr: '' };
    }
    return { status: 1, stdout: '', stderr: 'unexpected tar invocation' };
  };

  const inspection = inspectInfraArchive('/tmp/fake.tgz', { run: stubRun });
  assert.equal(inspection.manifest.name, '@experiencequality/test-infra');
  assert.equal(inspection.binMode, '-rwxr-xr-x');
  assert.ok(inspection.entries.includes('package/dist/bin/xq-infra.js'));
  assert.doesNotThrow(() => assertInfraArchiveContents(inspection));
  // no extraction to disk: every call is a tar read of a named member
  assert.ok(calls.every(([command]) => command === 'tar'));
});

test('inspectInfraArchive rejects a hostile member list before reading', () => {
  const stubRun = (_command, args) => {
    if (args[0] === '-tzf') {
      return { status: 0, stdout: 'package/package.json\n../escape.sh\n', stderr: '' };
    }
    return { status: 0, stdout: '', stderr: '' };
  };
  assert.throws(() => inspectInfraArchive('/tmp/fake.tgz', { run: stubRun }), /unsafe|traversal/);
});

test('inspectInfraArchive surfaces tar failures', () => {
  const stubRun = () => ({ status: 1, stdout: '', stderr: 'tar: failed to open' });
  assert.throws(() => inspectInfraArchive('/tmp/fake.tgz', { run: stubRun }), /tar|failed to open/);
});

test('parseInfraVerifyArgs requires --archive and rejects unknown flags', () => {
  assert.throws(() => parseInfraVerifyArgs([]), /--archive/);
  assert.throws(() => parseInfraVerifyArgs(['--archive']), /requires a value|--archive/);
  assert.throws(() => parseInfraVerifyArgs(['--archive', 'rel.tgz']), /absolute/);
  assert.throws(() => parseInfraVerifyArgs(['--archive', '/a.tgz', '--nope']), /unknown option/);
  assert.deepEqual(parseInfraVerifyArgs(['--archive', '/a.tgz']), {
    archive: '/a.tgz',
    consumerSmoke: false,
  });
  assert.deepEqual(parseInfraVerifyArgs(['--archive', '/a.tgz', '--consumer-smoke']), {
    archive: '/a.tgz',
    consumerSmoke: true,
  });
});

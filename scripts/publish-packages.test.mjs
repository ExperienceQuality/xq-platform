import assert from 'node:assert/strict';
import test from 'node:test';

import { lookupPublishedVersion } from './registry.mjs';

function lookupFailure({ status = 1, stdout, stderr, message = 'pnpm view failed' } = {}) {
  const error = new Error(message);
  error.status = status;
  if (stdout !== undefined) error.stdout = stdout;
  if (stderr !== undefined) error.stderr = stderr;
  return error;
}

test('uses pnpm for registry lookup with the configured registry', () => {
  const calls = [];
  const version = lookupPublishedVersion(
    '@experiencequality/core',
    '1.0.3',
    'https://registry.example',
    (...args) => {
      calls.push(args);
      return '"1.0.3"';
    },
  );

  assert.equal(version, '1.0.3');
  assert.equal(calls[0][0], 'pnpm');
  assert.deepEqual(calls[0][1], [
    'view',
    '@experiencequality/core@1.0.3',
    'version',
    '--json',
    '--registry',
    'https://registry.example',
  ]);
});

test('treats pnpm not-found lookup failures in stderr as unpublished packages', () => {
  assert.equal(
    lookupPublishedVersion(
      '@experiencequality/missing',
      '1.0.3',
      'https://registry.example',
      () => {
        throw lookupFailure({ stderr: 'ERR_PNPM_FETCH_404 GET ...: Not Found - 404' });
      },
    ),
    null,
  );
});

test('treats pnpm not-found markers in stdout as unpublished packages', () => {
  assert.equal(
    lookupPublishedVersion(
      '@experiencequality/missing',
      '1.0.3',
      'https://registry.example',
      () => {
        throw lookupFailure({
          stdout: 'ERR_PNPM_FETCH_404 GET ...: Not Found - 404',
          stderr: '',
        });
      },
    ),
    null,
  );
});

test('treats structured pnpm JSON 404 errors in stdout as unpublished packages', () => {
  assert.equal(
    lookupPublishedVersion(
      '@experiencequality/missing',
      '1.0.3',
      'https://registry.example',
      () => {
        throw lookupFailure({
          stdout: JSON.stringify({
            error: { code: 'ERR_PNPM_FETCH_404', message: 'GET ...: Not Found - 404' },
          }),
          stderr: '',
        });
      },
    ),
    null,
  );
});

test('treats structured ERR_PNPM_PACKAGE_NOT_FOUND in stdout as unpublished packages', () => {
  assert.equal(
    lookupPublishedVersion(
      '@experiencequality/rest-client',
      '1.0.4',
      'https://registry.example',
      () => {
        throw lookupFailure({
          stdout: JSON.stringify({
            error: {
              code: 'ERR_PNPM_PACKAGE_NOT_FOUND',
              message: 'No matching version found for @experiencequality/rest-client@1.0.4',
            },
          }),
          stderr: '',
        });
      },
    ),
    null,
  );
});

test('fails closed on ERR_PNPM_PACKAGE_NOT_FOUND with an unrelated message', () => {
  assert.throws(
    () =>
      lookupPublishedVersion('@experiencequality/core', '1.0.3', 'https://registry.example', () => {
        throw lookupFailure({
          stdout: JSON.stringify({
            error: {
              code: 'ERR_PNPM_PACKAGE_NOT_FOUND',
              message: 'You do not have permission to access this package',
            },
          }),
          stderr: '',
        });
      }),
    /could not inspect .*ERR_PNPM_PACKAGE_NOT_FOUND/,
  );
});

test('treats legacy not-found text as unpublished packages', () => {
  assert.equal(
    lookupPublishedVersion(
      '@experiencequality/missing',
      '1.0.3',
      'https://registry.example',
      () => {
        throw lookupFailure({
          stderr: '@experiencequality/missing@1.0.3 is not in this registry',
        });
      },
    ),
    null,
  );
});

test('treats registry authorization failures in stdout as errors', () => {
  assert.throws(
    () =>
      lookupPublishedVersion('@experiencequality/core', '1.0.3', 'https://registry.example', () => {
        throw lookupFailure({ stdout: 'ERR_PNPM_FETCH_403 GET ...: Forbidden - 403' });
      }),
    /could not inspect .*ERR_PNPM_FETCH_403/,
  );
});

test('preserves pnpm registry lookup failures other than not-found', () => {
  assert.throws(
    () =>
      lookupPublishedVersion('@experiencequality/core', '1.0.3', 'https://registry.example', () => {
        throw lookupFailure({ stderr: 'ERR_PNPM_FETCH_401 Unauthorized' });
      }),
    /could not inspect .*ERR_PNPM_FETCH_401 Unauthorized/,
  );
});

test('treats authorization failures as errors even when another stream reports not-found', () => {
  assert.throws(
    () =>
      lookupPublishedVersion('@experiencequality/core', '1.0.3', 'https://registry.example', () => {
        throw lookupFailure({
          stdout: 'ERR_PNPM_FETCH_401 Unauthorized',
          stderr: 'ERR_PNPM_FETCH_404 GET ...: Not Found - 404',
        });
      }),
    /could not inspect .*ERR_PNPM_FETCH_401/,
  );
});

test('treats network failures reported in stdout as errors', () => {
  assert.throws(
    () =>
      lookupPublishedVersion('@experiencequality/core', '1.0.3', 'https://registry.example', () => {
        throw lookupFailure({
          stdout:
            'ERR_PNPM_META_FETCH_FAIL GET https://registry.example/@experiencequality%2fcore: getaddrinfo ENOTFOUND registry.example',
          stderr: '',
          message: 'Command failed: pnpm view',
        });
      }),
    /could not inspect .*ENOTFOUND registry\.example/,
  );
});

test('preserves the original error when pnpm reports no captured output', () => {
  assert.throws(
    () =>
      lookupPublishedVersion('@experiencequality/core', '1.0.3', 'https://registry.example', () => {
        throw lookupFailure({ status: null, message: 'spawnSync pnpm ENOENT' });
      }),
    /could not inspect .*spawnSync pnpm ENOENT/,
  );
});

test('treats not-found text as an error when the exit status is not 1', () => {
  assert.throws(
    () =>
      lookupPublishedVersion('@experiencequality/core', '1.0.3', 'https://registry.example', () => {
        throw lookupFailure({
          status: 2,
          stderr: 'ERR_PNPM_FETCH_404 GET ...: Not Found - 404',
        });
      }),
    /could not inspect .*ERR_PNPM_FETCH_404/,
  );
});

test('fails safely when a successful lookup returns malformed JSON', () => {
  assert.throws(
    () =>
      lookupPublishedVersion('@experiencequality/core', '1.0.3', 'https://registry.example', () => {
        return '{malformed';
      }),
    /could not inspect/,
  );
});

test('fails safely when a successful lookup returns empty output', () => {
  assert.throws(
    () =>
      lookupPublishedVersion('@experiencequality/core', '1.0.3', 'https://registry.example', () => {
        return '   ';
      }),
    /could not inspect/,
  );
});

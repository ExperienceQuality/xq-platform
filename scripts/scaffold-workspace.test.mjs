import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { scaffoldWorkspace } from './scaffold-workspace.mjs';

test('scaffolds a publishable package without overwriting existing work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xq-scaffold-'));
  try {
    const result = await scaffoldWorkspace({ root, type: 'package', name: 'billing-client' });
    const manifest = JSON.parse(
      await readFile(join(root, 'packages/billing-client/package.json'), 'utf8'),
    );
    assert.equal(manifest.name, '@experiencequality/billing-client');
    assert.equal(manifest.private, false);
    assert.equal(result.files.length, 5);
    await assert.rejects(
      scaffoldWorkspace({ root, type: 'package', name: 'billing-client' }),
      /workspace already exists/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('scaffolds a private app and validates names', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xq-scaffold-'));
  try {
    await scaffoldWorkspace({ root, type: 'app', name: 'billing-e2e' });
    const manifest = JSON.parse(
      await readFile(join(root, 'apps/billing-e2e/package.json'), 'utf8'),
    );
    assert.equal(manifest.private, true);
    await assert.rejects(
      scaffoldWorkspace({ root, type: 'app', name: 'Billing E2E' }),
      /invalid workspace name/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { discoverWorkspaces, verifyStructure } from './verify-structure.mjs';

test('discovers the approved libraries and applications through pnpm', () => {
  const workspaces = discoverWorkspaces();

  assert.deepEqual(workspaces.map(({ name }) => name).sort(), [
    '@experiencequality/core',
    '@experiencequality/db',
    '@experiencequality/rest-client',
    '@experiencequality/showcase-backend-e2e',
    '@experiencequality/showcase-browser-e2e',
    '@experiencequality/stub',
    '@experiencequality/test',
    '@experiencequality/test-browser',
  ]);
});

test('accepts the current workspace topology and policy', () => {
  assert.doesNotThrow(() => verifyStructure());
});

test('rejects duplicate workspace discovery', () => {
  const workspaces = discoverWorkspaces();
  assert.throws(
    () => verifyStructure({ workspaces: [...workspaces, workspaces[0]] }),
    /only approved workspaces|duplicate workspace/,
  );
});

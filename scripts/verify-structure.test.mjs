import assert from 'node:assert/strict';
import test from 'node:test';

import { discoverWorkspaces, verifyStructure } from './verify-structure.mjs';

test('discovers the five libraries and one application through pnpm', () => {
  const workspaces = discoverWorkspaces();

  assert.deepEqual(workspaces.map(({ name }) => name).sort(), [
    '@experiencequality/core',
    '@experiencequality/db',
    '@experiencequality/rest-client',
    '@experiencequality/showcase-backend-e2e',
    '@experiencequality/stub',
    '@experiencequality/test',
  ]);
});

test('accepts the current workspace topology and policy', () => {
  assert.doesNotThrow(() => verifyStructure());
});

test('rejects duplicate workspace discovery', () => {
  const workspaces = discoverWorkspaces();
  assert.throws(
    () => verifyStructure({ workspaces: [...workspaces, workspaces[0]] }),
    /exactly six child workspaces/,
  );
});

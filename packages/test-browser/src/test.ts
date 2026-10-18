import { createKit, type Kit } from '@experiencequality/core';
import {
  createDatabaseClients,
  destroyDatabaseClients,
  type DatabaseClients,
} from '@experiencequality/db';
import { expect as playwrightExpect, test as playwrightBase } from '@playwright/test';
import { decodeKitPayload, NODE_TEST_KIT } from './context.js';
import { runContextForTestInfo } from './run-context.js';

export interface BrowserTestKit extends Kit {
  readonly db: DatabaseClients;
}

interface KitFixtures {
  kit: BrowserTestKit;
}

interface KitWorkerFixtures {
  kitDatabases: DatabaseClients;
}

export const test = playwrightBase.extend<KitFixtures, KitWorkerFixtures>({
  kitDatabases: [
    async ({}, use) => {
      const payload = decodeKitPayload(process.env[NODE_TEST_KIT]);
      const databases = createDatabaseClients(payload?.databases ?? {});
      try {
        await use(databases);
      } finally {
        await destroyDatabaseClients(databases);
      }
    },
    { scope: 'worker' },
  ],
  kit: async ({ kitDatabases }, use, testInfo) => {
    const payload = decodeKitPayload(process.env[NODE_TEST_KIT]);
    const run = runContextForTestInfo(testInfo, {
      backendUrl: payload?.backendUrl ?? null,
      ...(payload?.mock ? { mock: payload.mock } : {}),
    });
    const kit: BrowserTestKit = Object.freeze({ ...createKit(run), db: kitDatabases });
    let testError;
    try {
      await use(kit);
    } catch (error) {
      testError = error;
    }

    let cleanupError;
    try {
      await kit.stub.clearInteractions();
    } catch (error) {
      cleanupError = error;
    }

    if (testError && cleanupError) {
      throw new AggregateError(
        [testError, cleanupError],
        'node-test-kit: test and fixture cleanup both failed',
      );
    }
    if (testError) throw testError;
    if (cleanupError) throw cleanupError;
  },
});

export const expect = playwrightExpect;

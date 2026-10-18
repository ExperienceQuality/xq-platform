import { startBackend } from '@experiencequality/core';
import { startPactumServer } from '@experiencequality/stub';
import type { FullConfig } from '@playwright/test';
import {
  NODE_TEST_KIT,
  NODE_TEST_KIT_BACKEND_URL,
  NODE_TEST_KIT_OPTIONS,
  NODE_TEST_KIT_STUB_URL,
  decodeKitOptions,
  encodeKitPayload,
  type KitPayload,
} from './context.js';

/**
 * Playwright `globalSetup` owning the pactum mock + backend lifecycle.
 *
 * Playwright forks test workers with `env: { ...process.env }` at spawn time,
 * which happens after `globalSetup` completes, so env vars assigned here are
 * visible in every worker (verified against @playwright/test 1.64.x). The kit
 * payload is serialized into `NODE_TEST_KIT` for `decodeKitPayload` readers,
 * and the individual `NODE_TEST_KIT_*` vars keep `createRunContext`'s env
 * fallbacks working in workers.
 */
export default async function globalSetup(_config: FullConfig): Promise<() => Promise<void>> {
  const options = decodeKitOptions(process.env[NODE_TEST_KIT_OPTIONS]);
  const mockServer = await startPactumServer(options.mock);
  let backend = null;
  try {
    backend = options.application?.command
      ? await startBackend({
          ...options.application,
          env: {
            ...options.application.env,
            [NODE_TEST_KIT_STUB_URL]: mockServer.url,
          },
        })
      : null;
  } catch (error) {
    await mockServer.stop();
    throw error;
  }

  const backendUrl = backend?.url ?? options.application?.url ?? null;
  const payload: KitPayload = {
    mock: {
      baseUrl: mockServer.url,
      host: mockServer.host,
      port: mockServer.port,
      managementUrl: mockServer.managementUrl,
      namespaceHeader: mockServer.namespaceHeader,
    },
    backendUrl,
    databases: options.databases ?? {},
  };

  process.env[NODE_TEST_KIT] = encodeKitPayload(payload);
  process.env[NODE_TEST_KIT_STUB_URL] = mockServer.url;
  process.env[NODE_TEST_KIT_BACKEND_URL] = backendUrl ?? '';

  return async function globalTeardown() {
    try {
      await backend?.stop();
    } finally {
      await mockServer.stop();
    }
  };
}

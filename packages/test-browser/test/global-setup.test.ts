import type { FullConfig } from '@playwright/test';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  NODE_TEST_KIT,
  NODE_TEST_KIT_BACKEND_URL,
  NODE_TEST_KIT_OPTIONS,
  NODE_TEST_KIT_STUB_URL,
  decodeKitPayload,
  encodeKitOptions,
  type KitOptions,
} from '../src/context.js';
import globalSetup from '../src/global-setup.js';

const ENV_KEYS = [
  NODE_TEST_KIT,
  NODE_TEST_KIT_BACKEND_URL,
  NODE_TEST_KIT_OPTIONS,
  NODE_TEST_KIT_STUB_URL,
];

const savedEnv = new Map<string, string | undefined>();

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv.set(key, process.env[key]);
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  savedEnv.clear();
});

describe('globalSetup', () => {
  it('starts a real pactum mock and publishes the kit payload on env', async () => {
    const options: KitOptions = { mock: {} };
    process.env[NODE_TEST_KIT_OPTIONS] = encodeKitOptions(options);

    const teardown = await globalSetup({} as FullConfig);
    const stubUrl = process.env[NODE_TEST_KIT_STUB_URL];
    try {
      expect(stubUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

      const payload = decodeKitPayload(process.env[NODE_TEST_KIT]);
      expect(payload).not.toBeNull();
      expect(payload?.mock.baseUrl).toBe(stubUrl);
      expect(payload?.mock.managementUrl).toBe(`${stubUrl}/api/pactum`);
      expect(payload?.mock.namespaceHeader).toBe('x-node-test-kit-namespace');
      expect(payload?.backendUrl).toBeNull();
      expect(payload?.databases).toEqual({});

      expect(process.env[NODE_TEST_KIT_BACKEND_URL]).toBe('');

      const health = await fetch(`${stubUrl}/api/pactum/health`);
      expect(health.ok).toBe(true);
    } finally {
      await teardown();
    }

    await expect(fetch(`${stubUrl}/api/pactum/health`)).rejects.toThrow();
  });

  it('passes application.url through as backendUrl without spawning a backend', async () => {
    const options: KitOptions = {
      application: { command: '', url: 'http://127.0.0.1:4173' },
      databases: { primary: { urlEnv: 'DATABASE_URL' } },
      mock: {},
    };
    process.env[NODE_TEST_KIT_OPTIONS] = encodeKitOptions(options);

    const teardown = await globalSetup({} as FullConfig);
    try {
      const payload = decodeKitPayload(process.env[NODE_TEST_KIT]);
      expect(payload?.backendUrl).toBe('http://127.0.0.1:4173');
      expect(payload?.databases).toEqual({ primary: { urlEnv: 'DATABASE_URL' } });
      expect(process.env[NODE_TEST_KIT_BACKEND_URL]).toBe('http://127.0.0.1:4173');
    } finally {
      await teardown();
    }
  });

  it('stops the mock and rethrows when the backend fails to start', async () => {
    const options: KitOptions = {
      application: { command: 'exit 0', url: 'http://127.0.0.1:1' },
      mock: {},
    };
    process.env[NODE_TEST_KIT_OPTIONS] = encodeKitOptions(options);

    await expect(globalSetup({} as FullConfig)).rejects.toThrow(/node-test-kit: backend/);

    // The failure path runs before the payload is published.
    expect(process.env[NODE_TEST_KIT]).toBe(savedEnv.get(NODE_TEST_KIT));
  });
});

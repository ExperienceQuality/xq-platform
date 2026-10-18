import { describe, expect, it } from 'vitest';
import {
  NODE_TEST_KIT,
  NODE_TEST_KIT_BACKEND_URL,
  NODE_TEST_KIT_OPTIONS,
  NODE_TEST_KIT_STUB_URL,
  decodeKitOptions,
  decodeKitPayload,
  encodeKitOptions,
  encodeKitPayload,
  type KitOptions,
  type KitPayload,
} from '../src/context.js';

const kitOptions: KitOptions = {
  application: {
    command: 'npm run preview:test',
    url: 'http://127.0.0.1:4173/',
    env: { NODE_ENV: 'test' },
  },
  databases: {
    primary: { urlEnv: 'NODE_TEST_KIT_DATABASE_URL', defaultSchema: 'public' },
  },
  mock: { host: '127.0.0.1', port: 0 },
};

const kitPayload: KitPayload = {
  mock: {
    baseUrl: 'http://127.0.0.1:9393',
    host: '127.0.0.1',
    port: 9393,
    managementUrl: 'http://127.0.0.1:9393/api/pactum',
    namespaceHeader: 'x-node-test-kit-namespace',
  },
  backendUrl: 'http://127.0.0.1:4173',
  databases: {
    primary: { urlEnv: 'NODE_TEST_KIT_DATABASE_URL' },
  },
};

describe('context env codec', () => {
  it('exposes the env var names used across Playwright processes', () => {
    expect(NODE_TEST_KIT_OPTIONS).toBe('NODE_TEST_KIT_OPTIONS');
    expect(NODE_TEST_KIT).toBe('NODE_TEST_KIT');
    expect(NODE_TEST_KIT_BACKEND_URL).toBe('NODE_TEST_KIT_BACKEND_URL');
    expect(NODE_TEST_KIT_STUB_URL).toBe('NODE_TEST_KIT_STUB_URL');
  });

  it('round-trips kit options', () => {
    expect(decodeKitOptions(encodeKitOptions(kitOptions))).toEqual(kitOptions);
  });

  it('round-trips the kit payload', () => {
    expect(decodeKitPayload(encodeKitPayload(kitPayload))).toEqual(kitPayload);
  });

  it('decodes missing options to defaults', () => {
    expect(decodeKitOptions(undefined)).toEqual({});
    expect(decodeKitOptions('')).toEqual({});
    expect(decodeKitOptions(encodeKitOptions({}))).toEqual({});
  });

  it('decodes a missing payload to null', () => {
    expect(decodeKitPayload(undefined)).toBeNull();
    expect(decodeKitPayload('')).toBeNull();
  });

  it('throws a clear error naming the env var on malformed options', () => {
    expect(() => decodeKitOptions('{not json')).toThrowError('NODE_TEST_KIT_OPTIONS');
  });

  it('throws a clear error naming the env var on malformed payload', () => {
    expect(() => decodeKitPayload('{not json')).toThrowError('NODE_TEST_KIT');
  });

  it('round-trips unicode content', () => {
    const options: KitOptions = {
      application: {
        command: 'node server.js --name "测试 后端 🚀"',
        url: 'http://127.0.0.1:4173/üñïçødé',
      },
      databases: { primary: { urlEnv: 'DATABASE_URL_数据库' } },
    };
    const payload: KitPayload = {
      ...kitPayload,
      mock: { ...kitPayload.mock, namespaceHeader: 'x-namespace-名前' },
      backendUrl: 'http://127.0.0.1:4173/路径',
    };

    expect(decodeKitOptions(encodeKitOptions(options))).toEqual(options);
    expect(decodeKitPayload(encodeKitPayload(payload))).toEqual(payload);
  });
});

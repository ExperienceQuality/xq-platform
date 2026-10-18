import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MockMetadata } from '@experiencequality/core';
import type { TestInfo } from '@playwright/test';
import { runContextForTestInfo } from '../src/run-context.js';

function fakeTestInfo(overrides: Partial<TestInfo> = {}): TestInfo {
  return { testId: 'abc', workerIndex: 3, ...overrides } as TestInfo;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runContextForTestInfo', () => {
  it('maps testId and workerIndex from TestInfo', () => {
    const context = runContextForTestInfo(fakeTestInfo());

    expect(context.testId).toBe('abc');
    expect(context.workerId).toBe('3');
    expect(typeof context.id).toBe('string');
    expect(context.id.length).toBeGreaterThan(0);
  });

  it('returns a frozen RunContext', () => {
    const context = runContextForTestInfo(fakeTestInfo());

    expect(Object.isFrozen(context)).toBe(true);
  });

  it('passes backendUrl and mock metadata through', () => {
    const mock: MockMetadata = {
      baseUrl: 'http://stub.example.com:4000',
      namespaceHeader: 'x-test-namespace',
      host: 'stub.example.com',
      port: 4000,
      managementUrl: 'http://stub.example.com:4001',
    };
    const context = runContextForTestInfo(fakeTestInfo(), {
      backendUrl: 'http://backend.example.com:3000',
      mock,
    });

    expect(context.backendUrl).toBe('http://backend.example.com:3000');
    expect(context.mock).toEqual(mock);
  });

  it('applies defaults when metadata is omitted', () => {
    vi.stubEnv('NODE_TEST_KIT_BACKEND_URL', undefined);
    vi.stubEnv('NODE_TEST_KIT_STUB_URL', undefined);

    const context = runContextForTestInfo(fakeTestInfo());

    expect(context.backendUrl).toBeNull();
    expect(context.mock.baseUrl).toBeNull();
    expect(context.mock.namespaceHeader).toBe('x-node-test-kit-namespace');
  });

  it('resolves workerId from workerIndex when vitest env vars are absent', () => {
    vi.stubEnv('VITEST_WORKER_ID', undefined);
    vi.stubEnv('VITEST_POOL_ID', undefined);

    const context = runContextForTestInfo(fakeTestInfo({ workerIndex: 7 }));

    expect(context.workerId).toBe('7');
    expect(context.testId).toBe('abc');
  });
});

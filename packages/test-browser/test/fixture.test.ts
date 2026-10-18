import { describe, expect, expectTypeOf, it, test as vitestTest } from 'vitest';
import type { Kit } from '@experiencequality/core';
import type { DatabaseClients } from '@experiencequality/db';
import { expect as playwrightExpect } from '@playwright/test';
import type { Browser, Page, TestType } from '@playwright/test';
import { expect as browserExpect, test as browserTest } from '../src/index.js';
import type { BrowserTestKit } from '../src/index.js';

type TestArgs = typeof browserTest extends TestType<infer T, infer _W> ? T : never;
type WorkerArgs = typeof browserTest extends TestType<infer _T, infer W> ? W : never;

describe('browser kit fixtures', () => {
  it('re-exports the playwright test runner, not vitest', () => {
    expect(browserTest).not.toBe(vitestTest);
    expect(typeof browserTest).toBe('function');
    expect(typeof browserTest.extend).toBe('function');
    expect(typeof browserTest.describe).toBe('function');
    expect(typeof browserTest.use).toBe('function');
    expect(typeof browserTest.info).toBe('function');
    expect(typeof browserTest.beforeEach).toBe('function');
    expect(typeof browserTest.afterEach).toBe('function');
  });

  it('re-exports the playwright expect', () => {
    expect(browserExpect).toBe(playwrightExpect);
  });

  it('declares a test-scoped kit fixture and a worker-scoped kitDatabases fixture', () => {
    expectTypeOf<TestArgs['kit']>().toEqualTypeOf<BrowserTestKit>();
    expectTypeOf<WorkerArgs['kitDatabases']>().toEqualTypeOf<DatabaseClients>();
  });

  it('retains the playwright built-in fixtures', () => {
    expectTypeOf<TestArgs['page']>().toEqualTypeOf<Page>();
    expectTypeOf<WorkerArgs['browser']>().toEqualTypeOf<Browser>();
  });

  it('BrowserTestKit extends Kit with database clients', () => {
    expectTypeOf<BrowserTestKit>().toMatchTypeOf<Kit>();
    expectTypeOf<BrowserTestKit['db']>().toEqualTypeOf<DatabaseClients>();
    expectTypeOf<BrowserTestKit['stub']>().not.toBeAny();
  });
});

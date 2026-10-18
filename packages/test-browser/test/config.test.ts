import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defineConfig } from '../src/config.js';

const packagedGlobalSetup = fileURLToPath(new URL('../src/global-setup.ts', import.meta.url));

describe('defineConfig', () => {
  const originalEnv = process.env.NODE_TEST_KIT_OPTIONS;

  beforeEach(() => {
    delete process.env.NODE_TEST_KIT_OPTIONS;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.NODE_TEST_KIT_OPTIONS;
    } else {
      process.env.NODE_TEST_KIT_OPTIONS = originalEnv;
    }
  });

  it('applies XQ defaults', () => {
    const config = defineConfig();

    expect(config.fullyParallel).toBe(true);
    expect(config.retries).toBe(0);
    expect(config.reporter).toEqual([
      ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ]);
    expect(config.expect).toMatchObject({ timeout: 10_000 });
    expect(config.globalSetup).toEqual([packagedGlobalSetup]);
  });

  it('applies default use options for artifacts', () => {
    const config = defineConfig();

    expect(config.use).toMatchObject({
      screenshot: 'only-on-failure',
      trace: 'retain-on-failure',
      video: 'retain-on-failure',
    });
  });

  it('lets consumer overrides win', () => {
    const config = defineConfig({
      fullyParallel: false,
      retries: 3,
      reporter: 'list',
      testDir: './tests/browser',
      projects: [{ name: 'chromium' }],
      webServer: { command: 'npm run preview', url: 'http://127.0.0.1:4173' },
    });

    expect(config.fullyParallel).toBe(false);
    expect(config.retries).toBe(3);
    expect(config.reporter).toBe('list');
    expect(config.testDir).toBe('./tests/browser');
    expect(config.projects).toEqual([{ name: 'chromium' }]);
    expect(config.webServer).toEqual({ command: 'npm run preview', url: 'http://127.0.0.1:4173' });
  });

  it('strips kit options before delegating', () => {
    const config = defineConfig({
      application: { command: 'npm run backend', url: 'http://127.0.0.1:3000' },
      databases: { main: { urlEnv: 'DATABASE_URL' } },
      mock: { port: 1234 },
    });

    expect(config).not.toHaveProperty('application');
    expect(config).not.toHaveProperty('databases');
    expect(config).not.toHaveProperty('mock');
  });

  it('embeds kit options in NODE_TEST_KIT_OPTIONS when present', () => {
    const application = { command: 'npm run backend', url: 'http://127.0.0.1:3000' };
    const databases = { main: { urlEnv: 'DATABASE_URL' } };
    const mock = { port: 1234 };

    defineConfig({ application, databases, mock });

    expect(JSON.parse(process.env.NODE_TEST_KIT_OPTIONS ?? '')).toEqual({
      application,
      databases,
      mock,
    });
  });

  it('does not set NODE_TEST_KIT_OPTIONS without kit options', () => {
    defineConfig();

    expect(process.env.NODE_TEST_KIT_OPTIONS).toBeUndefined();
  });

  it('appends consumer globalSetup after the packaged setup', () => {
    const single = defineConfig({ globalSetup: './consumer-setup.ts' });
    expect(single.globalSetup).toEqual([packagedGlobalSetup, './consumer-setup.ts']);

    const multiple = defineConfig({ globalSetup: ['./a.ts', './b.ts'] });
    expect(multiple.globalSetup).toEqual([packagedGlobalSetup, './a.ts', './b.ts']);
  });

  it('deep-merges consumer use options over defaults', () => {
    const config = defineConfig({
      use: { baseURL: 'http://127.0.0.1:4173', screenshot: 'off' },
    });

    expect(config.use).toMatchObject({
      screenshot: 'off',
      trace: 'retain-on-failure',
      video: 'retain-on-failure',
      baseURL: 'http://127.0.0.1:4173',
    });
  });

  it('merges consumer expect options over defaults', () => {
    const overridden = defineConfig({ expect: { timeout: 5_000 } });
    expect(overridden.expect).toMatchObject({ timeout: 5_000 });
  });
});

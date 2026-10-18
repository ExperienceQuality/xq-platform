import { fileURLToPath } from 'node:url';
import type { BackendOptions } from '@experiencequality/core';
import type { DatabaseOptions } from '@experiencequality/db';
import type { PactumServerOptions } from '@experiencequality/stub';
import {
  defineConfig as definePlaywrightConfig,
  type PlaywrightTestConfig,
} from '@playwright/test';

export interface KitOptions {
  application?: BackendOptions;
  databases?: DatabaseOptions;
  mock?: PactumServerOptions;
}

export interface BrowserKitConfig extends PlaywrightTestConfig, KitOptions {}

const globalSetup = fileURLToPath(
  new URL(
    import.meta.url.endsWith('.ts') ? './global-setup.ts' : './global-setup.js',
    import.meta.url,
  ),
);

const defaultReporter: NonNullable<PlaywrightTestConfig['reporter']> = [
  ['html', { outputFolder: 'playwright-report', open: 'never' }],
];

const defaultUse: NonNullable<PlaywrightTestConfig['use']> = {
  screenshot: 'only-on-failure',
  trace: 'retain-on-failure',
  video: 'retain-on-failure',
};

export function defineConfig(options: BrowserKitConfig = {}): PlaywrightTestConfig {
  const { application, databases, mock, ...playwrightConfig } = options;

  if (application !== undefined || databases !== undefined || mock !== undefined) {
    process.env.NODE_TEST_KIT_OPTIONS = JSON.stringify({ application, databases, mock });
  }

  const consumerGlobalSetup = playwrightConfig.globalSetup;
  const userGlobalSetup = Array.isArray(consumerGlobalSetup)
    ? consumerGlobalSetup
    : consumerGlobalSetup
      ? [consumerGlobalSetup]
      : [];

  return definePlaywrightConfig({
    fullyParallel: true,
    retries: 0,
    reporter: defaultReporter,
    ...playwrightConfig,
    use: { ...defaultUse, ...playwrightConfig.use },
    expect: { timeout: 10_000, ...playwrightConfig.expect },
    globalSetup: [globalSetup, ...userGlobalSetup],
  });
}

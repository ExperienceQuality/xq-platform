import { fileURLToPath } from 'node:url';
import type { BackendOptions } from '@experiencequality/core';
import type { DatabaseOptions } from '@experiencequality/db';
import type { PactumServerOptions } from '@experiencequality/stub';
import { defineConfig as defineVitestConfig, type TestUserConfig, type ViteUserConfig } from 'vitest/config';

export interface KitOptions {
  application?: BackendOptions;
  databases?: DatabaseOptions;
  mock?: PactumServerOptions;
}

export type NodeTestKitConfig = Omit<ViteUserConfig, 'test'> & { test?: TestUserConfig } & KitOptions;

const globalSetup = fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? './global-setup.ts' : './global-setup.js', import.meta.url));

const defaultTest = {
  include: ['test/**/*.test.{js,mjs,ts,mts}'],
  environment: 'node',
  isolate: true,
  fileParallelism: true,
  maxConcurrency: 1,
  reporters: ['default']
};

export function defineConfig(options: NodeTestKitConfig = {}): ViteUserConfig {
  const { test = {}, ...kitOptions } = options;
  const userGlobalSetup = test.globalSetup
    ? Array.isArray(test.globalSetup) ? test.globalSetup : [test.globalSetup]
    : [];

  return defineVitestConfig({
    test: {
      ...defaultTest,
      ...test,
      globalSetup: [globalSetup, ...userGlobalSetup],
      nodeTestKit: kitOptions
    }
  } as unknown as ViteUserConfig);
}

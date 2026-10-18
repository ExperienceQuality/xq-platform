import type { BackendOptions } from '@experiencequality/core';
import type { DatabaseOptions } from '@experiencequality/db';
import type { PactumServerOptions } from '@experiencequality/stub';

export const NODE_TEST_KIT_OPTIONS = 'NODE_TEST_KIT_OPTIONS';
export const NODE_TEST_KIT = 'NODE_TEST_KIT';
export const NODE_TEST_KIT_BACKEND_URL = 'NODE_TEST_KIT_BACKEND_URL';
export const NODE_TEST_KIT_STUB_URL = 'NODE_TEST_KIT_STUB_URL';

export interface KitOptions {
  application?: BackendOptions;
  databases?: DatabaseOptions;
  mock?: PactumServerOptions;
}

export interface KitPayload {
  mock: {
    baseUrl: string;
    host: string;
    port: number;
    managementUrl: string;
    namespaceHeader: string;
  };
  backendUrl: string | null;
  databases: DatabaseOptions;
}

export function encodeKitOptions(options: KitOptions): string {
  return JSON.stringify(options);
}

export function decodeKitOptions(raw: string | undefined): KitOptions {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as KitOptions;
  } catch (error) {
    throw invalidEnvJson(NODE_TEST_KIT_OPTIONS, error);
  }
}

export function encodeKitPayload(payload: KitPayload): string {
  return JSON.stringify(payload);
}

export function decodeKitPayload(raw: string | undefined): KitPayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as KitPayload;
  } catch (error) {
    throw invalidEnvJson(NODE_TEST_KIT, error);
  }
}

function invalidEnvJson(envVar: string, error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(`node-test-kit: ${envVar} contains invalid JSON: ${detail}`);
}

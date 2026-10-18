import { createRunContext } from '@experiencequality/core';
import type { MockMetadata, RunContext } from '@experiencequality/core';
import type { TestInfo } from '@playwright/test';

export interface RunContextMetadata {
  backendUrl?: string | null;
  mock?: MockMetadata;
}

/**
 * Adapts Playwright's `TestInfo` to `createRunContext`'s duck-typed `{ id }` input.
 *
 * `createRunContext` derives `workerId` from Vitest env vars (`VITEST_WORKER_ID` /
 * `VITEST_POOL_ID`), which do not exist under Playwright. Rather than mutating
 * `process.env`, the result is re-frozen with `workerId` taken from
 * `testInfo.workerIndex`.
 */
export function runContextForTestInfo(
  testInfo: TestInfo,
  metadata: RunContextMetadata = {},
): RunContext {
  const context = createRunContext({ id: testInfo.testId }, metadata);
  return Object.freeze({ ...context, workerId: String(testInfo.workerIndex) });
}

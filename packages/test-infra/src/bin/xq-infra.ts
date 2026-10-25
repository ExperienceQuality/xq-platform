#!/usr/bin/env node
// Ported from xq-test-infra (Apache-2.0); rewritten in TypeScript. See UPSTREAM.md.
// CLI entrypoint
import main from '../cli/index.js';

try {
  await main();
} catch (err) {
  // Fallback for environments where startup fails
  console.error('Failed to start CLI:', err instanceof Error ? err.message : err);
  process.exit(1);
}

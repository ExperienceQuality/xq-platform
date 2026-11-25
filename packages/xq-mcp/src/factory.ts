import { loadProviders } from './discovery.js'
import type { ToolDefinition, XQToolProvider } from './type.js'

/**
 * Load all providers and return their tool definitions
 * @returns ToolDefinition[]
 * @throws Error if failed to load providers
 */
export async function createTools(): Promise<ToolDefinition[]> {
  let providers: XQToolProvider[] = []

  try {
    providers = await loadProviders()
  } catch (error: unknown) {
    throw new Error(
      `Failed to load providers: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  return providers.flatMap((provider) => provider.provide())
}

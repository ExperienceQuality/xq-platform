import { readdir } from 'node:fs/promises'
import type { XQToolProvider } from './type.js'

const PROVIDERS_URL = new URL('./tools/', import.meta.url)

async function _discoverProviders(): Promise<string[]> {
  const files = await readdir(PROVIDERS_URL)
  return files
    .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
    .map((f) => new URL(f, PROVIDERS_URL).href)
}

export async function loadProviders(): Promise<XQToolProvider[]> {
  const paths: string[] = await _discoverProviders()

  return Promise.all(
    paths.map(async (path) => {
      const mod = await import(path)
      return mod.default as XQToolProvider
    }),
  )
}

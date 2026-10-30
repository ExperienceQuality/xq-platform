import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultRegistry = 'https://npm.pkg.github.com';

export function lookupPublishedVersion(
  name,
  version,
  registry = defaultRegistry,
  run = execFileSync,
) {
  try {
    const output = run(
      'pnpm',
      ['view', `${name}@${version}`, 'version', '--json', '--registry', registry],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    ).trim();
    const published = JSON.parse(output);
    return published === version ? version : published;
  } catch (error) {
    const stdout = String(error.stdout ?? '');
    const stderr = String(error.stderr ?? '');
    const output = `${stdout}\n${stderr}`;
    const report = parseJsonObject(stdout) ?? parseJsonObject(stderr);
    const code = report?.error?.code;
    const hasAuthError = authMarkers.test(output) || structuredAuthCodes.has(code);
    const hasNotFound =
      notFoundMarkers.test(output) ||
      structuredNotFoundCodes.has(code) ||
      (code === 'ERR_PNPM_PACKAGE_NOT_FOUND' &&
        /no matching version found/i.test(String(report?.error?.message ?? '')));
    if (error.status === 1 && !hasAuthError && hasNotFound) return null;
    const diagnostics = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
    throw new Error(`could not inspect ${name}@${version}: ${diagnostics || error.message}`);
  }
}

const notFoundMarkers = /ERR_PNPM_FETCH_404|\bE404\b|404 Not Found|is not in this registry/i;
const authMarkers = /ERR_PNPM_FETCH_40[13]|\bE40[13]\b/;
const structuredNotFoundCodes = new Set(['ERR_PNPM_FETCH_404', 'E404']);
const structuredAuthCodes = new Set(['ERR_PNPM_FETCH_401', 'ERR_PNPM_FETCH_403', 'E401', 'E403']);

function parseJsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed !== null && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

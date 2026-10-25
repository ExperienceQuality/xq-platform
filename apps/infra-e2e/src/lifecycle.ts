// Real-CLI runner for the infra E2E fixture. Every compose action goes through
// the compiled xq-infra bin under a run-unique COMPOSE_PROJECT_NAME.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

export const APP_DIR = fileURLToPath(new URL('..', import.meta.url));
export const SEED_MESSAGE = {
  id: '00000000-0000-4000-8000-000000000001',
  body: 'baseline',
} as const;

const IMAGE_TAG_PLACEHOLDER = '__XQ_E2E_TAG__';
const COMPOSE_PROJECT_LABEL = 'com.docker.compose.project';
const HEALTH_TIMEOUT_MS = 120_000;
const REQUEST_TIMEOUT_MS = 5_000;

export interface ProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface RunContext {
  runId: string;
  project: string;
  runDir: string;
  composeFile: string;
  imageTag: string;
  evidenceDir: string;
}

export interface RunResources {
  containers: Record<string, string>;
  dbVolume: string | null;
}

export function infraBin(): string {
  const require = createRequire(import.meta.url);
  const pkgPath = require.resolve('@experiencequality/test-infra/package.json');
  return path.join(path.dirname(pkgPath), 'dist', 'bin', 'xq-infra.js');
}

export function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<ProcessResult> {
  const { cwd, env, timeoutMs = 300_000 } = options;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} ${args.join(' ')} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout?.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

export function runCli(
  run: RunContext,
  args: string[],
  options: { timeoutMs?: number } = {},
): Promise<ProcessResult> {
  return runProcess(process.execPath, [infraBin(), ...args], {
    cwd: run.runDir,
    env: { ...process.env, COMPOSE_PROJECT_NAME: run.project },
    timeoutMs: options.timeoutMs ?? 300_000,
  });
}

export async function docker(
  args: string[],
  options: { timeoutMs?: number } = {},
): Promise<ProcessResult> {
  return runProcess('docker', args, options);
}

export async function compose(
  run: RunContext,
  args: string[],
  options: { timeoutMs?: number } = {},
): Promise<ProcessResult> {
  return docker(['compose', '-p', run.project, '-f', run.composeFile, ...args], options);
}

export async function ensureDocker(): Promise<void> {
  const info = await docker(['info'], { timeoutMs: 15_000 });
  if (info.exitCode !== 0) {
    throw new Error(`docker info failed (${info.exitCode}): ${info.stderr || info.stdout}`);
  }
  const version = await docker(['compose', 'version'], { timeoutMs: 15_000 });
  if (version.exitCode !== 0) {
    throw new Error(`docker compose version failed: ${version.stderr || version.stdout}`);
  }
}

export async function pullBaseImages(): Promise<void> {
  for (const image of ['node:24-alpine', 'postgres:16-alpine', 'nginx:alpine']) {
    const result = await docker(['pull', image], { timeoutMs: 300_000 });
    if (result.exitCode !== 0) {
      throw new Error(`docker pull ${image} failed: ${result.stderr || result.stdout}`);
    }
  }
}

async function injectImageTag(filePath: string, imageTag: string): Promise<void> {
  const content = await readFile(filePath, 'utf8');
  await writeFile(filePath, content.split(IMAGE_TAG_PLACEHOLDER).join(imageTag), 'utf8');
}

async function scaffoldRunDir(runDir: string): Promise<void> {
  await mkdir(path.join(runDir, 'services'), { recursive: true });
  await mkdir(path.join(runDir, 'fixtures'), { recursive: true });
  await mkdir(path.join(runDir, 'evidence'), { recursive: true });
  const servicesDir = path.join(APP_DIR, 'services');
  for (const file of [
    'postgres.service.yml',
    'reader.service.yml',
    'writer.service.yml',
    'xq.config.yml',
  ]) {
    await copyFile(path.join(servicesDir, file), path.join(runDir, 'services', file));
  }
  await copyFile(
    path.join(APP_DIR, 'fixtures', 'init.sql'),
    path.join(runDir, 'fixtures', 'init.sql'),
  );
}

async function writerSpec(jobExitCode: number | null): Promise<Record<string, unknown>> {
  const raw = await readFile(path.join(APP_DIR, 'services', 'writer.service.yml'), 'utf8');
  const spec = YAML.parse(raw) as Record<string, unknown>;
  if (jobExitCode === null) return spec;
  const environment = { ...(spec.environment as Record<string, unknown>) };
  environment.FIXTURE_JOB_EXIT = String(jobExitCode);
  const routes = spec.routes as Array<{ methods: string[]; paths: string[] }>;
  routes[0]!.paths = [...routes[0]!.paths, '/fixture/complete'];
  return { ...spec, name: 'writer', environment, routes };
}

export async function createRun(jobExitCode: number | null = null): Promise<RunContext> {
  const runId = crypto.randomUUID();
  const runDir = await mkdtemp(path.join(os.tmpdir(), 'xq-infra-e2e-'));
  const run: RunContext = {
    runId,
    project: `xq-infra-e2e-${runId}`,
    runDir,
    composeFile: path.join(runDir, 'xq-compose.yml'),
    imageTag: `xq-infra-e2e:${runId}`,
    evidenceDir: path.join(runDir, 'evidence'),
  };
  await scaffoldRunDir(runDir);
  await injectImageTag(path.join(runDir, 'services', 'reader.service.yml'), runId);
  if (jobExitCode === null) {
    await injectImageTag(path.join(runDir, 'services', 'writer.service.yml'), runId);
  } else {
    const writer = await writerSpec(jobExitCode);
    const writerYaml = YAML.stringify(writer).split(IMAGE_TAG_PLACEHOLDER).join(runId);
    await writeFile(
      path.join(runDir, 'services', 'writer.test.service.yml'),
      writerYaml,
      'utf8',
    );
    await rm(path.join(runDir, 'services', 'writer.service.yml'));
  }
  return run;
}

export async function buildImage(run: RunContext): Promise<void> {
  const result = await docker(['build', '-t', run.imageTag, APP_DIR], { timeoutMs: 600_000 });
  if (result.exitCode !== 0) {
    throw new Error(`docker build failed: ${result.stderr || result.stdout}`);
  }
}

export async function assertCleanProject(run: RunContext): Promise<void> {
  const containers = await docker(
    ['ps', '--all', '--quiet', '--filter', `label=${COMPOSE_PROJECT_LABEL}=${run.project}`],
    { timeoutMs: 15_000 },
  );
  if (containers.stdout.trim().length > 0) {
    throw new Error(`project ${run.project} already owns containers: ${containers.stdout}`);
  }
  const networks = await docker(
    ['network', 'ls', '--quiet', '--filter', `label=${COMPOSE_PROJECT_LABEL}=${run.project}`],
    { timeoutMs: 15_000 },
  );
  if (networks.stdout.trim().length > 0) {
    throw new Error(`project ${run.project} already owns networks: ${networks.stdout}`);
  }
}

export async function generate(run: RunContext): Promise<void> {
  const result = await runCli(run, ['generate', '-f', 'services']);
  await record(run, 'generate', result);
  if (result.exitCode !== 0) {
    throw new Error(`xq-infra generate failed (${result.exitCode}): ${result.stderr}`);
  }
}

interface ComposeDoc {
  services?: Record<
    string,
    {
      image?: string;
      ports?: string[];
      volumes?: string[];
      healthcheck?: unknown;
      depends_on?: Record<string, { condition?: string }> | string[];
    }
  >;
}

export async function adjustGatewayPort(run: RunContext): Promise<void> {
  const raw = await readFile(run.composeFile, 'utf8');
  await writeFile(path.join(run.evidenceDir, 'xq-compose.original.yml'), raw, 'utf8');
  const doc = YAML.parse(raw) as ComposeDoc;
  const services = doc.services ?? {};
  const names = Object.keys(services).sort();
  const gateway = services['xq-gateway'];
  if (!gateway || gateway.image !== 'nginx:alpine') {
    throw new Error(`generated gateway missing or unexpected: ${JSON.stringify(names)}`);
  }
  const expected = ['postgres', 'reader', 'writer', 'xq-gateway'];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`expected services ${expected.join(',')}, got ${names.join(',')}`);
  }
  const dependsOn = gateway.depends_on as Record<string, { condition?: string }> | undefined;
  for (const backend of ['postgres', 'reader', 'writer']) {
    if (dependsOn?.[backend]?.condition !== 'service_healthy') {
      throw new Error(`gateway must wait for ${backend} service_healthy`);
    }
  }
  gateway.ports = ['127.0.0.1::80'];
  await writeFile(run.composeFile, YAML.stringify(doc), 'utf8');
  await writeFile(
    path.join(run.evidenceDir, 'xq-compose.effective.yml'),
    YAML.stringify(doc),
    'utf8',
  );
  const validated = await compose(run, ['config', '--quiet']);
  if (validated.exitCode !== 0) {
    throw new Error(`compose config invalid after gateway remap: ${validated.stderr}`);
  }
}

export async function up(run: RunContext): Promise<ProcessResult> {
  const result = await runCli(run, ['up', '--no-pull'], { timeoutMs: 300_000 });
  await record(run, 'up', result);
  return result;
}

export function upAsync(run: RunContext): Promise<ProcessResult> {
  return runCli(run, ['up', '--no-pull'], { timeoutMs: 300_000 });
}

export async function cliLogs(run: RunContext): Promise<ProcessResult> {
  const result = await runCli(run, ['logs', '--tail', '20'], { timeoutMs: 60_000 });
  await record(run, 'logs', result);
  return result;
}

export async function down(run: RunContext): Promise<ProcessResult> {
  const result = await runCli(run, ['down'], { timeoutMs: 120_000 });
  await record(run, 'down', result);
  return result;
}

export async function gatewayBaseUrl(run: RunContext): Promise<string> {
  const result = await compose(run, ['port', 'xq-gateway', '80'], { timeoutMs: 15_000 });
  if (result.exitCode !== 0 || result.stdout.trim().length === 0) {
    throw new Error(`cannot resolve gateway port: ${result.stderr || result.stdout}`);
  }
  const address = result.stdout.trim().split('\n').at(-1)!.trim();
  const port = address.includes(']:') ? address.split(']:').at(-1)! : address.split(':').at(-1)!;
  return `http://127.0.0.1:${port}`;
}

export async function pollGateway(run: RunContext, pathName = '/writer/health'): Promise<string> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let lastError = 'no attempt';
  while (Date.now() < deadline) {
    try {
      const base = await gatewayBaseUrl(run);
      const response = await fetch(`${base}${pathName}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 200) {
        return base;
      }
      lastError = `status ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`gateway never became healthy within ${HEALTH_TIMEOUT_MS}ms: ${lastError}`);
}

export async function fetchJson(
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers: options.body === undefined ? {} : { 'content-type': 'application/json' },
    body: options.body === undefined ? null : JSON.stringify(options.body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

export async function captureResources(run: RunContext): Promise<RunResources> {
  const ps = await compose(run, ['ps', '--all', '--quiet'], { timeoutMs: 15_000 });
  if (ps.exitCode !== 0) {
    throw new Error(`compose ps failed: ${ps.stderr}`);
  }
  const ids = ps.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const containers: Record<string, string> = {};
  let dbVolume: string | null = null;
  for (const id of ids) {
    const inspect = await docker(['inspect', id, '--format', '{{json .}}'], { timeoutMs: 15_000 });
    if (inspect.exitCode !== 0) continue;
    const info = JSON.parse(inspect.stdout) as {
      Config?: { Labels?: Record<string, string> };
      Mounts?: Array<{ Type?: string; Destination?: string; Name?: string }>;
    };
    const labels = info.Config?.Labels ?? {};
    if (labels[COMPOSE_PROJECT_LABEL] !== run.project) {
      throw new Error(`container ${id} is not owned by ${run.project}`);
    }
    const serviceName = labels['com.docker.compose.service'] ?? id;
    containers[serviceName] = id;
    if (serviceName === 'postgres') {
      const mount = (info.Mounts ?? []).find(
        (m) => m.Type === 'volume' && m.Destination === '/var/lib/postgresql/data',
      );
      dbVolume = mount?.Name ?? null;
    }
  }
  const evidence = { containers, dbVolume };
  await writeFile(
    path.join(run.evidenceDir, 'resources.json'),
    JSON.stringify(evidence, null, 2),
    'utf8',
  );
  return evidence;
}

export async function verifyProjectGone(run: RunContext): Promise<void> {
  const ps = await docker(
    ['ps', '--all', '--quiet', '--filter', `label=${COMPOSE_PROJECT_LABEL}=${run.project}`],
    { timeoutMs: 15_000 },
  );
  if (ps.stdout.trim().length > 0) {
    throw new Error(`containers remain for ${run.project}: ${ps.stdout}`);
  }
  const networks = await docker(
    ['network', 'ls', '--quiet', '--filter', `label=${COMPOSE_PROJECT_LABEL}=${run.project}`],
    { timeoutMs: 15_000 },
  );
  if (networks.stdout.trim().length > 0) {
    throw new Error(`network remains for ${run.project}: ${networks.stdout}`);
  }
}

export async function cleanupDbVolume(run: RunContext, volume: string | null): Promise<void> {
  if (volume === null) return;
  const inspect = await docker(['volume', 'inspect', volume], { timeoutMs: 15_000 });
  if (inspect.exitCode !== 0) return; // compose down already removed it
  const info = JSON.parse(inspect.stdout) as Array<{ Labels?: Record<string, string> }>;
  const labels = info[0]?.Labels ?? {};
  // Ownership was proven when this volume was captured from this run's postgres
  // container mounts. Anonymous volumes carry no project label; only refuse on
  // a conflicting project label.
  const owner = labels[COMPOSE_PROJECT_LABEL];
  if (owner !== undefined && owner !== run.project) {
    throw new Error(
      `refusing to remove volume ${volume}: project label is ${JSON.stringify(labels)}`,
    );
  }
  const users = await docker(['ps', '--all', '--quiet', '--filter', `volume=${volume}`], {
    timeoutMs: 15_000,
  });
  if (users.stdout.trim().length > 0) {
    throw new Error(`refusing to remove volume ${volume}: still mounted by ${users.stdout}`);
  }
  const removed = await docker(['volume', 'rm', volume], { timeoutMs: 15_000 });
  if (removed.exitCode !== 0) {
    throw new Error(`docker volume rm ${volume} failed: ${removed.stderr}`);
  }
}

export async function record(run: RunContext, name: string, result: ProcessResult): Promise<void> {
  await writeFile(
    path.join(run.evidenceDir, `${name}.log`),
    [
      `exitCode: ${result.exitCode}`,
      '--- stdout ---',
      result.stdout,
      '--- stderr ---',
      result.stderr,
    ].join('\n'),
    'utf8',
  );
}

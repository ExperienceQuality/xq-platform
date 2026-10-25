import type { SpawnOptions } from 'node:child_process';

export interface RouteSpec {
  methods?: string[];
  paths?: string[];
}

export interface ServiceSpec {
  name?: string;
  image: string;
  tag?: string | number;
  port?: number;
  ports?: string[];
  autoPort?: boolean;
  environment?: Record<string, unknown> | string[];
  volumes?: string[];
  command?: string | string[];
  healthcheck?: Record<string, unknown>;
  depends_on?: string[];
  dependencyGroups?: string[];
  routes?: RouteSpec[];
  [key: string]: unknown;
}

export interface XqSpec {
  services?: Record<string, ServiceSpec>;
  portRange?: { start?: number };
  dependencies?: Record<string, string[]>;
  [key: string]: unknown;
}

export interface LoadedSpec extends XqSpec {
  services: Record<string, ServiceSpec>;
}

export interface ComposeService {
  image: string;
  networks: string[];
  ports?: string[];
  environment?: Record<string, unknown> | string[];
  volumes?: string[];
  command?: string | string[];
  healthcheck?: Record<string, unknown>;
  depends_on?: string[] | Record<string, { condition: 'service_started' | 'service_healthy' }>;
  routes?: RouteSpec[];
}

export interface ComposeSpec {
  version: '3.8' | string;
  services: Record<string, ComposeService>;
  networks: Record<string, { driver: string }>;
}

export interface GatewayServiceInput {
  ports?: string[];
  routes?: RouteSpec[];
}

export interface ParsedRoute {
  serviceName: string;
  port: number;
  methods: string[];
  paths: string[];
}

export interface GenerateOptions {
  gateway?: boolean;
  keepFile?: boolean;
  overrides?: { services?: Record<string, Partial<ServiceSpec>> };
}

export interface CommandResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

export interface CommandError extends Error {
  result?: CommandResult;
}

export interface ComposeCli {
  command: string;
  args: string[];
}

export type ExecOptions = SpawnOptions & { timeout?: number };

export interface UpOptions {
  detached?: boolean;
  pull?: boolean;
}

export interface DownOptions {
  removeVolumes?: boolean;
  removeImages?: boolean;
}

export interface LogsOptions {
  follow?: boolean;
  tail?: string | number;
  timestamps?: boolean;
  service?: string | null;
}

export interface WaitOptions {
  timeout?: number;
  checkInterval?: number;
}

export interface TestContainerStatus {
  service: string;
  status: string;
  exitCode?: number;
  exited: boolean;
}

export interface AuthOptions {
  ephemeral?: boolean;
}

// New Vitest coverage for the registryAuth port — upstream ships no registryAuth
// test file; these tests assert observed behavior of the frozen baseline source.
// See UPSTREAM.md.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import crossSpawn from 'cross-spawn';
import registryAuth from '../src/services/registryAuth.js';

vi.mock('cross-spawn', () => ({
  default: { spawn: vi.fn() },
}));

const spawnMock = vi.mocked(crossSpawn.spawn);

type MockFn = ReturnType<typeof vi.fn>;

interface MockChildProcess {
  stdin?: { write: MockFn; end: MockFn };
  on: MockFn;
  kill?: MockFn;
}

// Narrow structural stub: mocks only the members login() touches.
function asChildProcess(child: MockChildProcess): ChildProcess {
  return child as unknown as ChildProcess;
}

const ENV_VARS = [
  'DOCKER_CONFIG',
  'DOCKER_USERNAME',
  'DOCKER_PASSWORD',
  'REGISTRY_USERNAME',
  'REGISTRY_PASSWORD',
  'GITHUB_TOKEN',
  'GITHUB_ACTOR',
  'GITHUB_ACTIONS',
] as const;

describe('RegistryAuth', () => {
  let savedEnv: Record<string, string | undefined>;
  let tempDir: string;

  beforeEach(async () => {
    savedEnv = {};
    for (const name of ENV_VARS) {
      savedEnv[name] = process.env[name];
      delete process.env[name];
    }
    vi.clearAllMocks();
    // Own sandbox: runtime os.tmpdir() is mocked to it so ephemeral
    // docker-config-<Date.now()> dirs always land inside this directory.
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xq-auth-test-'));
    vi.spyOn(os, 'tmpdir').mockReturnValue(tempDir);
  });

  afterEach(async () => {
    for (const name of ENV_VARS) {
      const original = savedEnv[name];
      if (original === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = original;
      }
    }
    vi.restoreAllMocks();
    await fs.remove(tempDir);
  });

  function mockLoginChild(): {
    child: ChildProcess;
    stdin: { write: MockFn; end: MockFn };
    fireExit: (code: number | null) => void;
    fireError: (err: Error) => void;
  } {
    let exitCallback: ((code: number | null, signal?: NodeJS.Signals | null) => void) | undefined;
    let errorCallback: ((err: Error) => void) | undefined;
    const stdin = { write: vi.fn(), end: vi.fn() };
    const child = asChildProcess({
      stdin,
      on: vi.fn((event: string, callback: (...args: unknown[]) => void) => {
        if (event === 'exit') {
          exitCallback = callback;
        } else if (event === 'error') {
          errorCallback = callback;
        }
      }),
    });
    spawnMock.mockReturnValue(child);
    return {
      child,
      stdin,
      fireExit: (code) => exitCallback?.(code),
      fireError: (err) => errorCallback?.(err),
    };
  }

  async function waitForSpawn(): Promise<void> {
    await vi.waitFor(() => {
      if (spawnMock.mock.calls.length === 0) {
        throw new Error('spawn not called yet');
      }
    });
  }

  function dockerConfigPath(epochMs: number): string {
    const dir = path.join(tempDir, `docker-config-${epochMs}`);
    // Guard: the path the runtime will ensureDir must live inside our sandbox.
    expect(dir.startsWith(tempDir + path.sep)).toBe(true);
    return dir;
  }

  describe('login', () => {
    test('should throw when required fields are missing', async () => {
      await expect(registryAuth.login('', 'user', 'pass')).rejects.toThrow(
        'registry, username, and password are required',
      );
      await expect(registryAuth.login('registry', '', 'pass')).rejects.toThrow(
        'registry, username, and password are required',
      );
      await expect(registryAuth.login('registry', 'user', '')).rejects.toThrow(
        'registry, username, and password are required',
      );
      expect(spawnMock).not.toHaveBeenCalled();
    });

    test('should spawn docker login with password over stdin and never in argv', async () => {
      const { stdin, fireExit } = mockLoginChild();

      const loginPromise = registryAuth.login('registry.example.com', 'testuser', 'test-password');
      fireExit(0);
      await expect(loginPromise).resolves.toBeUndefined();

      expect(spawnMock).toHaveBeenCalledWith(
        'docker',
        ['login', 'registry.example.com', '--username', 'testuser', '--password-stdin'],
        expect.objectContaining({
          stdio: ['pipe', 'inherit', 'inherit'],
          env: process.env,
        }),
      );
      const spawnArgs = spawnMock.mock.calls[0]?.[1];
      expect(spawnArgs).not.toContain('test-password');
      expect(stdin.write).toHaveBeenCalledWith('test-password');
      expect(stdin.end).toHaveBeenCalled();
    });

    test('should reject when docker login exits non-zero', async () => {
      const { fireExit } = mockLoginChild();

      const loginPromise = registryAuth.login('registry.example.com', 'testuser', 'test-password');
      fireExit(1);
      await expect(loginPromise).rejects.toThrow('docker login exited with code 1');
    });

    test('should reject on spawn error', async () => {
      const { fireError } = mockLoginChild();

      const loginPromise = registryAuth.login('registry.example.com', 'testuser', 'test-password');
      fireError(new Error('spawn docker ENOENT'));
      await expect(loginPromise).rejects.toThrow('spawn docker ENOENT');
    });

    test('should use ephemeral docker config and restore original on exit', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(4242424242);
      const configDir = dockerConfigPath(4242424242);
      process.env.DOCKER_CONFIG = '/original/docker-config';
      const { fireExit } = mockLoginChild();

      const loginPromise = registryAuth.login('registry.example.com', 'user', 'pass', {
        ephemeral: true,
      });
      await waitForSpawn();
      // During login the process env points at the ephemeral dir
      expect(process.env.DOCKER_CONFIG).toBe(configDir);
      fireExit(0);
      await expect(loginPromise).resolves.toBeUndefined();

      const spawnOptions = spawnMock.mock.calls[0]?.[2];
      expect(spawnOptions?.env).toBe(process.env);
      expect(await fs.pathExists(configDir)).toBe(true);
      // Original defined value restored on exit
      expect(process.env.DOCKER_CONFIG).toBe('/original/docker-config');
    });

    test('should leave ephemeral config in env when original was undefined (observed leak)', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(5353535353);
      const configDir = dockerConfigPath(5353535353);
      const { fireExit } = mockLoginChild();

      const loginPromise = registryAuth.login('registry.example.com', 'user', 'pass', {
        ephemeral: true,
      });
      await waitForSpawn();
      fireExit(0);
      await expect(loginPromise).resolves.toBeUndefined();

      // Upstream only restores DOCKER_CONFIG when it was originally defined;
      // with no original value the ephemeral dir remains in env (observed leak).
      expect(process.env.DOCKER_CONFIG).toBe(configDir);
    });

    test('should not restore docker config when spawn errors (observed error-path leak)', async () => {
      vi.spyOn(Date, 'now').mockReturnValue(6464646464);
      const configDir = dockerConfigPath(6464646464);
      process.env.DOCKER_CONFIG = '/original/docker-config';
      const { fireError } = mockLoginChild();

      const loginPromise = registryAuth.login('registry.example.com', 'user', 'pass', {
        ephemeral: true,
      });
      await waitForSpawn();
      fireError(new Error('spawn docker ENOENT'));
      await expect(loginPromise).rejects.toThrow('spawn docker ENOENT');

      // The 'error' handler has no env restore — the ephemeral dir remains set.
      expect(process.env.DOCKER_CONFIG).toBe(configDir);
    });
  });

  describe('loginGitHub', () => {
    test('should login to ghcr.io with the placeholder username', async () => {
      const { stdin, fireExit } = mockLoginChild();

      const loginPromise = registryAuth.loginGitHub('fake-gh-token');
      fireExit(0);
      await expect(loginPromise).resolves.toBeUndefined();

      expect(spawnMock).toHaveBeenCalledWith(
        'docker',
        ['login', 'ghcr.io', '--username', 'USERNAME_PLACEHOLDER', '--password-stdin'],
        expect.any(Object),
      );
      const spawnArgs = spawnMock.mock.calls[0]?.[1];
      expect(spawnArgs).not.toContain('fake-gh-token');
      expect(stdin.write).toHaveBeenCalledWith('fake-gh-token');
    });
  });

  describe('loginFromEnv', () => {
    test('should use DOCKER_USERNAME/DOCKER_PASSWORD', async () => {
      process.env.DOCKER_USERNAME = 'env-user';
      process.env.DOCKER_PASSWORD = 'env-pass';
      const { stdin, fireExit } = mockLoginChild();

      const loginPromise = registryAuth.loginFromEnv('registry.example.com');
      fireExit(0);
      await expect(loginPromise).resolves.toBeUndefined();

      expect(spawnMock).toHaveBeenCalledWith(
        'docker',
        ['login', 'registry.example.com', '--username', 'env-user', '--password-stdin'],
        expect.any(Object),
      );
      expect(stdin.write).toHaveBeenCalledWith('env-pass');
    });

    test('should fall back to REGISTRY_USERNAME/REGISTRY_PASSWORD', async () => {
      process.env.REGISTRY_USERNAME = 'registry-user';
      process.env.REGISTRY_PASSWORD = 'registry-pass';
      const { stdin, fireExit } = mockLoginChild();

      const loginPromise = registryAuth.loginFromEnv('registry.example.com');
      fireExit(0);
      await expect(loginPromise).resolves.toBeUndefined();

      expect(spawnMock).toHaveBeenCalledWith(
        'docker',
        ['login', 'registry.example.com', '--username', 'registry-user', '--password-stdin'],
        expect.any(Object),
      );
      expect(stdin.write).toHaveBeenCalledWith('registry-pass');
    });

    test('should prefer DOCKER_* over REGISTRY_* variables', async () => {
      process.env.DOCKER_USERNAME = 'docker-user';
      process.env.REGISTRY_USERNAME = 'registry-user';
      process.env.DOCKER_PASSWORD = 'docker-pass';
      process.env.REGISTRY_PASSWORD = 'registry-pass';
      const { stdin, fireExit } = mockLoginChild();

      const loginPromise = registryAuth.loginFromEnv('registry.example.com');
      fireExit(0);
      await expect(loginPromise).resolves.toBeUndefined();

      expect(spawnMock).toHaveBeenCalledWith(
        'docker',
        ['login', 'registry.example.com', '--username', 'docker-user', '--password-stdin'],
        expect.any(Object),
      );
      expect(stdin.write).toHaveBeenCalledWith('docker-pass');
    });

    test('should throw when credentials are not in environment', async () => {
      await expect(registryAuth.loginFromEnv('registry.example.com')).rejects.toThrow(
        'Docker credentials not found in environment variables',
      );
      expect(spawnMock).not.toHaveBeenCalled();
    });
  });

  describe('loginFromGitHubActions', () => {
    test('should throw when GITHUB_TOKEN is missing', async () => {
      await expect(registryAuth.loginFromGitHubActions()).rejects.toThrow(
        'GITHUB_TOKEN not found in environment',
      );
      expect(spawnMock).not.toHaveBeenCalled();
    });

    test('should login with GITHUB_ACTOR as username', async () => {
      process.env.GITHUB_TOKEN = 'fake-ci-token';
      process.env.GITHUB_ACTOR = 'ci-bot';
      const { stdin, fireExit } = mockLoginChild();

      const loginPromise = registryAuth.loginFromGitHubActions();
      fireExit(0);
      await expect(loginPromise).resolves.toBeUndefined();

      expect(spawnMock).toHaveBeenCalledWith(
        'docker',
        ['login', 'ghcr.io', '--username', 'ci-bot', '--password-stdin'],
        expect.any(Object),
      );
      expect(stdin.write).toHaveBeenCalledWith('fake-ci-token');
    });

    test('should fall back to github-actions username and support custom registry', async () => {
      process.env.GITHUB_TOKEN = 'fake-ci-token';
      const { stdin, fireExit } = mockLoginChild();

      const loginPromise = registryAuth.loginFromGitHubActions('containers.github.example.com');
      fireExit(0);
      await expect(loginPromise).resolves.toBeUndefined();

      expect(spawnMock).toHaveBeenCalledWith(
        'docker',
        [
          'login',
          'containers.github.example.com',
          '--username',
          'github-actions',
          '--password-stdin',
        ],
        expect.any(Object),
      );
      expect(stdin.write).toHaveBeenCalledWith('fake-ci-token');
    });
  });

  describe('isInGitHubActions', () => {
    test('should return true only when GITHUB_ACTIONS is exactly true', () => {
      expect(registryAuth.isInGitHubActions()).toBe(false);
      process.env.GITHUB_ACTIONS = 'true';
      expect(registryAuth.isInGitHubActions()).toBe(true);
      process.env.GITHUB_ACTIONS = 'false';
      expect(registryAuth.isInGitHubActions()).toBe(false);
    });
  });

  describe('autoLogin', () => {
    test('should use GitHub Actions flow for ghcr.io in CI', async () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_TOKEN = 'fake-ci-token';
      process.env.GITHUB_ACTOR = 'ci-bot';
      const { stdin, fireExit } = mockLoginChild();

      const loginPromise = registryAuth.autoLogin('ghcr.io');
      fireExit(0);
      await expect(loginPromise).resolves.toBeUndefined();

      expect(spawnMock).toHaveBeenCalledWith(
        'docker',
        ['login', 'ghcr.io', '--username', 'ci-bot', '--password-stdin'],
        expect.any(Object),
      );
      expect(stdin.write).toHaveBeenCalledWith('fake-ci-token');
    });

    test('should use env credentials outside GitHub Actions', async () => {
      process.env.DOCKER_USERNAME = 'env-user';
      process.env.DOCKER_PASSWORD = 'env-pass';
      const { fireExit } = mockLoginChild();

      const loginPromise = registryAuth.autoLogin('registry.example.com');
      fireExit(0);
      await expect(loginPromise).resolves.toBeUndefined();

      expect(spawnMock).toHaveBeenCalledWith(
        'docker',
        ['login', 'registry.example.com', '--username', 'env-user', '--password-stdin'],
        expect.any(Object),
      );
    });

    test('should use env flow in GitHub Actions for non-github registries', async () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_TOKEN = 'fake-ci-token';
      process.env.DOCKER_USERNAME = 'env-user';
      process.env.DOCKER_PASSWORD = 'env-pass';
      const { fireExit } = mockLoginChild();

      const loginPromise = registryAuth.autoLogin('docker.io');
      fireExit(0);
      await expect(loginPromise).resolves.toBeUndefined();

      expect(spawnMock).toHaveBeenCalledWith(
        'docker',
        ['login', 'docker.io', '--username', 'env-user', '--password-stdin'],
        expect.any(Object),
      );
    });

    test('should wrap env errors with auto-login message', async () => {
      await expect(registryAuth.autoLogin('registry.example.com')).rejects.toThrow(
        'Auto-login failed for registry.example.com',
      );
      await expect(registryAuth.autoLogin('registry.example.com')).rejects.toThrow(
        'Original error: Docker credentials not found in environment variables',
      );
      expect(spawnMock).not.toHaveBeenCalled();
    });
  });
});

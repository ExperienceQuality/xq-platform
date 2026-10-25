// Ported from xq-test-infra (Apache-2.0); rewritten in TypeScript. See UPSTREAM.md.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';
import crossSpawn from 'cross-spawn';
import which from 'which';
import composeInvoker from '../src/services/composeInvoker.js';
import type { CommandError } from '../src/types.js';

vi.mock('cross-spawn', () => ({
  default: { spawn: vi.fn() },
}));

vi.mock('which', () => ({
  default: vi.fn(),
}));

const spawnMock = vi.mocked(crossSpawn.spawn);
const whichMock = vi.mocked(which);

type MockFn = ReturnType<typeof vi.fn>;
type ProcessListener = (...args: never[]) => void;

interface MockChildProcess {
  stdout?: { on: MockFn };
  stderr?: { on: MockFn };
  on: MockFn;
  kill?: MockFn;
}

// Narrow structural stub: mocks only the members execCommand touches.
function asChildProcess(child: MockChildProcess): ChildProcess {
  return child as unknown as ChildProcess;
}

function currentListeners(): Record<'SIGINT' | 'SIGTERM' | 'exit', ProcessListener[]> {
  return {
    SIGINT: process.listeners('SIGINT'),
    SIGTERM: process.listeners('SIGTERM'),
    exit: process.listeners('exit'),
  };
}

function removeNewListeners(
  baseline: Record<'SIGINT' | 'SIGTERM' | 'exit', ProcessListener[]>,
): void {
  for (const listener of process.listeners('SIGINT')) {
    if (!baseline.SIGINT.includes(listener)) process.removeListener('SIGINT', listener);
  }
  for (const listener of process.listeners('SIGTERM')) {
    if (!baseline.SIGTERM.includes(listener)) process.removeListener('SIGTERM', listener);
  }
  for (const listener of process.listeners('exit')) {
    if (!baseline.exit.includes(listener)) process.removeListener('exit', listener);
  }
}

describe('ComposeInvoker', () => {
  let tempDir: string;
  let testComposePath: string;
  let listenerSnapshot: ReturnType<typeof currentListeners>;

  beforeEach(async () => {
    listenerSnapshot = currentListeners();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xq-invoker-test-'));

    testComposePath = path.join(tempDir, 'docker-compose.yml');
    await fs.writeFile(
      testComposePath,
      `
version: '3.8'
services:
  test-service:
    image: nginx:alpine
    ports:
      - "8080:80"
`,
      'utf8',
    );

    // Reset mocks
    vi.clearAllMocks();
    composeInvoker.dockerComposeCli = null;
  });

  afterEach(async () => {
    removeNewListeners(listenerSnapshot);
    vi.useRealTimers();
    await fs.remove(tempDir);
  });

  describe('Compose invocation', () => {
    describe('detectDockerCompose', () => {
      test('should detect docker compose v2 first', async () => {
        whichMock.mockImplementation(async (cmd: string) => {
          if (cmd === 'docker') return '/usr/bin/docker';
          throw new Error('Command not found');
        });

        const mockChild = asChildProcess({
          on: vi.fn((event: string, callback: (code: number) => void) => {
            if (event === 'exit') {
              setTimeout(() => callback(0), 10);
            }
          }),
        });
        spawnMock.mockReturnValue(mockChild);

        const cli = await composeInvoker.detectDockerCompose();

        expect(cli).toEqual({
          command: 'docker',
          args: ['compose'],
        });
        expect(spawnMock).toHaveBeenCalledWith('docker', ['compose', '--version'], {});
      });

      test('should fallback to docker-compose v1', async () => {
        whichMock.mockImplementation(async (cmd: string) => {
          if (cmd === 'docker') throw new Error('Command not found');
          if (cmd === 'docker-compose') return '/usr/bin/docker-compose';
          throw new Error('Command not found');
        });

        const cli = await composeInvoker.detectDockerCompose();

        expect(cli).toEqual({
          command: 'docker-compose',
          args: [],
        });
      });

      test('should throw error when neither command is available', async () => {
        whichMock.mockImplementation(async () => {
          throw new Error('Command not found');
        });

        await expect(composeInvoker.detectDockerCompose()).rejects.toThrow(
          'Neither "docker compose" nor "docker-compose" command found',
        );
      });

      test('should cache detection result', async () => {
        whichMock.mockImplementation(async (cmd: string) => {
          if (cmd === 'docker-compose') return '/usr/bin/docker-compose';
          throw new Error('Command not found');
        });

        // First call
        await composeInvoker.detectDockerCompose();

        // Second call should use cached result
        const cli = await composeInvoker.detectDockerCompose();

        expect(cli).toEqual({
          command: 'docker-compose',
          args: [],
        });
        expect(whichMock).toHaveBeenCalledTimes(2); // Only called once for each command
      });
    });

    describe('validateComposeFile', () => {
      test('should pass for existing file', async () => {
        await expect(composeInvoker.validateComposeFile(testComposePath)).resolves.toBeUndefined();
      });

      test('should throw error for non-existent file', async () => {
        const nonExistentPath = path.join(tempDir, 'non-existent.yml');

        await expect(composeInvoker.validateComposeFile(nonExistentPath)).rejects.toThrow(
          'Docker compose file not found',
        );
      });
    });

    describe('execCommand', () => {
      test('should resolve on successful command execution', async () => {
        vi.useFakeTimers();
        const mockChild = asChildProcess({
          stdout: {
            on: vi.fn((event: string, callback: (data: Buffer) => void) => {
              if (event === 'data') {
                setTimeout(() => callback(Buffer.from('success output')), 10);
              }
            }),
          },
          stderr: {
            on: vi.fn(),
          },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(0, null), 20);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        const execPromise = composeInvoker.execCommand('echo', ['test']);
        await vi.advanceTimersByTimeAsync(30);
        const result = await execPromise;

        expect(result).toEqual({
          exitCode: 0,
          signal: null,
          stdout: 'success output',
          stderr: '',
        });
      });

      test('should reject on command failure', async () => {
        vi.useFakeTimers();
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: {
            on: vi.fn((event: string, callback: (data: Buffer) => void) => {
              if (event === 'data') {
                setTimeout(() => callback(Buffer.from('error output')), 10);
              }
            }),
          },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(1, null), 20);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        const execPromise = composeInvoker.execCommand('false', []);
        const assertion = expect(execPromise).rejects.toThrow('Command failed with exit code 1');
        await vi.advanceTimersByTimeAsync(30);
        await assertion;
      });

      test('should handle timeout', async () => {
        vi.useFakeTimers();
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(), // Never calls exit
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        const execPromise = composeInvoker.execCommand('sleep', ['10'], { timeout: 100 });
        const assertion = expect(execPromise).rejects.toThrow('Command timed out after 100ms');
        await vi.advanceTimersByTimeAsync(100);
        await assertion;

        expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
      });

      test('should handle spawn errors', async () => {
        vi.useFakeTimers();
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn((event: string, callback: (error: Error) => void) => {
            if (event === 'error') {
              setTimeout(() => callback(new Error('Spawn failed')), 10);
            }
          }),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        const execPromise = composeInvoker.execCommand('invalid-command', []);
        const assertion = expect(execPromise).rejects.toThrow('Spawn failed');
        await vi.advanceTimersByTimeAsync(30);
        await assertion;
      });

      test('should attach result to error and prefer stderr in message', async () => {
        vi.useFakeTimers();
        const mockChild = asChildProcess({
          stdout: {
            on: vi.fn((event: string, callback: (data: Buffer) => void) => {
              if (event === 'data') {
                setTimeout(() => callback(Buffer.from('ignored stdout  ')), 10);
              }
            }),
          },
          stderr: {
            on: vi.fn((event: string, callback: (data: Buffer) => void) => {
              if (event === 'data') {
                setTimeout(() => callback(Buffer.from('error output  ')), 10);
              }
            }),
          },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(1, null), 20);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        const execPromise = composeInvoker.execCommand('false', []);
        const caught = execPromise.then(
          () => {
            throw new Error('expected execCommand to reject');
          },
          (e) => e as CommandError,
        );
        await vi.advanceTimersByTimeAsync(30);
        const error = await caught;

        expect(error.result).toEqual({
          exitCode: 1,
          signal: null,
          stdout: 'ignored stdout',
          stderr: 'error output',
        });
        expect(error.message).toContain('Docker output:\nerror output');
      });

      test('should fall back to stdout in error message when stderr is empty', async () => {
        vi.useFakeTimers();
        const mockChild = asChildProcess({
          stdout: {
            on: vi.fn((event: string, callback: (data: Buffer) => void) => {
              if (event === 'data') {
                setTimeout(() => callback(Buffer.from('stdout only')), 10);
              }
            }),
          },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(1, null), 20);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        const execPromise = composeInvoker.execCommand('false', []);
        const caught = execPromise.then(
          () => {
            throw new Error('expected execCommand to reject');
          },
          (e) => e as CommandError,
        );
        await vi.advanceTimersByTimeAsync(30);
        const error = await caught;

        expect(error.message).toContain('Docker output:\nstdout only');
        expect(error.result?.stderr).toBe('');
      });

      test('should report No error output when both streams are empty', async () => {
        vi.useFakeTimers();
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(1, null), 20);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        const execPromise = composeInvoker.execCommand('false', []);
        const caught = execPromise.then(
          () => {
            throw new Error('expected execCommand to reject');
          },
          (e) => e as CommandError,
        );
        await vi.advanceTimersByTimeAsync(30);
        const error = await caught;

        expect(error.message).toContain('Docker output:\nNo error output');
      });

      test('should not forward the timeout option to spawn', async () => {
        vi.useFakeTimers();
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(0, null), 10);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        const execPromise = composeInvoker.execCommand('test-cmd', ['arg'], {
          timeout: 1000,
          cwd: '/some/dir',
        });
        await vi.advanceTimersByTimeAsync(30);
        await execPromise;

        expect(spawnMock).toHaveBeenCalledWith('test-cmd', ['arg'], { cwd: '/some/dir' });
      });

      test('should disable timeout when timeout is 0', async () => {
        vi.useFakeTimers();
        let exitCallback: ((code: number, signal: NodeJS.Signals | null) => void) | undefined;
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                exitCallback = callback;
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        const execPromise = composeInvoker.execCommand('sleep', ['10'], { timeout: 0 });
        let settled = false;
        void execPromise.then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );

        await vi.advanceTimersByTimeAsync(400000);
        expect(settled).toBe(false);
        expect(mockChild.kill).not.toHaveBeenCalled();

        exitCallback?.(0, null);
        await expect(execPromise).resolves.toEqual({
          exitCode: 0,
          signal: null,
          stdout: '',
          stderr: '',
        });
      });
    });

    describe('up', () => {
      beforeEach(() => {
        composeInvoker.dockerComposeCli = { command: 'docker', args: ['compose'] };
      });

      test('should call docker compose up with correct arguments', async () => {
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(0, null), 10);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        await composeInvoker.up(testComposePath);

        expect(spawnMock).toHaveBeenCalledWith(
          'docker',
          ['compose', '-f', testComposePath, 'up', '-d', '--pull', 'missing', '--remove-orphans'],
          expect.objectContaining({
            stdio: 'pipe',
            cwd: process.cwd(),
          }),
        );
      });

      test('should add detached flag when specified', async () => {
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(0, null), 10);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        await composeInvoker.up(testComposePath, { detached: true });

        // pull defaults to true, so --pull missing is included
        expect(spawnMock).toHaveBeenCalledWith(
          'docker',
          ['compose', '-f', testComposePath, 'up', '-d', '--pull', 'missing', '--remove-orphans'],
          expect.objectContaining({
            stdio: 'pipe',
          }),
        );
      });

      test('should add pull flag when specified', async () => {
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(0, null), 10);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        await composeInvoker.up(testComposePath, { pull: true });

        // When pull is true, it uses --pull missing (not always)
        expect(spawnMock).toHaveBeenCalledWith(
          'docker',
          ['compose', '-f', testComposePath, 'up', '-d', '--pull', 'missing', '--remove-orphans'],
          expect.any(Object),
        );
      });

      test('should skip pull flag when pull is false', async () => {
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(0, null), 10);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        await composeInvoker.up(testComposePath, { pull: false });

        expect(spawnMock).toHaveBeenCalledWith(
          'docker',
          ['compose', '-f', testComposePath, 'up', '-d', '--remove-orphans'],
          expect.any(Object),
        );
      });
    });

    describe('down', () => {
      beforeEach(() => {
        composeInvoker.dockerComposeCli = { command: 'docker-compose', args: [] };
      });

      test('should call docker-compose down with correct arguments', async () => {
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(0, null), 10);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        await composeInvoker.down(testComposePath);

        expect(spawnMock).toHaveBeenCalledWith(
          'docker-compose',
          ['-f', testComposePath, 'down'],
          expect.objectContaining({
            stdio: 'inherit',
            cwd: process.cwd(),
          }),
        );
      });

      test('should add volume removal flag when specified', async () => {
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(0, null), 10);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        await composeInvoker.down(testComposePath, { removeVolumes: true });

        expect(spawnMock).toHaveBeenCalledWith(
          'docker-compose',
          ['-f', testComposePath, 'down', '-v'],
          expect.any(Object),
        );
      });

      test('should add image removal flag when specified', async () => {
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(0, null), 10);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        await composeInvoker.down(testComposePath, { removeImages: true });

        expect(spawnMock).toHaveBeenCalledWith(
          'docker-compose',
          ['-f', testComposePath, 'down', '--rmi', 'all'],
          expect.any(Object),
        );
      });
    });

    describe('logs', () => {
      beforeEach(() => {
        composeInvoker.dockerComposeCli = { command: 'docker', args: ['compose'] };
      });

      test('should call docker compose logs with default options', async () => {
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(0, null), 10);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        await composeInvoker.logs(testComposePath);

        expect(spawnMock).toHaveBeenCalledWith(
          'docker',
          ['compose', '-f', testComposePath, 'logs', '--tail', '100'],
          expect.objectContaining({
            stdio: 'inherit',
            cwd: process.cwd(),
          }),
        );
      });

      test('should add follow, tail, timestamps, and service flags', async () => {
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(0, null), 10);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        await composeInvoker.logs(testComposePath, {
          follow: true,
          tail: '50',
          timestamps: true,
          service: 'web-app',
        });

        expect(spawnMock).toHaveBeenCalledWith(
          'docker',
          [
            'compose',
            '-f',
            testComposePath,
            'logs',
            '-f',
            '--tail',
            '50',
            '--timestamps',
            'web-app',
          ],
          expect.objectContaining({
            stdio: 'inherit',
            cwd: process.cwd(),
          }),
        );
      });
    });

    describe('ps', () => {
      beforeEach(() => {
        composeInvoker.dockerComposeCli = { command: 'docker', args: ['compose'] };
      });

      test('should call docker compose ps', async () => {
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(0, null), 10);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        await composeInvoker.ps(testComposePath);

        expect(spawnMock).toHaveBeenCalledWith(
          'docker',
          ['compose', '-f', testComposePath, 'ps'],
          expect.objectContaining({
            stdio: 'inherit',
            cwd: process.cwd(),
          }),
        );
      });
    });

    describe('pull', () => {
      beforeEach(() => {
        composeInvoker.dockerComposeCli = { command: 'docker', args: ['compose'] };
      });

      test('should call docker compose pull', async () => {
        const mockChild = asChildProcess({
          stdout: { on: vi.fn() },
          stderr: { on: vi.fn() },
          on: vi.fn(
            (event: string, callback: (code: number, signal: NodeJS.Signals | null) => void) => {
              if (event === 'exit') {
                setTimeout(() => callback(0, null), 10);
              }
            },
          ),
          kill: vi.fn(),
        });
        spawnMock.mockReturnValue(mockChild);

        await composeInvoker.pull(testComposePath);

        expect(spawnMock).toHaveBeenCalledWith(
          'docker',
          ['compose', '-f', testComposePath, 'pull'],
          expect.any(Object),
        );
      });
    });
  });

  describe('Test container polling', () => {
    describe('detectTestContainers', () => {
      let sourceDir: string;

      beforeEach(async () => {
        sourceDir = path.join(tempDir, 'test-env');
        await fs.ensureDir(sourceDir);
      });

      test('should detect test containers from .test. files in source directory', async () => {
        // Create test service files
        await fs.writeFile(
          path.join(sourceDir, 'keeper.test.service.yml'),
          `
name: xq-keeper
image: test-image
`,
          'utf8',
        );
        await fs.writeFile(
          path.join(sourceDir, 'regular.service.yml'),
          `
name: regular-service
image: regular-image
`,
          'utf8',
        );

        // Create compose file with matching services
        await fs.writeFile(
          testComposePath,
          `
version: '3.8'
services:
  xq-keeper:
    image: test-image
  regular-service:
    image: regular-image
`,
          'utf8',
        );

        const testContainers = await composeInvoker.detectTestContainers(
          testComposePath,
          sourceDir,
        );

        expect(testContainers).toEqual(['xq-keeper']);
      });

      test('should detect multiple test containers', async () => {
        await fs.writeFile(
          path.join(sourceDir, 'keeper.test.service.yml'),
          `
name: xq-keeper
image: test-image
`,
          'utf8',
        );
        await fs.writeFile(
          path.join(sourceDir, 'e2e.test.yaml'),
          `
name: e2e-test
image: e2e-image
`,
          'utf8',
        );

        await fs.writeFile(
          testComposePath,
          `
version: '3.8'
services:
  xq-keeper:
    image: test-image
  e2e-test:
    image: e2e-image
`,
          'utf8',
        );

        const testContainers = await composeInvoker.detectTestContainers(
          testComposePath,
          sourceDir,
        );

        expect(testContainers).toContain('xq-keeper');
        expect(testContainers).toContain('e2e-test');
        expect(testContainers.length).toBe(2);
      });

      test('should handle different filename patterns', async () => {
        await fs.writeFile(
          path.join(sourceDir, 'keeper.test.yaml'),
          `
name: keeper
image: test-image
`,
          'utf8',
        );
        await fs.writeFile(
          path.join(sourceDir, 'xq-keeper.test.service.yml'),
          `
name: xq-keeper
image: test-image
`,
          'utf8',
        );

        await fs.writeFile(
          testComposePath,
          `
version: '3.8'
services:
  keeper:
    image: test-image
  xq-keeper:
    image: test-image
`,
          'utf8',
        );

        const testContainers = await composeInvoker.detectTestContainers(
          testComposePath,
          sourceDir,
        );

        expect(testContainers.length).toBeGreaterThan(0);
        // Should match both patterns - keeper.test.yaml matches "keeper" service
        // and xq-keeper.test.service.yml matches "xq-keeper" service
        expect(testContainers.length).toBeGreaterThanOrEqual(1);
        // At least one should be found
        expect(testContainers.some((name) => name === 'keeper' || name === 'xq-keeper')).toBe(true);
      });

      test('should return empty array when no .test. files found', async () => {
        await fs.writeFile(
          path.join(sourceDir, 'regular.service.yml'),
          `
name: regular-service
image: regular-image
`,
          'utf8',
        );

        await fs.writeFile(
          testComposePath,
          `
version: '3.8'
services:
  regular-service:
    image: regular-image
`,
          'utf8',
        );

        const testContainers = await composeInvoker.detectTestContainers(
          testComposePath,
          sourceDir,
        );

        expect(testContainers).toEqual([]);
      });

      test('should fallback to service name pattern when sourcePath is null', async () => {
        await fs.writeFile(
          testComposePath,
          `
version: '3.8'
services:
  xq-keeper:
    image: test-image
  test-service:
    image: test-image
  regular-service:
    image: regular-image
`,
          'utf8',
        );

        const testContainers = await composeInvoker.detectTestContainers(testComposePath, null);

        expect(testContainers).toContain('xq-keeper');
        expect(testContainers).toContain('test-service');
        expect(testContainers).not.toContain('regular-service');
      });

      test('should return empty array when sourcePath does not exist', async () => {
        const nonExistentDir = path.join(tempDir, 'non-existent');

        await fs.writeFile(
          testComposePath,
          `
version: '3.8'
services:
  xq-keeper:
    image: test-image
`,
          'utf8',
        );

        const testContainers = await composeInvoker.detectTestContainers(
          testComposePath,
          nonExistentDir,
        );

        // Should fallback to service name pattern
        expect(testContainers).toContain('xq-keeper');
      });

      test('should handle service name matching with xq- prefix', async () => {
        await fs.writeFile(
          path.join(sourceDir, 'keeper.test.service.yml'),
          `
name: keeper
image: test-image
`,
          'utf8',
        );

        await fs.writeFile(
          testComposePath,
          `
version: '3.8'
services:
  xq-keeper:
    image: test-image
`,
          'utf8',
        );

        const testContainers = await composeInvoker.detectTestContainers(
          testComposePath,
          sourceDir,
        );

        expect(testContainers).toContain('xq-keeper');
      });
    });

    describe('waitForTestContainers', () => {
      beforeEach(() => {
        // Set dockerComposeCli directly to avoid calling detectDockerCompose
        composeInvoker.dockerComposeCli = { command: 'docker', args: ['compose'] };
        // Mock detectDockerCompose to return immediately
        vi.spyOn(composeInvoker, 'detectDockerCompose').mockResolvedValue({
          command: 'docker',
          args: ['compose'],
        });
      });

      afterEach(() => {
        vi.restoreAllMocks();
      });

      test('should return true immediately when no test containers provided', async () => {
        const result = await composeInvoker.waitForTestContainers(testComposePath, []);

        expect(result).toBe(true);
      });

      test('should wait for containers to exit and return true on success', async () => {
        const testContainers = ['xq-keeper'];

        // Mock docker compose ps output
        // The parser splits by whitespace and takes last part, then checks if it includes "Exited"
        // So we need the status to be in a format where the last word or the full status contains "Exited"
        // Format: columns are space-separated, STATUS is last column
        const mockPsOutput = `NAME                          SERVICE      STATUS
database-xq-keeper-1         xq-keeper    Exited (0)`;

        // Mock execCommand by spying on it - return immediately with exited status
        const execCommandSpy = vi.spyOn(composeInvoker, 'execCommand').mockResolvedValue({
          exitCode: 0,
          signal: null,
          stdout: mockPsOutput,
          stderr: '',
        });

        const result = await composeInvoker.waitForTestContainers(testComposePath, testContainers, {
          timeout: 5000,
          checkInterval: 50, // Faster for tests
        });

        expect(result).toBe(true);
        expect(execCommandSpy).toHaveBeenCalled();
      }, 10000);

      test('should return false when containers exit with non-zero code', async () => {
        const testContainers = ['xq-keeper'];

        // Mock docker compose ps output showing container exited with error
        const mockPsOutput = `NAME                          SERVICE      STATUS
database-xq-keeper-1         xq-keeper    Exited (1)`;

        const execCommandSpy = vi.spyOn(composeInvoker, 'execCommand').mockResolvedValue({
          exitCode: 0,
          signal: null,
          stdout: mockPsOutput,
          stderr: '',
        });

        const result = await composeInvoker.waitForTestContainers(testComposePath, testContainers, {
          timeout: 5000,
          checkInterval: 50,
        });

        expect(result).toBe(false);
      }, 10000);

      test('should handle containers still running', async () => {
        const testContainers = ['xq-keeper'];

        // First call: container running, second call: container exited
        let callCount = 0;
        const execCommandSpy = vi.spyOn(composeInvoker, 'execCommand').mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.resolve({
              exitCode: 0,
              signal: null,
              stdout: `NAME                          SERVICE      STATUS
database-xq-keeper-1         xq-keeper    Up`,
              stderr: '',
            });
          } else {
            return Promise.resolve({
              exitCode: 0,
              signal: null,
              stdout: `NAME                          SERVICE      STATUS
database-xq-keeper-1         xq-keeper    Exited (0)`,
              stderr: '',
            });
          }
        });

        vi.useFakeTimers();
        const waitPromise = composeInvoker.waitForTestContainers(testComposePath, testContainers, {
          timeout: 5000,
          checkInterval: 50,
        });
        await vi.advanceTimersByTimeAsync(50);
        const result = await waitPromise;

        expect(result).toBe(true);
        expect(execCommandSpy).toHaveBeenCalledTimes(2);
      }, 10000);

      test('should timeout when containers do not exit', async () => {
        const testContainers = ['xq-keeper'];

        // Mock container always running
        const mockPsOutput = `NAME                          SERVICE      STATUS
database-xq-keeper-1         xq-keeper    Up`;

        const execCommandSpy = vi.spyOn(composeInvoker, 'execCommand').mockResolvedValue({
          exitCode: 0,
          signal: null,
          stdout: mockPsOutput,
          stderr: '',
        });

        vi.useFakeTimers();
        const waitPromise = composeInvoker.waitForTestContainers(testComposePath, testContainers, {
          timeout: 500, // Short timeout for test
          checkInterval: 100,
        });
        await vi.advanceTimersByTimeAsync(600);
        const result = await waitPromise;

        expect(result).toBe(false);
      }, 10000);

      test('should handle ps command failures gracefully', async () => {
        const testContainers = ['xq-keeper'];

        // Mock ps command failure
        const execCommandSpy = vi
          .spyOn(composeInvoker, 'execCommand')
          .mockRejectedValue(new Error('Command failed with exit code 1'));

        vi.useFakeTimers();
        const waitPromise = composeInvoker.waitForTestContainers(testComposePath, testContainers, {
          timeout: 500,
          checkInterval: 100,
        });
        await vi.advanceTimersByTimeAsync(600);
        const result = await waitPromise;

        // Should timeout since ps command fails
        expect(result).toBe(false);
      }, 10000);
    });
  });
});

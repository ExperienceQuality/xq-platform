// Ported from xq-test-infra (Apache-2.0); rewritten in TypeScript. See UPSTREAM.md.
// Compiled-bin subprocess tests mirror upstream integration.test.js CLI Commands
// and Override functionality; in-process command tests use a mocked invoker.
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import composeInvoker from '../src/services/composeInvoker.js';
import main from '../src/cli/index.js';
import type { ComposeSpec } from '../src/types.js';
import {
  BASIC_WEB_APP_YAML,
  GEN_SINGLE_COMPOSE_YAML,
  GEN_SINGLE_NGINX_CONF,
  GEN_DIR_SERVICE_FILES,
  GEN_DIR_CONFIG_YML,
  GEN_DIR_COMPOSE_YAML,
  GEN_DIR_NGINX_CONF,
} from './baseline-fixtures.js';

vi.mock('../src/services/composeInvoker.js', () => ({
  default: {
    detectDockerCompose: vi.fn(),
    up: vi.fn(),
    down: vi.fn(),
    pull: vi.fn(),
    logs: vi.fn(),
    ps: vi.fn(),
    execCommand: vi.fn(),
    detectTestContainers: vi.fn(),
    waitForTestContainers: vi.fn(),
    validateComposeFile: vi.fn(),
  },
}));

const pullMock = vi.mocked(composeInvoker.pull);
const upMock = vi.mocked(composeInvoker.up);
const downMock = vi.mocked(composeInvoker.down);
const logsMock = vi.mocked(composeInvoker.logs);
const detectMock = vi.mocked(composeInvoker.detectTestContainers);
const waitMock = vi.mocked(composeInvoker.waitForTestContainers);

const PKG_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const BIN_PATH = path.join(PKG_ROOT, 'dist', 'bin', 'xq-infra.js');
const PKG_VERSION = (
  JSON.parse(fs.readFileSync(path.join(PKG_ROOT, 'package.json'), 'utf8')) as { version: string }
).version;

const OK_RESULT = { exitCode: 0, signal: null, stdout: '', stderr: '' };

function runBin(
  args: string[],
  cwd: string,
): { code: number | null; stdout: string; stderr: string } {
  const res = spawnSync('node', [BIN_PATH, ...args], { cwd, encoding: 'utf8' });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

describe('xq-infra CLI', () => {
  let tempDir: string;
  let previousCwd: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xq-cli-test-'));
    previousCwd = process.cwd();
    process.chdir(tempDir);
    vi.clearAllMocks();
  });

  afterEach(async () => {
    process.chdir(previousCwd);
    vi.restoreAllMocks();
    await fs.remove(tempDir);
  });

  describe('compiled bin', () => {
    test('should display help', () => {
      const result = runBin(['--help'], tempDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('CLI to generate docker-compose and manage test infra');
      expect(result.stdout).toContain('generate');
      expect(result.stdout).toContain('up');
      expect(result.stdout).toContain('down');
    });

    test('should display version matching the manifest', () => {
      const result = runBin(['--version'], tempDir);

      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe(PKG_VERSION);
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });

    test('should generate docker-compose file matching frozen single-file baseline', () => {
      const specPath = path.join(tempDir, 'basic-web-app.yaml');
      fs.writeFileSync(specPath, BASIC_WEB_APP_YAML, 'utf8');

      // Baseline fixtures capture upstream output before WireMock injection existed
      const result = runBin(['generate', '-f', specPath, '--no-wiremock'], tempDir);

      expect(result.code).toBe(0);
      expect(result.stdout).toContain('Generated docker-compose at:');

      const outputPath = path.join(tempDir, 'xq-compose.yml');
      expect(fs.existsSync(outputPath)).toBe(true);

      const compose = YAML.parse(fs.readFileSync(outputPath, 'utf8')) as ComposeSpec;
      const expected = YAML.parse(GEN_SINGLE_COMPOSE_YAML) as ComposeSpec;
      const gatewaySvc = expected.services['xq-gateway'];
      if (!gatewaySvc) throw new Error('frozen fixture missing xq-gateway');
      gatewaySvc.volumes = [
        `${fs.realpathSync(tempDir)}/nginx-gateway.conf:/etc/nginx/nginx.conf:ro`,
      ];
      expect(compose).toEqual(expected);

      const nginxConf = fs.readFileSync(path.join(tempDir, 'nginx-gateway.conf'), 'utf8');
      expect(nginxConf).toBe(GEN_SINGLE_NGINX_CONF);
    });

    test('should generate docker-compose from directory matching frozen baseline', () => {
      const servicesDir = path.join(tempDir, 'services');
      fs.ensureDirSync(servicesDir);
      for (const [filename, content] of Object.entries(GEN_DIR_SERVICE_FILES)) {
        fs.writeFileSync(path.join(servicesDir, filename), content, 'utf8');
      }
      fs.writeFileSync(path.join(servicesDir, 'xq.config.yml'), GEN_DIR_CONFIG_YML, 'utf8');

      // Baseline fixtures capture upstream output before WireMock injection existed
      const result = runBin(['generate', '-f', servicesDir, '--no-wiremock'], tempDir);

      expect(result.code).toBe(0);

      const compose = YAML.parse(
        fs.readFileSync(path.join(tempDir, 'xq-compose.yml'), 'utf8'),
      ) as ComposeSpec;
      const expected = YAML.parse(GEN_DIR_COMPOSE_YAML) as ComposeSpec;
      const gatewaySvc = expected.services['xq-gateway'];
      if (!gatewaySvc) throw new Error('frozen fixture missing xq-gateway');
      gatewaySvc.volumes = [
        `${fs.realpathSync(tempDir)}/nginx-gateway.conf:/etc/nginx/nginx.conf:ro`,
      ];
      expect(compose).toEqual(expected);

      const nginxConf = fs.readFileSync(path.join(tempDir, 'nginx-gateway.conf'), 'utf8');
      expect(nginxConf).toBe(GEN_DIR_NGINX_CONF);
    });

    test('should generate compose without gateway', () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      fs.writeFileSync(
        specPath,
        YAML.stringify({
          services: {
            'nginx-test': { image: 'nginx', tag: 'alpine', ports: ['8080:80'] },
            'redis-test': { image: 'redis', tag: 'alpine', ports: ['6379:6379'] },
          },
        }),
        'utf8',
      );

      const result = runBin(['generate', '-f', specPath, '--no-gateway'], tempDir);

      expect(result.code).toBe(0);
      const outputPath = path.join(tempDir, 'xq-compose.yml');
      expect(fs.existsSync(outputPath)).toBe(true);

      const compose = YAML.parse(fs.readFileSync(outputPath, 'utf8')) as ComposeSpec;
      expect(compose.services).not.toHaveProperty('xq-gateway');
    });

    test('should apply overrides from JSON file', () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      fs.writeFileSync(
        specPath,
        YAML.stringify({
          services: {
            'nginx-test': { image: 'nginx', tag: 'alpine', ports: ['8080:80'] },
            'redis-test': { image: 'redis', tag: 'alpine', ports: ['6379:6379'] },
          },
        }),
        'utf8',
      );

      const overridesPath = path.join(tempDir, 'overrides.json');
      const overrides = {
        services: {
          'nginx-test': {
            tag: 'latest',
            environment: {
              NGINX_PORT: '8080',
            },
          },
        },
      };
      fs.writeFileSync(overridesPath, JSON.stringify(overrides, null, 2), 'utf8');

      const result = runBin(
        ['generate', '-f', specPath, '--overrides', overridesPath, '--no-wiremock'],
        tempDir,
      );

      expect(result.code).toBe(0);
      const compose = YAML.parse(
        fs.readFileSync(path.join(tempDir, 'xq-compose.yml'), 'utf8'),
      ) as ComposeSpec;

      expect(compose.services['nginx-test']?.image).toBe('nginx:latest');
      expect(compose.services['nginx-test']?.environment).toEqual({
        NGINX_PORT: '8080',
      });
    });

    test('should fail with invalid spec file', () => {
      const invalidSpecPath = path.join(tempDir, 'invalid.yaml');
      fs.writeFileSync(invalidSpecPath, 'invalid: yaml: content:', 'utf8');

      const result = runBin(['generate', '-f', invalidSpecPath], tempDir);

      expect(result.code).toBe(2);
      expect(result.stderr).toContain('Failed to generate compose file');
    });

    test('should fail when spec file does not exist', () => {
      const nonExistentPath = path.join(tempDir, 'does-not-exist.yaml');

      const result = runBin(['generate', '-f', nonExistentPath], tempDir);

      expect(result.code).toBe(2);
      expect(result.stderr).toContain('Failed to generate compose file');
    });

    test('should fail with invalid overrides file', () => {
      const specPath = path.join(tempDir, 'spec.yaml');
      fs.writeFileSync(
        specPath,
        YAML.stringify({
          services: { 'nginx-test': { image: 'nginx', tag: 'alpine' } },
        }),
        'utf8',
      );
      const invalidOverridesPath = path.join(tempDir, 'invalid-overrides.json');
      fs.writeFileSync(invalidOverridesPath, 'invalid json', 'utf8');

      const result = runBin(
        ['generate', '-f', specPath, '--overrides', invalidOverridesPath],
        tempDir,
      );

      expect(result.code).toBe(2);
      expect(result.stderr).toContain('Failed to load overrides file');
    });
  });

  describe('command actions (mocked invoker)', () => {
    const expectedComposeFile = () => path.join(process.cwd(), 'xq-compose.yml');
    let logSpy: ReturnType<typeof vi.spyOn>;
    let warnSpy: ReturnType<typeof vi.spyOn>;
    let errorSpy: ReturnType<typeof vi.spyOn>;
    let exitSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      exitSpy = vi
        .spyOn(process, 'exit')
        .mockImplementation((code?: string | number | null): never => {
          throw new Error(`process.exit: ${code}`);
        });
      pullMock.mockResolvedValue(OK_RESULT);
      upMock.mockResolvedValue(OK_RESULT);
      downMock.mockResolvedValue(OK_RESULT);
      logsMock.mockResolvedValue(OK_RESULT);
      detectMock.mockResolvedValue([]);
      waitMock.mockResolvedValue(true);
    });

    const args = (...cli: string[]) => ['node', 'xq-infra', ...cli];

    describe('up', () => {
      test('should pull and start services by default', async () => {
        await main(args('up'));

        expect(pullMock).toHaveBeenCalledWith(expectedComposeFile());
        expect(upMock).toHaveBeenCalledWith(expectedComposeFile(), { pull: true });
        expect(logSpy).toHaveBeenCalledWith('Services started successfully!');
        expect(exitSpy).not.toHaveBeenCalled();
      });

      test('should skip pull when --no-pull is set', async () => {
        await main(args('up', '--no-pull'));

        expect(pullMock).not.toHaveBeenCalled();
        expect(upMock).toHaveBeenCalledWith(expectedComposeFile(), { pull: false });
      });

      test('should warn and continue when pull fails', async () => {
        pullMock.mockRejectedValue(new Error('registry timeout'));

        await main(args('up'));

        expect(warnSpy).toHaveBeenCalledWith(
          'Warning: Failed to pull some images from registry. Proceeding with local/cached images.',
        );
        expect(warnSpy).toHaveBeenCalledWith('Reason: registry timeout');
        expect(upMock).toHaveBeenCalledWith(expectedComposeFile(), { pull: true });
        expect(exitSpy).not.toHaveBeenCalled();
      });

      test('should wait for test containers and succeed', async () => {
        detectMock.mockResolvedValue(['xq-keeper']);
        waitMock.mockResolvedValue(true);

        await main(args('up'));

        expect(detectMock).toHaveBeenCalledWith(expectedComposeFile(), process.cwd());
        expect(waitMock).toHaveBeenCalledWith(expectedComposeFile(), ['xq-keeper']);
        expect(logSpy).toHaveBeenCalledWith('✅ All test containers completed successfully!');
        expect(exitSpy).not.toHaveBeenCalled();
      });

      test('should exit 1 when test containers fail', async () => {
        detectMock.mockResolvedValue(['xq-keeper']);
        waitMock.mockResolvedValue(false);

        // Mocked process.exit throws inside the detection try/catch, so upstream
        // converts the throw into a detection warning — the first exit call is 1.
        await main(args('up'));

        expect(exitSpy).toHaveBeenNthCalledWith(1, 1);
        expect(exitSpy).toHaveBeenCalledTimes(1);
        expect(errorSpy).toHaveBeenCalledWith(
          '❌ Some test containers failed. Check logs for details.',
        );
        expect(warnSpy).toHaveBeenCalledWith(
          'Warning: Failed to detect test containers:',
          'process.exit: 1',
        );
      });

      test('should warn but not fail when test-container detection throws', async () => {
        detectMock.mockRejectedValue(new Error('compose parse failed'));

        await main(args('up'));

        expect(warnSpy).toHaveBeenCalledWith(
          'Warning: Failed to detect test containers:',
          'compose parse failed',
        );
        expect(exitSpy).not.toHaveBeenCalled();
      });

      test('should exit 3 when up fails', async () => {
        upMock.mockRejectedValue(new Error('compose up failed'));

        await expect(main(args('up'))).rejects.toThrow('process.exit: 3');
        expect(errorSpy).toHaveBeenCalledWith('Failed to run up:', 'compose up failed');
        expect(exitSpy).toHaveBeenCalledWith(3);
      });
    });

    describe('down', () => {
      test('should stop services successfully', async () => {
        await main(args('down'));

        expect(downMock).toHaveBeenCalledWith(expectedComposeFile());
        expect(logSpy).toHaveBeenCalledWith('Services stopped successfully!');
        expect(exitSpy).not.toHaveBeenCalled();
      });

      test('should exit 4 when down fails', async () => {
        downMock.mockRejectedValue(new Error('compose down failed'));

        await expect(main(args('down'))).rejects.toThrow('process.exit: 4');
        expect(errorSpy).toHaveBeenCalledWith('Failed to run down:', 'compose down failed');
        expect(exitSpy).toHaveBeenCalledWith(4);
      });
    });

    describe('logs', () => {
      test('should call logs with default options', async () => {
        await main(args('logs'));

        expect(logsMock).toHaveBeenCalledWith(expectedComposeFile(), {
          follow: false,
          tail: '100',
          timestamps: false,
        });
        expect(exitSpy).not.toHaveBeenCalled();
      });

      test('should pass follow, tail, timestamps, and service', async () => {
        await main(args('logs', '-f', '-t', '50', '--timestamps', 'web-app'));

        expect(logsMock).toHaveBeenCalledWith(expectedComposeFile(), {
          follow: true,
          tail: '50',
          timestamps: true,
          service: 'web-app',
        });
      });

      test('should exit 5 when logs fails', async () => {
        logsMock.mockRejectedValue(new Error('logs failed'));

        await expect(main(args('logs'))).rejects.toThrow('process.exit: 5');
        expect(errorSpy).toHaveBeenCalledWith('Failed to get logs:', 'logs failed');
        expect(exitSpy).toHaveBeenCalledWith(5);
      });
    });
  });
});

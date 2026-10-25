// Ported from xq-test-infra (Apache-2.0); rewritten in TypeScript. See UPSTREAM.md.
import crossSpawn from 'cross-spawn';
import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import type { AuthOptions } from '../types.js';

class RegistryAuth {
  async login(
    registry: string,
    username: string,
    password: string,
    options: AuthOptions = {},
  ): Promise<void> {
    const { ephemeral = false } = options;

    if (!registry || !username || !password) {
      throw new Error('registry, username, and password are required');
    }

    // Setup ephemeral docker config if requested (useful for CI)
    let originalDockerConfig: string | undefined;
    if (ephemeral) {
      originalDockerConfig = process.env.DOCKER_CONFIG;
      const tempDockerConfig = path.join(os.tmpdir(), `docker-config-${Date.now()}`);
      await fs.ensureDir(tempDockerConfig);
      process.env.DOCKER_CONFIG = tempDockerConfig;
    }

    try {
      return new Promise<void>((resolve, reject) => {
        const args = ['login', registry, '--username', username, '--password-stdin'];
        const child = crossSpawn.spawn('docker', args, {
          stdio: ['pipe', 'inherit', 'inherit'],
          env: process.env,
        });

        child.on('error', (err) => reject(err));
        child.on('exit', (code) => {
          if (ephemeral && originalDockerConfig !== undefined) {
            process.env.DOCKER_CONFIG = originalDockerConfig;
          }

          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`docker login exited with code ${code}`));
          }
        });

        // Write password to stdin
        child.stdin!.write(password);
        child.stdin!.end();
      });
    } catch (error) {
      // Restore original config on error
      if (ephemeral && originalDockerConfig !== undefined) {
        process.env.DOCKER_CONFIG = originalDockerConfig;
      }
      throw error;
    }
  }

  async loginGitHub(token: string, options: AuthOptions = {}): Promise<void> {
    return this.login('ghcr.io', 'USERNAME_PLACEHOLDER', token, options);
  }

  async loginFromEnv(registry: string, options: AuthOptions = {}): Promise<void> {
    const username = process.env.DOCKER_USERNAME || process.env.REGISTRY_USERNAME;
    const password = process.env.DOCKER_PASSWORD || process.env.REGISTRY_PASSWORD;

    if (!username || !password) {
      throw new Error(
        'Docker credentials not found in environment variables. Set DOCKER_USERNAME and DOCKER_PASSWORD or REGISTRY_USERNAME and REGISTRY_PASSWORD',
      );
    }

    return this.login(registry, username, password, options);
  }

  async loginFromGitHubActions(registry = 'ghcr.io'): Promise<void> {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error(
        'GITHUB_TOKEN not found in environment. Ensure the workflow has access to secrets.GITHUB_TOKEN',
      );
    }

    // For GitHub Container Registry, username can be anything when using PAT
    return this.login(registry, process.env.GITHUB_ACTOR || 'github-actions', token);
  }

  isInGitHubActions(): boolean {
    return process.env.GITHUB_ACTIONS === 'true';
  }

  async autoLogin(registry: string, options: AuthOptions = {}): Promise<void> {
    // Auto-detect authentication method based on environment
    if (this.isInGitHubActions() && (registry === 'ghcr.io' || registry.includes('github'))) {
      return this.loginFromGitHubActions(registry);
    }

    // Try environment variables
    try {
      return await this.loginFromEnv(registry, options);
    } catch (error) {
      throw new Error(
        `Auto-login failed for ${registry}. Please run 'docker login ${registry}' manually or set appropriate environment variables. Original error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export default new RegistryAuth();

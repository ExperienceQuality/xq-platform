// Ported from xq-test-infra (Apache-2.0); rewritten in TypeScript. See UPSTREAM.md.
import fs from 'fs-extra';
import path from 'node:path';
import os from 'node:os';
import { v4 as uuidv4 } from 'uuid';
import YAML from 'yaml';
import * as gateway from './gateway.js';
import serviceLoader from './serviceLoader.js';
import type {
  ComposeService,
  ComposeSpec,
  GatewayServiceInput,
  GenerateOptions,
  ServiceSpec,
  XqSpec,
} from '../types.js';

class ComposeGenerator {
  tempFiles = new Set<string>();
  listenersSetup = false;

  constructor() {
    this.setupCleanup();
  }

  setupCleanup(): void {
    // Avoid multiple listeners in tests
    if (!this.listenersSetup) {
      process.setMaxListeners(20); // Increase limit for tests
      process.on('exit', () => this.cleanupTempFiles());
      process.on('SIGINT', () => this.cleanupTempFiles());
      process.on('SIGTERM', () => this.cleanupTempFiles());
      this.listenersSetup = true;
    }
  }

  async generateCompose(specPath: string, options: GenerateOptions = {}): Promise<string> {
    const {
      gateway: enableGateway = true,
      wiremock: enableWiremock = true,
      keepFile = true,
      overrides = {},
    } = options;

    // Read and parse XQ spec
    const spec = await this.readXQSpec(specPath);

    // Apply overrides
    const mergedSpec = this.applyOverrides(spec, overrides);

    // Generate compose object
    const compose = await this.generateComposeObject(
      mergedSpec,
      enableGateway,
      keepFile,
      enableWiremock,
    );

    // Always output to xq-compose.yml in current directory
    const finalOutputPath = path.join(process.cwd(), 'xq-compose.yml');

    // Write compose file
    await fs.outputFile(finalOutputPath, YAML.stringify(compose), 'utf8');

    // Track temp file for cleanup only if not keeping files
    if (!keepFile) {
      this.tempFiles.add(finalOutputPath);
    }

    return finalOutputPath;
  }

  async readXQSpec(specPath: string): Promise<XqSpec> {
    try {
      // Check if path exists
      const pathExists = await fs.pathExists(specPath);
      if (!pathExists) {
        throw new Error(`Path does not exist: ${specPath}`);
      }

      // Determine if path is a file or directory
      const stat = await fs.stat(specPath);

      if (stat.isDirectory()) {
        // Load from directory using serviceLoader
        return await serviceLoader.loadFromDirectory(specPath);
      } else if (stat.isFile()) {
        // Load from single file (backward compatible)
        const content = await fs.readFile(specPath, 'utf8');
        return YAML.parse(content) as XqSpec;
      } else {
        throw new Error(`Invalid path type: ${specPath} (must be a file or directory)`);
      }
    } catch (error) {
      throw new Error(
        `Failed to read XQ spec from ${specPath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  applyOverrides(
    spec: XqSpec,
    overrides: { services?: Record<string, Partial<ServiceSpec>> },
  ): XqSpec {
    // Deep merge overrides with spec
    const merged = JSON.parse(JSON.stringify(spec)) as XqSpec;

    if (overrides.services) {
      Object.keys(overrides.services).forEach((serviceName) => {
        if (merged.services && merged.services[serviceName]) {
          Object.assign(merged.services[serviceName], overrides.services?.[serviceName]);
        }
      });
    }

    return merged;
  }

  async generateComposeObject(
    spec: XqSpec,
    enableGateway: boolean,
    keepFile = false,
    enableWiremock = true,
  ): Promise<ComposeSpec> {
    const compose: ComposeSpec = {
      version: '3.8',
      services: {},
      networks: {
        'xq-network': {
          driver: 'bridge',
        },
      },
    };

    // Process dependencies if centralized dependencies are defined
    const centralizedDeps = spec.dependencies || {};

    // Auto port assignment - track used ports
    const usedPorts = new Set<number>();
    let nextPort = spec.portRange?.start || 3000;

    // Add services from spec
    if (spec.services) {
      Object.entries(spec.services).forEach(([name, service]) => {
        compose.services[name] = this.convertServiceToCompose(
          service,
          centralizedDeps,
          usedPorts,
          nextPort,
        );

        // Update nextPort for auto assignment
        if (service.autoPort !== false) {
          nextPort++;
          while (usedPorts.has(nextPort)) {
            nextPort++;
          }
        }
      });
    }

    // Add WireMock before the gateway so the gateway can route to and wait on it.
    // Skipped when disabled, when there are no user services, or when the user
    // defines their own wiremock service.
    if (
      enableWiremock &&
      spec.services &&
      Object.keys(spec.services).length > 0 &&
      spec.services['xq-wiremock'] === undefined &&
      spec.services['wiremock'] === undefined
    ) {
      await this.addWiremock(compose);
    }

    // Add gateway if enabled
    if (enableGateway && Object.keys(compose.services).length > 0) {
      await this.addGateway(compose, spec.services, keepFile);
    }

    return compose;
  }

  convertServiceToCompose(
    service: ServiceSpec,
    centralizedDeps: Record<string, string[]> = {},
    usedPorts: Set<number> = new Set<number>(),
    currentPort = 3000,
  ): ComposeService {
    const composeService: ComposeService = {
      image: `${service.image}:${service.tag || 'latest'}`,
      networks: ['xq-network'],
    };

    // Handle ports - auto assignment or manual
    if (service.ports) {
      // Manual port specification
      composeService.ports = service.ports;
      // Track used ports
      service.ports.forEach((port) => {
        const hostPort = parseInt(port.split(':')[0] ?? '', 10);
        if (!isNaN(hostPort)) {
          usedPorts.add(hostPort);
        }
      });
    } else if (service.port && service.autoPort !== false) {
      // Auto port assignment
      let hostPort = currentPort;
      while (usedPorts.has(hostPort)) {
        hostPort++;
      }
      composeService.ports = [`${hostPort}:${service.port}`];
      usedPorts.add(hostPort);
    }

    if (service.environment) {
      composeService.environment = service.environment;
    }

    if (service.volumes) {
      composeService.volumes = service.volumes;
    }

    if (service.command) {
      composeService.command = service.command;
    }

    if (service.healthcheck) {
      composeService.healthcheck = service.healthcheck;
    }

    // Handle dependencies - check both service-level and centralized
    let dependencies: string[] = [];

    if (service.depends_on) {
      dependencies = [...service.depends_on];
    }

    // Add centralized dependencies if service is in dependency groups
    if (service.dependencyGroups) {
      service.dependencyGroups.forEach((group) => {
        if (centralizedDeps[group]) {
          dependencies = [...dependencies, ...(centralizedDeps[group] ?? [])];
        }
      });
    }

    if (dependencies.length > 0) {
      composeService.depends_on = [...new Set(dependencies)]; // Remove duplicates
    }

    return composeService;
  }

  async addWiremock(compose: ComposeSpec): Promise<void> {
    const wiremockUrl = 'http://xq-wiremock:8080';
    const envKey = 'WIREMOCK_BASE_URL';
    const envValue = `${envKey}=${wiremockUrl}`;

    // Point every user service at WireMock without overwriting a user-set value
    for (const service of Object.values(compose.services)) {
      if (service.environment === undefined) {
        service.environment = { [envKey]: wiremockUrl };
      } else if (Array.isArray(service.environment)) {
        const hasKey = service.environment.some(
          (entry) => entry === envKey || entry.startsWith(`${envKey}=`),
        );
        if (!hasKey) {
          service.environment = [...service.environment, envValue];
        }
      } else if (!(envKey in service.environment)) {
        service.environment = { ...service.environment, [envKey]: wiremockUrl };
      }
    }

    // Pick the first free host port from 18080 upward. Host port is the
    // second-to-last segment to cover ip:host:container mappings; bare
    // container ports bind a random host port and don't count.
    const usedHostPorts = new Set<number>();
    for (const service of Object.values(compose.services)) {
      for (const port of service.ports ?? []) {
        const parts = String(port).split(':');
        if (parts.length >= 2) {
          const hostPort = parseInt(parts[parts.length - 2] ?? '', 10);
          if (!isNaN(hostPort)) {
            usedHostPorts.add(hostPort);
          }
        }
      }
    }
    let wiremockPort = 18080;
    while (usedHostPorts.has(wiremockPort)) {
      wiremockPort++;
    }

    const wiremockService: ComposeService = {
      image: 'wiremock/wiremock:3.13.1',
      networks: ['xq-network'],
      ports: [`${wiremockPort}:8080`],
      healthcheck: {
        test: ['CMD', 'curl', '-f', 'http://localhost:8080/__admin/health'],
        start_period: '10s',
      },
    };

    // Mount local stubs only when a ./wiremock directory exists at generate time
    const wiremockDir = path.join(process.cwd(), 'wiremock');
    if (await fs.pathExists(wiremockDir)) {
      wiremockService.volumes = [`${wiremockDir}:/home/wiremock`];
    }

    compose.services['xq-wiremock'] = wiremockService;
  }

  async addGateway(
    compose: ComposeSpec,
    originalServices: Record<string, ServiceSpec> = {},
    keepFile = false,
  ): Promise<void> {
    // Generate nginx config in project directory
    // Pass both compose services (for ports) and original services (for routes)
    const nginxConfigPath = path.join(process.cwd(), 'nginx-gateway.conf');

    // Merge compose services with routes from original services
    const servicesWithRoutes: Record<string, GatewayServiceInput> = {};
    Object.entries(compose.services).forEach(([name, composeService]) => {
      const routes = originalServices[name]?.routes;
      servicesWithRoutes[name] =
        routes === undefined ? { ...composeService } : { ...composeService, routes };
    });

    await gateway.generateNginxConfig(servicesWithRoutes, nginxConfigPath);

    // Add to temp files for cleanup only if not keeping files
    if (!keepFile) {
      this.tempFiles.add(nginxConfigPath);
    }

    // Find an available port for gateway (avoid conflicts)
    const usedPorts = new Set<number>();
    Object.values(compose.services).forEach((service) => {
      if (service.ports) {
        service.ports.forEach((port) => {
          const hostPort = port.split(':')[0];
          usedPorts.add(parseInt(hostPort ?? '', 10));
        });
      }
    });

    // Find next available port starting from 8080
    let gatewayPort = 8080;
    while (usedPorts.has(gatewayPort)) {
      gatewayPort++;
    }

    // Gateway waits for backends: service_healthy when the service has a healthcheck (avoids nginx 502 while app boots), else service_started
    const gatewayDependsOn: Record<string, { condition: 'service_started' | 'service_healthy' }> =
      {};
    for (const name of Object.keys(compose.services)) {
      const service = compose.services[name];
      gatewayDependsOn[name] = {
        condition: service?.healthcheck ? 'service_healthy' : 'service_started',
      };
    }

    // Add gateway service
    compose.services['xq-gateway'] = {
      image: 'nginx:alpine',
      ports: [`${gatewayPort}:80`],
      volumes: [`${nginxConfigPath}:/etc/nginx/nginx.conf:ro`],
      networks: ['xq-network'],
      depends_on: gatewayDependsOn,
    };
  }

  createTempPath(prefix: string, suffix: string): string {
    const tempDir = os.tmpdir();
    const filename = `${prefix}-${uuidv4()}${suffix}`;
    return path.join(tempDir, filename);
  }

  cleanupTempFiles(): void {
    this.tempFiles.forEach((file) => {
      try {
        fs.removeSync(file);
      } catch {
        // Ignore cleanup errors
      }
    });
    this.tempFiles.clear();
  }
}

export default new ComposeGenerator();

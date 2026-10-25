// Ported from xq-test-infra (Apache-2.0); rewritten in TypeScript. See UPSTREAM.md.
import fs from 'fs-extra';
import path from 'node:path';
import YAML from 'yaml';
import type { LoadedSpec, ServiceSpec, XqSpec } from '../types.js';

class ServiceLoader {
  /**
   * Load and merge service files from a directory
   */
  async loadFromDirectory(dirPath: string): Promise<LoadedSpec> {
    // Verify directory exists
    const dirExists = await fs.pathExists(dirPath);
    if (!dirExists) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${dirPath}`);
    }

    // Scan for service files
    const serviceFiles = await this.scanServiceFiles(dirPath);

    if (serviceFiles.length === 0) {
      throw new Error(`No service files (*.service.yml or *.service.yaml) found in ${dirPath}`);
    }

    // Load global config if exists
    const globalConfig = await this.loadGlobalConfig(dirPath);

    // Load and merge all service files
    const mergedSpec = await this.mergeServiceFiles(dirPath, serviceFiles, globalConfig);

    return mergedSpec;
  }

  /**
   * Scan directory for service files
   */
  async scanServiceFiles(dirPath: string): Promise<string[]> {
    const files = await fs.readdir(dirPath);

    const serviceFiles = files.filter((file) => {
      return file.endsWith('.service.yml') || file.endsWith('.service.yaml');
    });

    // Sort alphabetically for consistent loading order
    return serviceFiles.sort();
  }

  /**
   * Load global config file (xq.config.yml) if it exists
   */
  async loadGlobalConfig(dirPath: string): Promise<XqSpec> {
    const configPaths = [path.join(dirPath, 'xq.config.yml'), path.join(dirPath, 'xq.config.yaml')];

    for (const configPath of configPaths) {
      if (await fs.pathExists(configPath)) {
        try {
          const content = await fs.readFile(configPath, 'utf8');
          const parsed: unknown = YAML.parse(content);
          return (parsed || {}) as XqSpec;
        } catch (error) {
          throw new Error(
            `Failed to parse global config ${configPath}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    return {};
  }

  /**
   * Merge all service files into unified spec format
   */
  async mergeServiceFiles(dirPath: string, serviceFiles: string[], globalConfig: XqSpec): Promise<LoadedSpec> {
    const spec: LoadedSpec = {
      services: {},
    };

    // Add global config (portRange, dependencies)
    if (globalConfig.portRange) {
      spec.portRange = globalConfig.portRange;
    }

    if (globalConfig.dependencies) {
      spec.dependencies = globalConfig.dependencies;
    }

    // Load each service file
    for (const filename of serviceFiles) {
      const filePath = path.join(dirPath, filename);
      let serviceData: ServiceSpec;

      try {
        const content = await fs.readFile(filePath, 'utf8');
        const parsed: unknown = YAML.parse(content);
        serviceData = parsed as ServiceSpec;
      } catch (error) {
        throw new Error(
          `Failed to parse service file ${filename}: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      if (!serviceData) {
        throw new Error(`Service file ${filename} is empty or invalid`);
      }

      // Derive service name from filename or explicit name field
      const serviceName = serviceData.name || this.deriveServiceName(filename);

      // Check for duplicate service names
      if (spec.services[serviceName]) {
        throw new Error(`Duplicate service name '${serviceName}' found in ${filename}`);
      }

      // Remove 'name' field from service data (not needed in final spec)
      // Keep 'routes' field if present for gateway routing
      const { name, ...serviceConfig } = serviceData;

      // Add service to spec
      spec.services[serviceName] = serviceConfig;
    }

    // Validate dependencies
    this.validateDependencies(spec);

    return spec;
  }

  /**
   * Derive service name from filename
   */
  deriveServiceName(filename: string): string {
    // Remove .service.yml or .service.yaml extension
    return filename.replace(/\.service\.ya?ml$/, '');
  }

  /**
   * Validate service dependencies to detect circular dependencies
   */
  validateDependencies(spec: LoadedSpec): void {
    const services = spec.services;
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycle = (serviceName: string): boolean => {
      if (recursionStack.has(serviceName)) {
        return true; // Circular dependency detected
      }

      if (visited.has(serviceName)) {
        return false; // Already checked this service
      }

      visited.add(serviceName);
      recursionStack.add(serviceName);

      const service = services[serviceName];
      if (service && service.depends_on) {
        for (const dep of service.depends_on) {
          if (!services[dep]) {
            throw new Error(`Service '${serviceName}' depends on non-existent service '${dep}'`);
          }

          if (hasCycle(dep)) {
            throw new Error(`Circular dependency detected involving service '${serviceName}'`);
          }
        }
      }

      recursionStack.delete(serviceName);
      return false;
    };

    // Check all services for circular dependencies
    for (const serviceName of Object.keys(services)) {
      if (!visited.has(serviceName)) {
        hasCycle(serviceName);
      }
    }
  }
}

export default new ServiceLoader();

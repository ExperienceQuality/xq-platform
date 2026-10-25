// Ported from xq-test-infra (Apache-2.0); rewritten in TypeScript. See UPSTREAM.md.
import fs from 'fs-extra';
import type { GatewayServiceInput, ParsedRoute } from '../types.js';

function extractContainerPort(ports?: string[]): number {
  if (!Array.isArray(ports) || ports.length === 0) return 80;
  const first = String(ports[0]);
  // formats: "host:container" or "container" or "host:container/proto"
  const parts = first.split(':');
  const candidate = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  // strip possible /proto
  const portPart = String(candidate).split('/')[0];
  const num = parseInt(portPart as string, 10);
  return Number.isNaN(num) ? 80 : num;
}

/**
 * Parse routes from service configuration
 */
function parseRoutes(servicesMap: Record<string, GatewayServiceInput>): ParsedRoute[] {
  const routes: ParsedRoute[] = [];

  for (const [name, svc] of Object.entries(servicesMap)) {
    if (name === 'xq-gateway') continue;

    const port = extractContainerPort(svc.ports);

    // Check if service has route-based configuration
    if (svc.routes && Array.isArray(svc.routes)) {
      for (const route of svc.routes) {
        if (route.paths && Array.isArray(route.paths)) {
          routes.push({
            serviceName: name,
            port,
            methods: route.methods || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
            paths: route.paths,
          });
        }
      }
    }
  }

  return routes;
}

/**
 * Generate nginx location block for path-based routing
 */
function generatePathBasedLocations(routes: ParsedRoute[]): string {
  const locationBlocks: string[] = [];

  // Group routes by path for easier configuration
  const pathGroups = new Map<string, ParsedRoute[]>();

  for (const route of routes) {
    for (const path of route.paths) {
      if (!pathGroups.has(path)) {
        pathGroups.set(path, []);
      }
      pathGroups.get(path)?.push(route);
    }
  }

  // Generate location blocks for each path
  for (const [path, routeConfigs] of pathGroups) {
    const nginxPath = convertToNginxPath(path);

    // Group by methods and deduplicate services
    const methodGroups = new Map<string, Set<string>>();
    for (const config of routeConfigs) {
      for (const method of config.methods) {
        if (!methodGroups.has(method)) {
          methodGroups.set(method, new Set());
        }
        methodGroups.get(method)?.add(config.serviceName);
      }
    }

    // Generate location block
    let locationBlock = `    location ${nginxPath} {\n`;

    // If only one service handles all methods, simplify
    if (methodGroups.size === 1 && routeConfigs.length === 1) {
      const serviceName = routeConfigs[0]?.serviceName;
      locationBlock += `        proxy_pass http://${serviceName}_upstream;\n`;
    } else {
      // Generate conditional routing based on methods
      for (const [method, servicesSet] of methodGroups) {
        const services = Array.from(servicesSet);
        if (services.length === 1) {
          locationBlock += `        if ($request_method = ${method}) {\n`;
          locationBlock += `            proxy_pass http://${services[0]}_upstream;\n`;
          locationBlock += '        }\n';
        } else {
          // Multiple services for same method - use first one (or implement load balancing)
          locationBlock += `        if ($request_method = ${method}) {\n`;
          locationBlock += `            proxy_pass http://${services[0]}_upstream;\n`;
          locationBlock += '        }\n';
        }
      }
    }

    // Add standard proxy headers
    locationBlock += '        proxy_set_header Host $host;\n';
    locationBlock += '        proxy_set_header X-Real-IP $remote_addr;\n';
    locationBlock += '        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n';
    locationBlock += '        proxy_set_header X-Forwarded-Proto $scheme;\n';
    locationBlock += '    }';

    locationBlocks.push(locationBlock);
  }

  return locationBlocks.join('\n\n');
}

/**
 * Convert path pattern to nginx location format
 */
function convertToNginxPath(path: string): string {
  // Handle wildcard paths
  if (path.endsWith('/*')) {
    // Convert /api/todos/* to regex pattern that matches /api/todos and /api/todos/anything
    const basePath = path.slice(0, -2);
    return `~ ^${basePath.replace(/\//g, '\\/')}(\\/.*)?$`;
  }

  // Exact match with optional trailing slash
  return `~ ^${path.replace(/\//g, '\\/')}(\\/|$)`;
}

/**
 * Generate service-name based fallback locations (backward compatible)
 */
function generateServiceNameLocations(servicesMap: Record<string, GatewayServiceInput>): string {
  const locations: string[] = [];

  for (const name of Object.keys(servicesMap)) {
    if (name === 'xq-gateway') continue;

    const location = `    location /${name}/ {\n        proxy_pass http://${name}_upstream/;\n        proxy_set_header Host $host;\n        proxy_set_header X-Real-IP $remote_addr;\n        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n    }`;

    locations.push(location);
  }

  return locations.join('\n\n');
}

async function generateNginxConfig(
  servicesMap: Record<string, GatewayServiceInput>,
  outPath: string
): Promise<string> {
  // servicesMap: { name: { ports: [...], routes: [...], ... } }
  const upstreams: string[] = [];

  // Generate upstreams for all services
  for (const [name, svc] of Object.entries(servicesMap)) {
    if (name === 'xq-gateway') continue;
    const port = extractContainerPort(svc.ports);
    upstreams.push(`upstream ${name}_upstream {\n    server ${name}:${port};\n}`);
  }

  // Parse routes for intelligent routing
  const routes = parseRoutes(servicesMap);

  // Generate location blocks
  let locationBlocks = '';

  // Path-based routing (higher priority)
  if (routes.length > 0) {
    locationBlocks += generatePathBasedLocations(routes);
    locationBlocks += '\n\n';
  }

  // Service-name fallback routing (backward compatible)
  locationBlocks += generateServiceNameLocations(servicesMap);

  const conf = `# auto-generated by xq-test-infra gateway
worker_processes 1;
error_log /var/log/nginx/error.log warn;
events { worker_connections 1024; }
http {
    sendfile on;
    tcp_nopush on;
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    ${upstreams.join('\n\n    ')}

    server {
        listen 80;
        server_name _;

${locationBlocks}
    }
}
`;

  await fs.outputFile(outPath, conf, 'utf8');
  return outPath;
}

export { generateNginxConfig, parseRoutes, convertToNginxPath, generatePathBasedLocations, generateServiceNameLocations };

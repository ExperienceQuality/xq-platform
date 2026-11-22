export const publishablePackages = Object.freeze([
  'rest-client',
  'db',
  'stub',
  'core',
  'test',
  'test-browser',
  'test-infra',
  'mcp-server',
]);

export const publishablePackageNames = Object.freeze(
  publishablePackages.map((name) => `@experiencequality/${name}`),
);

export const publishablePackageNameSet = new Set(publishablePackageNames);

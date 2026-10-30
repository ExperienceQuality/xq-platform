export const publishablePackages = Object.freeze([
  'rest-client',
  'db',
  'stub',
  'core',
  'test',
  'test-browser',
  'test-infra',
]);

export const publishablePackageNames = Object.freeze(
  publishablePackages.map((name) => `@experiencequality/${name}`),
);

export const publishablePackageNameSet = new Set(publishablePackageNames);

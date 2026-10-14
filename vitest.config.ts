import { defineConfig } from 'vitest/config';

const simpleLibraryProjects = [
  {
    name: 'rest-client',
    root: './packages/rest-client',
    test: { environment: 'node', include: ['test/**/*.test.ts'] },
  },
  {
    name: 'db',
    root: './packages/db',
    test: { environment: 'node', include: ['test/**/*.test.ts'] },
  },
  {
    name: 'stub',
    root: './packages/stub',
    test: { environment: 'node', include: ['test/**/*.test.ts'] },
  },
  {
    name: 'core',
    root: './packages/core',
    test: { environment: 'node', include: ['test/**/*.test.ts'] },
  },
];

export default defineConfig({ test: { projects: simpleLibraryProjects } });

import { defineConfig } from 'vitest/config';

const simpleLibraryProjects = [
  {
    root: './packages/rest-client',
    test: { name: 'rest-client', environment: 'node', include: ['test/**/*.test.ts'] },
  },
  {
    root: './packages/db',
    test: { name: 'db', environment: 'node', include: ['test/**/*.test.ts'] },
  },
  {
    root: './packages/stub',
    test: { name: 'stub', environment: 'node', include: ['test/**/*.test.ts'] },
  },
  {
    root: './packages/core',
    test: { name: 'core', environment: 'node', include: ['test/**/*.test.ts'] },
  },
  {
    root: './packages/test-browser',
    test: { name: 'test-browser', environment: 'node', include: ['test/**/*.test.ts'] },
  },
];

export default defineConfig({ test: { projects: simpleLibraryProjects } });

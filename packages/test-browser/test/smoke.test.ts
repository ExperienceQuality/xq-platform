import { describe, expect, it } from 'vitest';
import { expect as browserExpect, test as browserTest } from '../src/index.js';
import { defineConfig } from '../src/config.js';

describe('test-browser package surface', () => {
  it('exposes playwright test and expect', () => {
    expect(typeof browserTest).toBe('function');
    expect(typeof browserExpect).toBe('function');
  });

  it('exposes defineConfig', () => {
    expect(typeof defineConfig).toBe('function');
  });
});

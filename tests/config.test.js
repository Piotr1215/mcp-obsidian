import { describe, it, expect } from 'vitest';
import { config } from '../src/config.js';

describe('Configuration (FIRST Principles)', () => {
  describe('limits.maxSearchResults', () => {
    it('is set to 100 to prevent context explosion', () => {
      // MUTATION FIX: Exact value (not >= 100 or <= 100)
      expect(config.limits.maxSearchResults).toBe(100);

      // MUTATION FIX: Verify it's actually smaller than old value (1000)
      expect(config.limits.maxSearchResults).toBeLessThan(1000);
    });
  });

  describe('limits', () => {
    const limitTests = [
      { key: 'maxFileSize', expected: 10 * 1024 * 1024, desc: '10MB' },
      { key: 'maxSearchResults', expected: 100, desc: 'context explosion prevention' },
      { key: 'maxConcurrentReads', expected: 10, desc: 'concurrent operations' },
    ];

    limitTests.forEach(({ key, expected, desc }) => {
      it(`${key} = ${expected} (${desc})`, () => {
        expect(config.limits[key]).toBe(expected);
      });
    });
  });

  describe('timeouts', () => {
    it('fileOperation timeout is 30 seconds', () => {
      expect(config.timeouts.fileOperation).toBe(30000);
    });

    it('searchOperation timeout is 60 seconds', () => {
      expect(config.timeouts.searchOperation).toBe(60000);
    });

    it('MUTATION FIX: searchOperation > fileOperation', () => {
      // Search needs more time than individual file operations
      expect(config.timeouts.searchOperation).toBeGreaterThan(
        config.timeouts.fileOperation
      );
    });
  });

  describe('security', () => {
    it('only allows .md files', () => {
      expect(config.security.allowedExtensions).toEqual(['.md']);

      // MUTATION FIX: Array length must be exactly 1
      expect(config.security.allowedExtensions.length).toBe(1);
    });

    it('sanitizeContent is enabled', () => {
      expect(config.security.sanitizeContent).toBe(true);
    });
  });
});

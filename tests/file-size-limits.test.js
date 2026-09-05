import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { readNote, searchVault } from '../src/tools.js';
import { validateFileSize } from '../src/validation.js';
import { config } from '../src/config.js';
import { MCPError } from '../src/errors.js';

describe('File Size Limits', () => {
  const testVault = '/tmp/test-vault-size-limits';

  beforeEach(async () => {
    await mkdir(testVault, { recursive: true });
  });

  afterEach(async () => {
    await rm(testVault, { recursive: true, force: true });
  });

  // The size check that ships is pure: tools.js stats the file itself and hands
  // the number here. Testing it against real 11MB files exercised a wrapper that
  // production never called, and paid a second of IO per run to do it.
  describe('validateFileSize', () => {
    it('accepts a size within the limit', () => {
      expect(validateFileSize(1024, config.limits.maxFileSize)).toMatchObject({ valid: true });
    });

    it('rejects a size over the limit and reports both numbers', () => {
      const oversized = config.limits.maxFileSize + 1;
      const result = validateFileSize(oversized, config.limits.maxFileSize);

      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/File too large/);
      expect(result.size).toBe(oversized);
    });

    it('honours a caller-supplied limit', () => {
      expect(validateFileSize(1024, 2048)).toMatchObject({ valid: true });
      expect(validateFileSize(1024, 512)).toMatchObject({ valid: false });
    });

    it('rejects a size that is not a number, rather than letting it pass', () => {
      expect(validateFileSize(undefined, 2048)).toMatchObject({ valid: false });
      expect(validateFileSize(-1, 2048)).toMatchObject({ valid: false });
    });
  });

  describe('readNote with size limits', () => {
    it('should read files within size limit', async () => {
      const normalFile = path.join(testVault, 'normal.md');
      const content = 'Normal content that is not too large';
      await writeFile(normalFile, content);
      
      const result = await readNote(testVault, 'normal.md');
      expect(result).toBe(content);
    });

    it('should reject reading files exceeding size limit', async () => {
      const largeFile = path.join(testVault, 'toolarge.md');
      const largeContent = 'x'.repeat(11 * 1024 * 1024); // 11MB
      await writeFile(largeFile, largeContent);
      
      await expect(readNote(testVault, 'toolarge.md')).rejects.toThrow(/File too large/);
    });
  });

  describe('searchVault with size limits', () => {
    it('should skip files exceeding size limit during search', async () => {
      // Create a normal file
      await writeFile(path.join(testVault, 'normal.md'), 'findme content');
      
      // Create a large file with the same content
      const largeContent = 'x'.repeat(11 * 1024 * 1024) + '\nfindme content';
      await writeFile(path.join(testVault, 'large.md'), largeContent);
      
      const result = await searchVault(testVault, 'findme');
      
      // Should only find the match in the normal file
      expect(result.totalMatches).toBeGreaterThan(0);
      expect(result.files[0].path).toBe('normal.md');
    });

  });
});
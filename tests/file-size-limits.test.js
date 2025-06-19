import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';
import { readNote, searchVault } from '../src/tools.js';
import { validateFileSize } from '../src/security.js';
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

  describe('validateFileSize', () => {
    it('should accept files within size limit', async () => {
      const smallFile = path.join(testVault, 'small.md');
      await writeFile(smallFile, 'Small content');
      
      const size = await validateFileSize(smallFile);
      expect(size).toBeLessThan(config.limits.maxFileSize);
    });

    it('should reject files exceeding size limit', async () => {
      const largeFile = path.join(testVault, 'large.md');
      // Create a file larger than 10MB
      const largeContent = 'x'.repeat(11 * 1024 * 1024);
      await writeFile(largeFile, largeContent);
      
      await expect(validateFileSize(largeFile)).rejects.toThrow(MCPError);
      
      try {
        await validateFileSize(largeFile);
      } catch (error) {
        expect(error.message).toMatch(/File too large/);
        expect(error.data.size).toBeGreaterThan(config.limits.maxFileSize);
      }
    });

    it('should use custom size limit when provided', async () => {
      const file = path.join(testVault, 'custom.md');
      await writeFile(file, 'x'.repeat(1024)); // 1KB
      
      // Should pass with 2KB limit
      await expect(validateFileSize(file, 2048)).resolves.toBeDefined();
      
      // Should fail with 512B limit
      await expect(validateFileSize(file, 512)).rejects.toThrow(/File too large/);
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
      expect(result.count).toBe(1);
      expect(result.results[0].file).toBe('normal.md');
    });

    it('should limit search results to prevent memory issues', async () => {
      // Create files with many matches
      const contentWithManyMatches = Array(100).fill('match line').join('\n');
      
      // Create multiple files to exceed the limit
      const filesNeeded = Math.ceil(config.limits.maxSearchResults / 100) + 1;
      for (let i = 0; i < filesNeeded; i++) {
        await writeFile(
          path.join(testVault, `file${i}.md`), 
          contentWithManyMatches
        );
      }
      
      const result = await searchVault(testVault, 'match');
      
      expect(result.count).toBe(config.limits.maxSearchResults);
      expect(result.truncated).toBe(true);
      expect(result.message).toMatch(/Results limited to/);
    });
  });
});
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createServer } from '../src/server.js';
import { mkdir, rm, writeFile } from 'fs/promises';
import path from 'path';

describe('Edge Cases and Error Scenarios', () => {
  const testVault = '/tmp/test-vault-edge-cases';
  let server;

  beforeEach(async () => {
    // Create test vault
    await mkdir(testVault, { recursive: true });
    server = createServer(testVault);
  });

  afterEach(async () => {
    // Clean up
    await rm(testVault, { recursive: true, force: true });
  });

  describe('File handling edge cases', () => {
    it('should handle empty markdown files', async () => {
      const emptyFile = path.join(testVault, 'empty.md');
      await writeFile(emptyFile, '');
      
      const { readNote } = await import('../src/tools.js');
      const content = await readNote(testVault, 'empty.md');
      
      expect(content).toBe('');
    });

    it('should handle files with only whitespace', async () => {
      const whitespaceFile = path.join(testVault, 'whitespace.md');
      await writeFile(whitespaceFile, '   \n\t\n   ');
      
      const { readNote } = await import('../src/tools.js');
      const content = await readNote(testVault, 'whitespace.md');
      
      expect(content).toBe('   \n\t\n   ');
    });

    it('should handle very large files', async () => {
      const largeContent = 'a'.repeat(1024 * 1024); // 1MB
      const largeFile = path.join(testVault, 'large.md');
      await writeFile(largeFile, largeContent);
      
      const { readNote } = await import('../src/tools.js');
      const content = await readNote(testVault, 'large.md');
      
      expect(content.length).toBe(1024 * 1024);
    });

    it('should handle deeply nested directories', async () => {
      const deepPath = 'a/b/c/d/e/f/g/h/i/j/k/note.md';
      
      const { writeNote } = await import('../src/tools.js');
      await writeNote(testVault, deepPath, 'Deep content');
      
      const { readNote } = await import('../src/tools.js');
      const content = await readNote(testVault, deepPath);
      
      expect(content).toBe('Deep content');
    });
  });

  describe('Search edge cases', () => {
    beforeEach(async () => {
      // Create test files
      await writeFile(path.join(testVault, 'test1.md'), 'Line 1\nLine 2\nLine 3');
      await writeFile(path.join(testVault, 'test2.md'), 'Special chars: @#$%^&*()');
      await writeFile(path.join(testVault, 'test3.md'), 'Unicode: 你好世界 🌍');
    });

    it('should handle empty search query', async () => {
      const { searchVault } = await import('../src/tools.js');
      const result = await searchVault(testVault, '');
      
      // Empty query should match all lines
      expect(result.totalMatches).toBeGreaterThan(0);
    });

    it('should handle special characters in search', async () => {
      const { searchVault } = await import('../src/tools.js');
      const result = await searchVault(testVault, '@#$%');
      
      expect(result.totalMatches).toBeGreaterThan(0);
      expect(result.files[0].matches[0].content).toContain('@#$%');
    });

    it('should handle unicode in search', async () => {
      const { searchVault } = await import('../src/tools.js');
      const result = await searchVault(testVault, '你好');
      
      expect(result.totalMatches).toBeGreaterThan(0);
      expect(result.files[0].matches[0].content).toContain('你好');
    });

    it('should handle regex special characters safely', async () => {
      const { searchVault } = await import('../src/tools.js');
      // These should be treated as literal strings, not regex
      const queries = ['(test)', '[test]', 'test.', 'test*', 'test+'];
      
      for (const query of queries) {
        // Should not throw
        await expect(searchVault(testVault, query)).resolves.toBeDefined();
      }
    });
  });

  describe('Tag search edge cases', () => {
    it('should handle notes with no tags', async () => {
      await writeFile(path.join(testVault, 'no-tags.md'), 'Content without tags');
      
      const { searchByTags } = await import('../src/tools.js');
      const result = await searchByTags(testVault, ['anytag']);
      
      expect(result.count).toBe(0);
    });

    it('should handle empty tag array', async () => {
      const { searchByTags } = await import('../src/tools.js');
      
      await expect(searchByTags(testVault, [])).resolves.toBeDefined();
    });

    it('should handle tags with special characters', async () => {
      const content = '---\ntags: [tag-with-dash, tag.with.dot, tag/with/slash]\n---\n# Content';
      await writeFile(path.join(testVault, 'special-tags.md'), content);
      
      const { searchByTags } = await import('../src/tools.js');
      
      const result1 = await searchByTags(testVault, ['tag-with-dash']);
      expect(result1.count).toBe(1);
      
      const result2 = await searchByTags(testVault, ['tag.with.dot']);
      expect(result2.count).toBe(1);
      
      const result3 = await searchByTags(testVault, ['tag/with/slash']);
      expect(result3.count).toBe(1);
    });
  });

  describe('Path handling edge cases', () => {
    it('should normalize different path separators', async () => {
      const { writeNote, readNote } = await import('../src/tools.js');
      
      // Write with forward slashes
      await writeNote(testVault, 'folder/note.md', 'Content');
      
      // Should be able to read with backslashes on Windows
      const content = await readNote(testVault, 'folder/note.md');
      expect(content).toBe('Content');
    });

    it('should handle paths with spaces', async () => {
      const { writeNote, readNote } = await import('../src/tools.js');
      
      await writeNote(testVault, 'folder with spaces/note with spaces.md', 'Content');
      const content = await readNote(testVault, 'folder with spaces/note with spaces.md');
      
      expect(content).toBe('Content');
    });

    it('should handle paths with unicode characters', async () => {
      const { writeNote, readNote } = await import('../src/tools.js');
      
      await writeNote(testVault, '文件夹/笔记.md', 'Content');
      const content = await readNote(testVault, '文件夹/笔记.md');
      
      expect(content).toBe('Content');
    });
  });

  describe('Concurrent operations', () => {
    it('should handle concurrent writes to different files', async () => {
      const { writeNote } = await import('../src/tools.js');
      
      const writes = [];
      for (let i = 0; i < 10; i++) {
        writes.push(writeNote(testVault, `note${i}.md`, `Content ${i}`));
      }
      
      await expect(Promise.all(writes)).resolves.toBeDefined();
      
      // Verify all files were written
      const { listNotes } = await import('../src/tools.js');
      const result = await listNotes(testVault);
      expect(result.count).toBe(10);
    });

    it('should handle concurrent reads', async () => {
      const { writeNote, readNote } = await import('../src/tools.js');
      
      // Create a file first
      await writeNote(testVault, 'shared.md', 'Shared content');
      
      // Read it concurrently
      const reads = [];
      for (let i = 0; i < 10; i++) {
        reads.push(readNote(testVault, 'shared.md'));
      }
      
      const results = await Promise.all(reads);
      results.forEach(content => {
        expect(content).toBe('Shared content');
      });
    });
  });
});
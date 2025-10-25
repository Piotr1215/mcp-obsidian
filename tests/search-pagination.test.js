import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchVault } from '../src/tools.js';
import { config } from '../src/config.js';
import { readFile, stat } from 'fs/promises';
import { glob } from 'glob';

vi.mock('fs/promises');
vi.mock('glob');

describe('Search Pagination (FIRST Principles)', () => {
  const mockVaultPath = '/test/vault';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('maxSearchResults limit (config.js)', () => {
    it('enforces 100-match limit to prevent context explosion', async () => {
      // ARRANGE: 50 files × 5 matches = 250 total matches
      glob.mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => `/test/vault/file${i + 1}.md`)
      );
      stat.mockResolvedValue({ size: 1000 });
      readFile.mockImplementation(async (path) =>
        Array.from({ length: 5 }, (_, i) => `Line ${i + 1} with match`).join('\n')
      );

      // ACT
      const result = await searchVault(mockVaultPath, 'match');

      // ASSERT: Exactly 100 matches (not 250)
      // MUTATION FIX: Exact value prevents <= 99 or >= 101 mutations
      expect(result.totalMatches).toBe(100);
      expect(result.pagination.total).toBe(250);
      expect(result.pagination.hasMore).toBe(true);
    });

    it('returns all results when under limit', async () => {
      // ARRANGE: 3 files × 2 matches = 6 total matches
      glob.mockResolvedValue([
        '/test/vault/a.md',
        '/test/vault/b.md',
        '/test/vault/c.md'
      ]);
      stat.mockResolvedValue({ size: 1000 });
      readFile.mockResolvedValue('match\nmatch');

      // ACT
      const result = await searchVault(mockVaultPath, 'match');

      // ASSERT: No truncation when under limit
      expect(result.totalMatches).toBe(6);
      expect(result.pagination.hasMore).toBe(false);
      expect(result.pagination.total).toBe(6);
    });

  });


  describe('Context explosion prevention', () => {
    it('QUIRK: Large file counts still process (no preview limit in tools.js)', async () => {
      // DISCOVERED: searchVault returns ALL files found
      // Description preview limiting happens in server.js handler (line 66-98)

      glob.mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => `/test/vault/file${i}.md`)
      );
      stat.mockResolvedValue({ size: 100 });
      readFile.mockResolvedValue('single match');

      const result = await searchVault(mockVaultPath, 'match');

      // searchVault returns all 50 files (preview limit is server.js concern)
      expect(result.fileCount).toBe(50);
      expect(result.files).toHaveLength(50);
    });
  });
});

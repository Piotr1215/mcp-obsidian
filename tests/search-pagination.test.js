import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchVault } from '../src/tools.js';
import { config } from '../src/config.js';
import { limitSearchResults } from '../src/search.js';
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
      expect(result.truncated).toBe(true);

      // MUTATION FIX: Verify truncation flag logic (not undefined)
      expect(result.message).toContain('limited to 100');
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
      expect(result.truncated).toBeUndefined();
    });

    it('preserves first 100 matches in order', async () => {
      // ARRANGE: Generate 150 matches
      glob.mockResolvedValue(['/test/vault/note.md']);
      stat.mockResolvedValue({ size: 5000 });
      readFile.mockResolvedValue(
        Array.from({ length: 150 }, (_, i) => `Line ${i + 1} match`).join('\n')
      );

      // ACT
      const result = await searchVault(mockVaultPath, 'match');

      // ASSERT: First match is line 1 (not arbitrary)
      // MUTATION FIX: Verifies slice(0, 100) not slice(50, 150)
      expect(result.files[0].matches[0].line).toBe(1);
      expect(result.files[0].matches[0].content).toContain('Line 1');

      // Last match should be from first 100
      expect(result.totalMatches).toBe(100);
    });
  });

  describe('limitSearchResults function (search.js)', () => {
    const createMockResults = (totalMatches) => ({
      files: [{
        path: 'test.md',
        matchCount: totalMatches,
        matches: Array.from({ length: totalMatches }, (_, i) => ({
          line: i + 1,
          content: `Match ${i + 1}`
        }))
      }],
      totalMatches,
      fileCount: 1,
      filesSearched: 1
    });

    const testCases = [
      { input: 50, expected: 50, truncated: false },
      { input: 100, expected: 100, truncated: false },
      { input: 101, expected: 100, truncated: true },
      { input: 500, expected: 100, truncated: true },
    ];

    testCases.forEach(({ input, expected, truncated }) => {
      it(`limits ${input} matches to ${expected}`, () => {
        // ACT
        const result = limitSearchResults(
          createMockResults(input),
          config.limits.maxSearchResults
        );

        // ASSERT
        expect(result.totalMatches).toBe(expected);
        expect(result.truncated).toBe(truncated || undefined);
      });
    });

    it('MUTATION FIX: boundary <= not < (100 passes, 101 truncates)', () => {
      // Tests line 113: if (searchResults.totalMatches <= maxResults)
      const exactly100 = limitSearchResults(createMockResults(100), 100);
      const exactly101 = limitSearchResults(createMockResults(101), 100);

      // MUTATION FIX: <= allows 100 through, < would truncate it
      expect(exactly100.truncated).toBeUndefined();
      expect(exactly101.truncated).toBe(true);
    });

    it('MUTATION FIX: partial file handling with partialFile flag', () => {
      // ARRANGE: 3 files with 50 matches each = 150 total, limit to 100
      const multiFileResults = {
        files: [
          { path: 'file1.md', matchCount: 50, matches: Array.from({ length: 50 }, (_, i) => ({ line: i + 1, content: `F1-${i}` })) },
          { path: 'file2.md', matchCount: 50, matches: Array.from({ length: 50 }, (_, i) => ({ line: i + 1, content: `F2-${i}` })) },
          { path: 'file3.md', matchCount: 50, matches: Array.from({ length: 50 }, (_, i) => ({ line: i + 1, content: `F3-${i}` })) },
        ],
        totalMatches: 150,
        fileCount: 3,
        filesSearched: 3
      };

      // ACT
      const result = limitSearchResults(multiFileResults, 100);

      // ASSERT: First 2 files complete (100 matches), third file excluded
      expect(result.files).toHaveLength(2);
      expect(result.files[0].matchCount).toBe(50);
      expect(result.files[1].matchCount).toBe(50);
      expect(result.totalMatches).toBe(100);

      // MUTATION FIX: Verify no partialFile flag on complete files (line 138)
      expect(result.files[0].partialFile).toBeUndefined();
      expect(result.files[1].partialFile).toBeUndefined();
    });

    it('MUTATION FIX: partial file gets partialFile flag and slice', () => {
      // ARRANGE: File 1 has 80 matches, File 2 has 80 matches, limit 100
      const multiFileResults = {
        files: [
          { path: 'file1.md', matchCount: 80, matches: Array.from({ length: 80 }, (_, i) => ({ line: i + 1, content: `Match ${i}` })) },
          { path: 'file2.md', matchCount: 80, matches: Array.from({ length: 80 }, (_, i) => ({ line: i + 1, content: `Match ${i}` })) },
        ],
        totalMatches: 160,
        fileCount: 2,
        filesSearched: 2
      };

      // ACT
      const result = limitSearchResults(multiFileResults, 100);

      // ASSERT: File1 complete (80), File2 partial (20), total 100
      expect(result.files).toHaveLength(2);
      expect(result.files[0].matchCount).toBe(80);
      expect(result.files[0].partialFile).toBeUndefined();

      // MUTATION FIX: partialFile flag must be true (not false) - line 138
      expect(result.files[1].partialFile).toBe(true);
      expect(result.files[1].matchCount).toBe(20);

      // MUTATION FIX: slice(0, 20) not slice(1, 20) - line 137
      expect(result.files[1].matches[0].content).toBe('Match 0');
      expect(result.files[1].matches).toHaveLength(20);
    });

    it('MUTATION FIX: matchCount accumulates with += not -=', () => {
      // Tests line 131: matchCount += file.matchCount
      const multiFileResults = {
        files: [
          { path: 'a.md', matchCount: 30, matches: Array.from({ length: 30 }, (_, i) => ({ line: i, content: `A${i}` })) },
          { path: 'b.md', matchCount: 40, matches: Array.from({ length: 40 }, (_, i) => ({ line: i, content: `B${i}` })) },
        ],
        totalMatches: 70,
        fileCount: 2,
        filesSearched: 2
      };

      const result = limitSearchResults(multiFileResults, 100);

      // MUTATION FIX: += makes 30 + 40 = 70, not 30 - 40 = -10
      expect(result.totalMatches).toBe(70);
      expect(result.files).toHaveLength(2);
    });

    it('MUTATION FIX: message content includes limit value', () => {
      const results = createMockResults(200);
      const result = limitSearchResults(results, 100);

      // MUTATION FIX: Verify message has correct limit (line 150)
      expect(result.message).toContain('100');
      expect(result.message).toContain('matches');
    });

    it('MUTATION FIX: break loop when matchCount >= maxResults', () => {
      // Tests line 123-124: if (matchCount >= maxResults) break;
      const manySmallFiles = {
        files: Array.from({ length: 50 }, (_, i) => ({
          path: `file${i}.md`,
          matchCount: 3,
          matches: [{ line: 1, content: 'x' }, { line: 2, content: 'y' }, { line: 3, content: 'z' }]
        })),
        totalMatches: 150,
        fileCount: 50,
        filesSearched: 50
      };

      const result = limitSearchResults(manySmallFiles, 100);

      // MUTATION FIX: >= stops at 99 or 100, not > which would go to 102
      expect(result.totalMatches).toBeLessThanOrEqual(100);
      // With 3-match files, should stop after 33 files (99 matches) or 34 files (100 matches via partial)
      expect(result.files.length).toBeGreaterThanOrEqual(33);
      expect(result.files.length).toBeLessThanOrEqual(34);
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

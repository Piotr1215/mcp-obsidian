import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getBacklinks, findBrokenLinks, findOrphans, getGraphNeighborhood } from '../src/tools.js';
import { MCPError } from '../src/errors.js';

// Mock fs and glob
vi.mock('fs/promises');
vi.mock('glob');

import { readFile, stat } from 'fs/promises';
import { glob } from 'glob';

describe('Graph Tools', () => {
  const mockVaultPath = '/test/vault';

  beforeEach(() => {
    vi.resetAllMocks();
    stat.mockResolvedValue({ size: 1024 });
  });

  // Vault fixture (files are returned by glob sorted, readFile follows that order):
  // A.md links to B and Missing; B.md links back to A; Orphan.md links nothing.
  const mockVault = () => {
    glob.mockResolvedValue([
      '/test/vault/A.md',
      '/test/vault/B.md',
      '/test/vault/Orphan.md'
    ]);
    readFile
      .mockResolvedValueOnce('# A\nSee [[B]] and [[Missing]]')
      .mockResolvedValueOnce('# B\nBack to [[A]]')
      .mockResolvedValueOnce('# Orphan\nNo links');
  };

  describe('getBacklinks', () => {
    it('returns notes linking to the target', async () => {
      mockVault();
      const result = await getBacklinks(mockVaultPath, 'A.md');
      expect(result).toEqual({ path: 'A.md', backlinks: ['B.md'], count: 1 });
    });

    it('resolves basename references', async () => {
      mockVault();
      const result = await getBacklinks(mockVaultPath, 'B');
      expect(result.path).toBe('B.md');
      expect(result.backlinks).toEqual(['A.md']);
    });

    it('throws resourceNotFound for unknown notes', async () => {
      mockVault();
      await expect(getBacklinks(mockVaultPath, 'Nope.md')).rejects.toThrow(MCPError);
    });

    it('throws on ambiguous basename references', async () => {
      glob.mockResolvedValue([
        '/test/vault/x/Dup.md',
        '/test/vault/y/Dup.md'
      ]);
      readFile
        .mockResolvedValueOnce('# Dup x')
        .mockResolvedValueOnce('# Dup y');

      await expect(getBacklinks(mockVaultPath, 'Dup')).rejects.toThrow(/Ambiguous/);
    });
  });

  describe('findBrokenLinks', () => {
    it('reports unresolved wikilinks with their source', async () => {
      mockVault();
      const result = await findBrokenLinks(mockVaultPath);
      expect(result).toEqual({
        brokenLinks: [{ source: 'A.md', target: 'Missing', ambiguous: [] }],
        count: 1
      });
    });

    it('returns empty result for a fully connected vault', async () => {
      glob.mockResolvedValue(['/test/vault/A.md', '/test/vault/B.md']);
      readFile
        .mockResolvedValueOnce('[[B]]')
        .mockResolvedValueOnce('[[A]]');

      const result = await findBrokenLinks(mockVaultPath);
      expect(result).toEqual({ brokenLinks: [], count: 0 });
    });
  });

  describe('findOrphans', () => {
    it('finds notes with no links in either direction', async () => {
      mockVault();
      const result = await findOrphans(mockVaultPath);
      expect(result).toEqual({ orphans: ['Orphan.md'], count: 1 });
    });
  });

  describe('getGraphNeighborhood', () => {
    it('returns neighbors with distances', async () => {
      mockVault();
      const result = await getGraphNeighborhood(mockVaultPath, 'A.md', 1);
      expect(result).toEqual({
        path: 'A.md',
        depth: 1,
        neighbors: [{ path: 'B.md', distance: 1 }],
        count: 1
      });
    });

    it('clamps depth to the 1-3 range', async () => {
      mockVault();
      const result = await getGraphNeighborhood(mockVaultPath, 'A.md', 99);
      expect(result.depth).toBe(3);
    });

    it('skips files exceeding the size limit', async () => {
      glob.mockResolvedValue(['/test/vault/Big.md', '/test/vault/Small.md']);
      stat
        .mockResolvedValueOnce({ size: 999999999 }) // Big.md over limit
        .mockResolvedValueOnce({ size: 1024 });
      readFile.mockResolvedValueOnce('# Small\n[[Big]]');

      const result = await findBrokenLinks(mockVaultPath);
      // Big.md was skipped, so the link to it is broken from the graph's view
      expect(result.brokenLinks).toEqual([
        { source: 'Small.md', target: 'Big', ambiguous: [] }
      ]);
    });
  });
});

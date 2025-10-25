import { describe, it, expect, beforeEach, vi } from 'vitest';
import { discoverMocs } from '../src/tools.js';

// Mock fs and glob
vi.mock('fs/promises');
vi.mock('glob');

import { readFile, stat } from 'fs/promises';
import { glob } from 'glob';

describe('MOC Discovery Tool', () => {
  const mockVaultPath = '/test/vault';

  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('discoverMocs', () => {
    it('should discover all MOCs with #moc tag', async () => {
      const mockFiles = [
        '/test/vault/_mocs/AI-MOC.md',
        '/test/vault/_mocs/Development-MOC.md',
        '/test/vault/regular-note.md'
      ];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 }); // 1KB

      // AI-MOC with links
      readFile
        .mockResolvedValueOnce(`---
tags: [moc, ai, llm]
---

# AI MOC

## Overview
Collection of AI-related notes

## Related Notes
- [[chatgpt]]
- [[ollama]]
- [[langchain]]

→ [[00-INDEX]] back to main vault`)
        // Development-MOC
        .mockResolvedValueOnce(`---
tags: [moc, development]
---

# Development MOC

## Projects
- [[neovim-development]]
- [[golang]]

## Resources
- [[git]]`)
        // Regular note without #moc tag
        .mockResolvedValueOnce(`# Regular Note

Just a regular note without MOC tag.
Contains link to [[something]] but not a MOC.`);

      const result = await discoverMocs(mockVaultPath);

      expect(result.mocs).toHaveLength(2);
      expect(result.count).toBe(2);

      // Check first MOC structure
      const aiMoc = result.mocs.find(m => m.path === '_mocs/AI-MOC.md');
      expect(aiMoc).toBeDefined();
      expect(aiMoc.title).toBe('AI MOC');
      expect(aiMoc.tags).toContain('moc');
      expect(aiMoc.tags).toContain('ai');
      expect(aiMoc.linkedNotes).toHaveLength(4); // chatgpt, ollama, langchain, 00-INDEX
      expect(aiMoc.linkedNotes).toContain('chatgpt');
      expect(aiMoc.linkedNotes).toContain('ollama');
      expect(aiMoc.linkedNotes).toContain('langchain');
      expect(aiMoc.linkedNotes).toContain('00-INDEX');
    });

    it('should extract wikilinks with various formats', async () => {
      const mockFiles = ['/test/vault/test-moc.md'];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 });
      readFile.mockResolvedValue(`---
tags: moc
---

# Test MOC

Links with different formats:
- [[simple-link]]
- [[link-with-alias|Display Name]]
- [[nested/path/note]]
- [[link]] and [[another-link]] in same line
- Not a link: [external](https://example.com)

Back to [[index]]`);

      const result = await discoverMocs(mockVaultPath);

      expect(result.mocs).toHaveLength(1);
      const moc = result.mocs[0];

      // Should extract all wikilinks, ignoring aliases
      expect(moc.linkedNotes).toContain('simple-link');
      expect(moc.linkedNotes).toContain('link-with-alias');
      expect(moc.linkedNotes).toContain('nested/path/note');
      expect(moc.linkedNotes).toContain('link');
      expect(moc.linkedNotes).toContain('another-link');
      expect(moc.linkedNotes).toContain('index');

      // Should not include markdown links
      expect(moc.linkedNotes).not.toContain('https://example.com');
    });

    it('should handle MOCs with inline #moc tag', async () => {
      const mockFiles = ['/test/vault/inline-moc.md'];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 });
      readFile.mockResolvedValue(`# Inline MOC #moc

This uses inline tag instead of frontmatter.

## Links
- [[note1]]
- [[note2]]`);

      const result = await discoverMocs(mockVaultPath);

      expect(result.mocs).toHaveLength(1);
      expect(result.mocs[0].title).toBe('Inline MOC');
      expect(result.mocs[0].linkedNotes).toHaveLength(2);
    });

    it('should handle MOCs with no links', async () => {
      const mockFiles = ['/test/vault/empty-moc.md'];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 });
      readFile.mockResolvedValue(`---
tags: moc
---

# Empty MOC

No links yet, just a placeholder.`);

      const result = await discoverMocs(mockVaultPath);

      expect(result.mocs).toHaveLength(1);
      expect(result.mocs[0].linkedNotes).toHaveLength(0);
      expect(result.mocs[0].linkCount).toBe(0);
    });

    it('should filter by specific MOC name', async () => {
      const mockFiles = [
        '/test/vault/_mocs/AI-MOC.md',
        '/test/vault/_mocs/Dev-MOC.md'
      ];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 });
      readFile
        .mockResolvedValueOnce(`---
tags: moc
---
# AI MOC
[[chatgpt]]`)
        .mockResolvedValueOnce(`---
tags: moc
---
# Dev MOC
[[golang]]`);

      const result = await discoverMocs(mockVaultPath, { mocName: 'AI-MOC' });

      expect(result.mocs).toHaveLength(1);
      expect(result.mocs[0].path).toContain('AI-MOC.md');
    });

    it('should include link count and summary', async () => {
      const mockFiles = ['/test/vault/test-moc.md'];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 });
      readFile.mockResolvedValueOnce(`---
tags: [moc, test]
---

# Test MOC

- [[link1]]
- [[link2]]
- [[link3]]`);

      const result = await discoverMocs(mockVaultPath);

      expect(result.mocs[0].linkCount).toBe(3);
      expect(result.mocs[0].linkedNotes).toHaveLength(3);
    });

    it('should skip files without moc tag', async () => {
      const mockFiles = [
        '/test/vault/moc-note.md',
        '/test/vault/regular-note.md'
      ];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 });
      readFile
        .mockResolvedValueOnce(`---
tags: moc
---
# MOC Note
[[link]]`)
        .mockResolvedValueOnce(`# Regular Note
[[link]] but no MOC tag`);

      const result = await discoverMocs(mockVaultPath);

      expect(result.mocs).toHaveLength(1);
      expect(result.mocs[0].path).toBe('moc-note.md');
    });

    it('should handle empty vault', async () => {
      glob.mockResolvedValue([]);

      const result = await discoverMocs(mockVaultPath);

      expect(result.mocs).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('should handle vault with no MOCs', async () => {
      const mockFiles = ['/test/vault/note.md'];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 });
      readFile.mockResolvedValue('# Regular Note\nNo MOC tag here.');

      const result = await discoverMocs(mockVaultPath);

      expect(result.mocs).toHaveLength(0);
      expect(result.count).toBe(0);
    });

    it('should skip files that are too large', async () => {
      const mockFiles = ['/test/vault/huge-moc.md'];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 11 * 1024 * 1024 }); // 11MB, over 10MB limit

      const result = await discoverMocs(mockVaultPath);

      expect(result.mocs).toHaveLength(0);
      expect(readFile).not.toHaveBeenCalled();
    });

    it('should handle file read errors gracefully', async () => {
      const mockFiles = [
        '/test/vault/good-moc.md',
        '/test/vault/bad-moc.md'
      ];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 });
      // After sorting: bad-moc.md comes before good-moc.md
      readFile
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockResolvedValueOnce(`---
tags: moc
---
# Good MOC
[[link]]`);

      const result = await discoverMocs(mockVaultPath);

      // Should return the successful one and skip the error
      expect(result.mocs).toHaveLength(1);
      expect(result.mocs[0].path).toBe('good-moc.md');
    });

    it('should remove duplicate linked notes', async () => {
      const mockFiles = ['/test/vault/moc.md'];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 });
      readFile.mockResolvedValue(`---
tags: moc
---

# Test MOC

- [[same-note]]
- [[same-note]]
- [[different-note]]
- [[same-note]]`);

      const result = await discoverMocs(mockVaultPath);

      const linkedNotes = result.mocs[0].linkedNotes;
      expect(linkedNotes).toHaveLength(2);
      expect(linkedNotes).toContain('same-note');
      expect(linkedNotes).toContain('different-note');
    });

    it('should filter by directory when specified', async () => {
      const mockFiles = [
        '/test/vault/_mocs/moc1.md',
        '/test/vault/other/moc2.md'
      ];

      glob.mockResolvedValue(['/test/vault/_mocs/moc1.md']);
      stat.mockResolvedValue({ size: 1024 });
      readFile.mockResolvedValue(`---
tags: moc
---
# MOC 1
[[link]]`);

      const result = await discoverMocs(mockVaultPath, { directory: '_mocs' });

      expect(glob).toHaveBeenCalledWith('/test/vault/_mocs/**/*.md');
      expect(result.mocs).toHaveLength(1);
    });

    it('should preserve link order', async () => {
      const mockFiles = ['/test/vault/ordered-moc.md'];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 });
      readFile.mockResolvedValue(`---
tags: moc
---

# Ordered MOC

- [[zebra]]
- [[alpha]]
- [[beta]]`);

      const result = await discoverMocs(mockVaultPath);

      // Links should be in order of appearance (unique)
      expect(result.mocs[0].linkedNotes[0]).toBe('zebra');
      expect(result.mocs[0].linkedNotes[1]).toBe('alpha');
      expect(result.mocs[0].linkedNotes[2]).toBe('beta');
    });

    it('should detect MOC hierarchy (MOCs linking to other MOCs)', async () => {
      const mockFiles = [
        '/test/vault/parent-moc.md',
        '/test/vault/child-moc.md',
        '/test/vault/regular-note.md'
      ];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 });
      readFile
        .mockResolvedValueOnce(`---
tags: moc
---
# Parent MOC
- [[child-moc]]
- [[regular-note]]
- [[another-note]]`)
        .mockResolvedValueOnce(`---
tags: moc
---
# Child MOC
- [[some-note]]`)
        .mockResolvedValueOnce(`# Regular Note
No MOC tag here.`);

      const result = await discoverMocs(mockVaultPath);

      expect(result.mocs).toHaveLength(2);

      const parentMoc = result.mocs.find(m => m.title === 'Parent MOC');
      expect(parentMoc.linkedMocs).toContain('child-moc');
      expect(parentMoc.linkedMocs).not.toContain('regular-note');
      expect(parentMoc.linkedMocs).not.toContain('another-note');
      expect(parentMoc.linkedMocs).toHaveLength(1);
    });

    it('should handle MOCs with no links to other MOCs', async () => {
      const mockFiles = ['/test/vault/standalone-moc.md'];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 });
      readFile.mockResolvedValue(`---
tags: moc
---
# Standalone MOC
- [[note1]]
- [[note2]]`);

      const result = await discoverMocs(mockVaultPath);

      expect(result.mocs[0].linkedMocs).toEqual([]);
    });

    it('should handle nested path MOC links', async () => {
      const mockFiles = [
        '/test/vault/main-moc.md',
        '/test/vault/_mocs/nested-moc.md'
      ];

      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 });
      readFile
        .mockResolvedValueOnce(`---
tags: moc
---
# Main MOC
- [[_mocs/nested-moc]]
- [[regular-note]]`)
        .mockResolvedValueOnce(`---
tags: moc
---
# Nested MOC
- [[something]]`);

      const result = await discoverMocs(mockVaultPath);

      const mainMoc = result.mocs.find(m => m.title === 'Main MOC');
      expect(mainMoc.linkedMocs).toContain('_mocs/nested-moc');
    });
  });
});

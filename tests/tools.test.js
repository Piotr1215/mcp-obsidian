import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchVault, listNotes, readNote, writeNote, appendNote, deleteNote } from '../src/tools.js';

// Mock fs and glob
vi.mock('fs/promises');
vi.mock('glob');

import { readFile, writeFile, mkdir, unlink, access, stat } from 'fs/promises';
import { glob } from 'glob';

describe('Tools module', () => {
  const mockVaultPath = '/test/vault';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchVault', () => {
    it('should find matches in markdown files', async () => {
      const mockFiles = [
        '/test/vault/note1.md',
        '/test/vault/folder/note2.md'
      ];

      glob.mockResolvedValue(mockFiles);
      // Mock file sizes to be within limit
      stat.mockResolvedValue({ size: 1024 }); // 1KB
      // After sorting: folder/note2.md comes before note1.md
      readFile
        .mockResolvedValueOnce('Another file\nWith TEST here\nAnd TEST again')
        .mockResolvedValueOnce('Line 1\nThis contains TEST\nLine 3');

      const result = await searchVault(mockVaultPath, 'test', null, false);

      expect(glob).toHaveBeenCalledWith('/test/vault/**/*.md');
      expect(readFile).toHaveBeenCalledTimes(2);
      expect(result.totalMatches).toBe(3);
      expect(result.fileCount).toBe(2);
      expect(result.files).toHaveLength(2);
      expect(result.files[0]).toEqual({
        path: 'folder/note2.md',
        matchCount: 2,
        matches: [{
          line: 2,
          content: 'With TEST here'
        }, {
          line: 3,
          content: 'And TEST again'
        }]
      });
    });

    it('should handle case-sensitive search', async () => {
      const mockFiles = ['/test/vault/note.md'];
      glob.mockResolvedValue(mockFiles);
      stat.mockResolvedValue({ size: 1024 }); // 1KB
      readFile.mockResolvedValue('test\nTest\nTEST');

      const result = await searchVault(mockVaultPath, 'Test', null, true);

      expect(result.totalMatches).toBe(1);
      expect(result.files[0].matches[0].line).toBe(2);
    });

    it('should search within specific path', async () => {
      glob.mockResolvedValue([]);
      
      await searchVault(mockVaultPath, 'query', 'subfolder', false);

      expect(glob).toHaveBeenCalledWith('/test/vault/subfolder/**/*.md');
    });

    it('should handle empty results', async () => {
      glob.mockResolvedValue(['/test/vault/note.md']);
      stat.mockResolvedValue({ size: 1024 }); // 1KB
      readFile.mockResolvedValue('No matches here');

      const result = await searchVault(mockVaultPath, 'notfound', null, false);

      expect(result.totalMatches).toBe(0);
      expect(result.files).toHaveLength(0);
    });

    it('should handle file read errors', async () => {
      glob.mockResolvedValue(['/test/vault/note.md']);
      // File is skipped if too large, so it won't cause error
      stat.mockRejectedValue(new Error('File too large'));

      const result = await searchVault(mockVaultPath, 'test', null, false);
      
      // Should return empty results since file was skipped
      expect(result.totalMatches).toBe(0);
      expect(result.files).toHaveLength(0);
    });
  });

  describe('listNotes', () => {
    it('should list all markdown files sorted', async () => {
      const mockFiles = [
        '/test/vault/zebra.md',
        '/test/vault/alpha.md',
        '/test/vault/folder/beta.md'
      ];
      
      glob.mockResolvedValue(mockFiles);

      const result = await listNotes(mockVaultPath);

      expect(glob).toHaveBeenCalledWith('/test/vault/**/*.md');
      expect(result.count).toBe(3);
      expect(result.notes).toEqual([
        'alpha.md',
        'folder/beta.md',
        'zebra.md'
      ]);
    });

    it('should list notes in specific directory', async () => {
      const mockFiles = [
        '/test/vault/projects/project1.md',
        '/test/vault/projects/project2.md'
      ];
      
      glob.mockResolvedValue(mockFiles);

      const result = await listNotes(mockVaultPath, 'projects');

      expect(glob).toHaveBeenCalledWith('/test/vault/projects/**/*.md');
      expect(result.count).toBe(2);
    });

    it('should handle empty vault', async () => {
      glob.mockResolvedValue([]);

      const result = await listNotes(mockVaultPath);

      expect(result.count).toBe(0);
      expect(result.notes).toEqual([]);
    });

    it('should handle glob errors', async () => {
      glob.mockRejectedValue(new Error('Access denied'));

      await expect(listNotes(mockVaultPath))
        .rejects.toThrow('Access denied');
    });
  });

  describe('readNote', () => {
    it('should read note content', async () => {
      const noteContent = '# Test Note\n\nThis is the content';
      access.mockResolvedValue();
      stat.mockResolvedValue({ size: 1024 }); // 1KB
      readFile.mockResolvedValue(noteContent);

      const result = await readNote(mockVaultPath, 'test.md');

      expect(readFile).toHaveBeenCalledWith('/test/vault/test.md', 'utf-8');
      expect(result).toBe(noteContent);
    });

    it('should handle nested paths', async () => {
      access.mockResolvedValue();
      stat.mockResolvedValue({ size: 1024 }); // 1KB
      readFile.mockResolvedValue('Content');

      await readNote(mockVaultPath, 'folder/subfolder/note.md');

      expect(readFile).toHaveBeenCalledWith(
        '/test/vault/folder/subfolder/note.md',
        'utf-8'
      );
    });

    it('should propagate read errors', async () => {
      access.mockResolvedValue();
      stat.mockResolvedValue({ size: 1024 }); // 1KB
      readFile.mockRejectedValue(new Error('File not found'));

      await expect(readNote(mockVaultPath, 'missing.md'))
        .rejects.toThrow('Failed to read note');
    });

    it('should resolve note by filename when exact path not found (wikilink-style)', async () => {
      // Exact path fails, but glob finds the file elsewhere
      access.mockRejectedValueOnce(new Error('ENOENT'));
      glob.mockResolvedValue(['/test/vault/projects/note.md']);
      stat.mockResolvedValue({ size: 1024 });
      readFile.mockResolvedValue('# Found Note');

      const result = await readNote(mockVaultPath, 'note.md');

      expect(glob).toHaveBeenCalledWith('/test/vault/**/note.md');
      expect(result).toBe('# Found Note');
    });

    it('should throw ambiguity error when multiple matches found', async () => {
      access.mockRejectedValueOnce(new Error('ENOENT'));
      glob.mockResolvedValue([
        '/test/vault/folder1/note.md',
        '/test/vault/folder2/note.md'
      ]);

      await expect(readNote(mockVaultPath, 'note.md'))
        .rejects.toThrow(/Ambiguous path.*matches multiple notes/);
    });

    it('should throw resource not found when no matches', async () => {
      access.mockRejectedValueOnce(new Error('ENOENT'));
      glob.mockResolvedValue([]);

      await expect(readNote(mockVaultPath, 'nonexistent.md'))
        .rejects.toThrow('Resource not found');
    });
  });

  describe('writeNote', () => {
    it('should write note with directory creation', async () => {
      mkdir.mockResolvedValue();
      writeFile.mockResolvedValue();

      const result = await writeNote(mockVaultPath, 'new/folder/note.md', '# New Note');

      expect(mkdir).toHaveBeenCalledWith('/test/vault/new/folder', { recursive: true });
      expect(writeFile).toHaveBeenCalledWith(
        '/test/vault/new/folder/note.md',
        '# New Note',
        'utf-8'
      );
      expect(result).toBe('new/folder/note.md');
    });

    it('should handle existing directory', async () => {
      // mkdir succeeds (directory already exists is not an error with recursive: true)
      mkdir.mockResolvedValue();
      writeFile.mockResolvedValue();

      const result = await writeNote(mockVaultPath, 'note.md', 'Content');

      expect(result).toBe('note.md');
      expect(writeFile).toHaveBeenCalled();
    });

    it('should propagate write errors', async () => {
      mkdir.mockResolvedValue();
      writeFile.mockRejectedValue(new Error('Disk full'));

      await expect(writeNote(mockVaultPath, 'note.md', 'Content'))
        .rejects.toThrow('Failed to write note');
    });

    it('should write to root directory', async () => {
      mkdir.mockResolvedValue();
      writeFile.mockResolvedValue();

      await writeNote(mockVaultPath, 'root-note.md', 'Content');

      expect(mkdir).toHaveBeenCalledWith('/test/vault', { recursive: true });
    });
  });

  describe('deleteNote', () => {
    it('should delete note', async () => {
      access.mockResolvedValue();
      unlink.mockResolvedValue();

      const result = await deleteNote(mockVaultPath, 'delete-me.md');

      expect(unlink).toHaveBeenCalledWith('/test/vault/delete-me.md');
      expect(result).toEqual({ deleted: true, path: 'delete-me.md' });
    });

    it('should not delete when the confirm gate refuses', async () => {
      access.mockResolvedValue();
      unlink.mockResolvedValue();
      const confirm = vi.fn().mockResolvedValue({ confirmed: false, reason: 'you declined' });

      const result = await deleteNote(mockVaultPath, 'keep-me.md', { confirm });

      expect(confirm).toHaveBeenCalledWith({
        notePath: 'keep-me.md',
        fullPath: '/test/vault/keep-me.md'
      });
      expect(unlink).not.toHaveBeenCalled();
      expect(result).toEqual({ deleted: false, path: 'keep-me.md', reason: 'you declined' });
    });

    it('should delete when the confirm gate agrees', async () => {
      access.mockResolvedValue();
      unlink.mockResolvedValue();
      const confirm = vi.fn().mockResolvedValue({ confirmed: true, reason: 'confirmed' });

      const result = await deleteNote(mockVaultPath, 'delete-me.md', { confirm });

      expect(unlink).toHaveBeenCalledWith('/test/vault/delete-me.md');
      expect(result).toEqual({ deleted: true, path: 'delete-me.md' });
    });

    it('should not ask for confirmation for a note that does not exist', async () => {
      access.mockRejectedValue(new Error('ENOENT'));
      const confirm = vi.fn();

      await expect(deleteNote(mockVaultPath, 'gone.md', { confirm })).rejects.toThrow();

      expect(confirm).not.toHaveBeenCalled();
    });

    it('should handle nested paths', async () => {
      access.mockResolvedValue();
      unlink.mockResolvedValue();

      await deleteNote(mockVaultPath, 'folder/note.md');

      expect(unlink).toHaveBeenCalledWith('/test/vault/folder/note.md');
    });

    it('should propagate delete errors', async () => {
      unlink.mockRejectedValue(new Error('Permission denied'));

      await expect(deleteNote(mockVaultPath, 'protected.md'))
        .rejects.toThrow('Permission denied');
    });
  });

  describe('appendNote', () => {
    it('should append content to existing note', async () => {
      access.mockResolvedValue();
      readFile.mockResolvedValue('# Existing Note\n\nSome content');
      mkdir.mockResolvedValue();
      writeFile.mockResolvedValue();

      const result = await appendNote(mockVaultPath, 'note.md', 'New content');

      expect(writeFile).toHaveBeenCalledWith(
        '/test/vault/note.md',
        '# Existing Note\n\nSome content\nNew content',
        'utf-8'
      );
      expect(result).toBe('note.md');
    });

    it('should create new note if file does not exist', async () => {
      access.mockRejectedValue(new Error('ENOENT'));
      mkdir.mockResolvedValue();
      writeFile.mockResolvedValue();

      const result = await appendNote(mockVaultPath, 'new-note.md', '# New Note');

      expect(writeFile).toHaveBeenCalledWith(
        '/test/vault/new-note.md',
        '# New Note',
        'utf-8'
      );
      expect(result).toBe('new-note.md');
    });

    it('should append under specific section', async () => {
      access.mockResolvedValue();
      readFile.mockResolvedValue('# Note\n\n## Section A\n\nContent A\n\n## Section B\n\nContent B');
      mkdir.mockResolvedValue();
      writeFile.mockResolvedValue();

      await appendNote(mockVaultPath, 'note.md', 'Appended text', { section: 'Section A' });

      expect(writeFile).toHaveBeenCalledWith(
        '/test/vault/note.md',
        '# Note\n\n## Section A\n\nContent A\n\nAppended text\n## Section B\n\nContent B',
        'utf-8'
      );
    });

    it('should throw error if section not found', async () => {
      access.mockResolvedValue();
      readFile.mockResolvedValue('# Note\n\n## Other Section\n\nContent');
      mkdir.mockResolvedValue();

      await expect(appendNote(mockVaultPath, 'note.md', 'Content', { section: 'Missing' }))
        .rejects.toThrow('Section "Missing" not found');
    });

    it('should handle ensureNewline option', async () => {
      access.mockResolvedValue();
      readFile.mockResolvedValue('Content without newline');
      mkdir.mockResolvedValue();
      writeFile.mockResolvedValue();

      await appendNote(mockVaultPath, 'note.md', 'More content', { ensureNewline: true });

      expect(writeFile).toHaveBeenCalledWith(
        '/test/vault/note.md',
        'Content without newline\nMore content',
        'utf-8'
      );
    });

    it('should not add extra newline when ensureNewline is false', async () => {
      access.mockResolvedValue();
      readFile.mockResolvedValue('Content');
      mkdir.mockResolvedValue();
      writeFile.mockResolvedValue();

      await appendNote(mockVaultPath, 'note.md', ' appended', { ensureNewline: false });

      expect(writeFile).toHaveBeenCalledWith(
        '/test/vault/note.md',
        'Content appended',
        'utf-8'
      );
    });

    it('should propagate write errors', async () => {
      access.mockResolvedValue();
      readFile.mockResolvedValue('Existing');
      mkdir.mockResolvedValue();
      writeFile.mockRejectedValue(new Error('Disk full'));

      await expect(appendNote(mockVaultPath, 'note.md', 'Content'))
        .rejects.toThrow('Failed to append to note');
    });
  });
});
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchVault, listNotes, readNote, writeNote, deleteNote } from '../src/tools.js';

// Mock fs and glob
vi.mock('fs/promises');
vi.mock('glob');

import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
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
      readFile
        .mockResolvedValueOnce('Line 1\nThis contains TEST\nLine 3')
        .mockResolvedValueOnce('Another file\nWith TEST here\nAnd TEST again');

      const result = await searchVault(mockVaultPath, 'test', null, false);

      expect(glob).toHaveBeenCalledWith('/test/vault/**/*.md');
      expect(readFile).toHaveBeenCalledTimes(2);
      expect(result.count).toBe(3);
      expect(result.results).toHaveLength(3);
      expect(result.results[0]).toEqual({
        file: 'note1.md',
        line: 2,
        content: 'This contains TEST'
      });
    });

    it('should handle case-sensitive search', async () => {
      const mockFiles = ['/test/vault/note.md'];
      glob.mockResolvedValue(mockFiles);
      readFile.mockResolvedValue('test\nTest\nTEST');

      const result = await searchVault(mockVaultPath, 'Test', null, true);

      expect(result.count).toBe(1);
      expect(result.results[0].line).toBe(2);
    });

    it('should search within specific path', async () => {
      glob.mockResolvedValue([]);
      
      await searchVault(mockVaultPath, 'query', 'subfolder', false);

      expect(glob).toHaveBeenCalledWith('/test/vault/subfolder/**/*.md');
    });

    it('should handle empty results', async () => {
      glob.mockResolvedValue(['/test/vault/note.md']);
      readFile.mockResolvedValue('No matches here');

      const result = await searchVault(mockVaultPath, 'notfound', null, false);

      expect(result.count).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('should handle file read errors', async () => {
      glob.mockResolvedValue(['/test/vault/note.md']);
      readFile.mockRejectedValue(new Error('Permission denied'));

      await expect(searchVault(mockVaultPath, 'test', null, false))
        .rejects.toThrow('Permission denied');
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
      readFile.mockResolvedValue(noteContent);

      const result = await readNote(mockVaultPath, 'test.md');

      expect(readFile).toHaveBeenCalledWith('/test/vault/test.md', 'utf-8');
      expect(result).toBe(noteContent);
    });

    it('should handle nested paths', async () => {
      readFile.mockResolvedValue('Content');

      await readNote(mockVaultPath, 'folder/subfolder/note.md');

      expect(readFile).toHaveBeenCalledWith(
        '/test/vault/folder/subfolder/note.md',
        'utf-8'
      );
    });

    it('should propagate read errors', async () => {
      readFile.mockRejectedValue(new Error('File not found'));

      await expect(readNote(mockVaultPath, 'missing.md'))
        .rejects.toThrow('File not found');
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
      unlink.mockResolvedValue();

      const result = await deleteNote(mockVaultPath, 'delete-me.md');

      expect(unlink).toHaveBeenCalledWith('/test/vault/delete-me.md');
      expect(result).toBe('delete-me.md');
    });

    it('should handle nested paths', async () => {
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
});
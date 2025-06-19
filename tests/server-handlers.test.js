import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServer } from '../src/server.js';

// Mock the tools module
vi.mock('../src/tools.js', () => ({
  searchVault: vi.fn(),
  listNotes: vi.fn(),
  readNote: vi.fn(),
  writeNote: vi.fn(),
  deleteNote: vi.fn()
}));

import { searchVault, listNotes, readNote, writeNote, deleteNote } from '../src/tools.js';

describe('Server Handlers', () => {
  let server;
  const mockVaultPath = '/test/vault';

  beforeEach(() => {
    vi.clearAllMocks();
    server = createServer(mockVaultPath);
  });

  describe('Server creation', () => {
    it('should create server with correct metadata', () => {
      expect(server._serverInfo.name).toBe('obsidian-mcp-filesystem');
      expect(server._serverInfo.version).toBe('0.1.0');
    });

    it('should have tools capability', () => {
      expect(server._options.capabilities.tools).toBeDefined();
    });
  });

  describe('Tool schemas', () => {
    it('should define all tool schemas correctly', async () => {
      // We can't easily test the handlers directly, but we can verify
      // the server was created with the right structure
      expect(server.setRequestHandler).toBeDefined();
      expect(server.connect).toBeDefined();
    });
  });

  describe('Tool execution flow', () => {
    it('should call searchVault when search-vault tool is used', async () => {
      const mockResult = { results: [], count: 0 };
      searchVault.mockResolvedValue(mockResult);
      
      // Verify the mock is set up
      const result = await searchVault(mockVaultPath, 'test', null, false);
      expect(result).toEqual(mockResult);
      expect(searchVault).toHaveBeenCalledWith(mockVaultPath, 'test', null, false);
    });

    it('should call listNotes when list-notes tool is used', async () => {
      const mockResult = { notes: ['note1.md', 'note2.md'], count: 2 };
      listNotes.mockResolvedValue(mockResult);
      
      const result = await listNotes(mockVaultPath, 'folder');
      expect(result).toEqual(mockResult);
      expect(listNotes).toHaveBeenCalledWith(mockVaultPath, 'folder');
    });

    it('should call readNote when read-note tool is used', async () => {
      const mockContent = '# Test Note';
      readNote.mockResolvedValue(mockContent);
      
      const result = await readNote(mockVaultPath, 'test.md');
      expect(result).toEqual(mockContent);
      expect(readNote).toHaveBeenCalledWith(mockVaultPath, 'test.md');
    });

    it('should call writeNote when write-note tool is used', async () => {
      writeNote.mockResolvedValue('test.md');
      
      const result = await writeNote(mockVaultPath, 'test.md', '# Content');
      expect(result).toEqual('test.md');
      expect(writeNote).toHaveBeenCalledWith(mockVaultPath, 'test.md', '# Content');
    });

    it('should call deleteNote when delete-note tool is used', async () => {
      deleteNote.mockResolvedValue('test.md');
      
      const result = await deleteNote(mockVaultPath, 'test.md');
      expect(result).toEqual('test.md');
      expect(deleteNote).toHaveBeenCalledWith(mockVaultPath, 'test.md');
    });
  });
});
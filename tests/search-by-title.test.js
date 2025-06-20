import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchByTitle } from '../src/tools.js';

// Mock fs and glob
vi.mock('fs/promises');
vi.mock('glob');

import { readFile, stat } from 'fs/promises';
import { glob } from 'glob';

describe('searchByTitle', () => {
  const mockVaultPath = '/test/vault';
  
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should find notes by exact title match', async () => {
    const mockFiles = [
      '/test/vault/Getting Started.md',
      '/test/vault/Other Note.md'
    ];
    
    glob.mockResolvedValue(mockFiles);
    stat.mockResolvedValue({ size: 1024 }); // 1KB
    
    readFile
      .mockResolvedValueOnce('# Getting Started\n\nWelcome to Obsidian!')
      .mockResolvedValueOnce('# Other Note\n\nSome content');
    
    const result = await searchByTitle(mockVaultPath, 'Getting Started');
    
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      file: 'Getting Started.md',
      title: 'Getting Started',
      line: 1
    });
  });
  
  it('should find notes by partial title match', async () => {
    const mockFiles = [
      '/test/vault/Projects/MCP Development.md',
      '/test/vault/Projects/Web Development.md',
      '/test/vault/Other.md'
    ];
    
    glob.mockResolvedValue(mockFiles);
    stat.mockResolvedValue({ size: 1024 });
    
    readFile
      .mockResolvedValueOnce('# MCP Development\n\nModel Context Protocol notes')
      .mockResolvedValueOnce('# Web Development Guide\n\nHTML, CSS, JavaScript')
      .mockResolvedValueOnce('# Other Title\n\nContent');
    
    const result = await searchByTitle(mockVaultPath, 'Development');
    
    expect(result.results).toHaveLength(2);
    expect(result.results.map(r => r.file)).toContain('Projects/MCP Development.md');
    expect(result.results.map(r => r.file)).toContain('Projects/Web Development.md');
  });
  
  it('should perform case-insensitive search by default', async () => {
    const mockFiles = ['/test/vault/Getting Started.md'];
    
    glob.mockResolvedValue(mockFiles);
    stat.mockResolvedValue({ size: 1024 });
    readFile.mockResolvedValue('# Getting Started\n\nContent');
    
    const result = await searchByTitle(mockVaultPath, 'getting started');
    
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe('Getting Started');
  });
  
  it('should perform case-sensitive search when specified', async () => {
    const mockFiles = ['/test/vault/Getting Started.md'];
    
    glob.mockResolvedValue(mockFiles);
    stat.mockResolvedValue({ size: 1024 });
    readFile.mockResolvedValue('# Getting Started\n\nContent');
    
    const result = await searchByTitle(mockVaultPath, 'getting started', null, true);
    
    expect(result.results).toHaveLength(0);
  });
  
  it('should search within a specific directory', async () => {
    const mockFiles = [
      '/test/vault/Projects/MCP Development.md',
      '/test/vault/Projects/Web Development.md'
    ];
    
    glob.mockResolvedValue(mockFiles);
    stat.mockResolvedValue({ size: 1024 });
    
    readFile
      .mockResolvedValueOnce('# MCP Development\n\nNotes')
      .mockResolvedValueOnce('# Web Development\n\nNotes');
    
    const result = await searchByTitle(mockVaultPath, 'Development', 'Projects');
    
    expect(glob).toHaveBeenCalledWith('/test/vault/Projects/**/*.md');
    expect(result.results).toHaveLength(2);
    expect(result.results.every(r => r.file.startsWith('Projects/'))).toBe(true);
  });
  
  it('should handle notes without h1 titles', async () => {
    const mockFiles = ['/test/vault/no-title.md'];
    
    glob.mockResolvedValue(mockFiles);
    stat.mockResolvedValue({ size: 1024 });
    readFile.mockResolvedValue('This note has no title, just content.');
    
    const result = await searchByTitle(mockVaultPath, 'no-title');
    
    expect(result.results).toHaveLength(0);
  });
  
  it('should only match h1 headings, not other levels', async () => {
    const mockFiles = ['/test/vault/second-heading.md'];
    
    glob.mockResolvedValue(mockFiles);
    stat.mockResolvedValue({ size: 1024 });
    readFile.mockResolvedValue('Some intro text\n\n## Second Level Heading\n\nContent');
    
    const result = await searchByTitle(mockVaultPath, 'Second Level Heading');
    
    expect(result.results).toHaveLength(0);
  });
  
  it('should return structured data with search metadata', async () => {
    const mockFiles = ['/test/vault/API Documentation.md'];
    
    glob.mockResolvedValue(mockFiles);
    stat.mockResolvedValue({ size: 1024 });
    readFile.mockResolvedValue('# API Documentation\n\nContent');
    
    const result = await searchByTitle(mockVaultPath, 'API');
    
    expect(result).toMatchObject({
      results: expect.any(Array),
      count: 1,
      filesSearched: 1
    });
  });
  
  it('should handle empty query', async () => {
    await expect(searchByTitle(mockVaultPath, '')).rejects.toThrow('query');
  });
  
  it('should handle missing query parameter', async () => {
    await expect(searchByTitle(mockVaultPath)).rejects.toThrow('query');
  });
});
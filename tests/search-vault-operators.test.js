import { describe, it, expect, beforeEach, vi } from 'vitest';
import { searchVault } from '../src/tools.js';
import { readFile, stat } from 'fs/promises';
import { glob } from 'glob';

vi.mock('fs/promises');
vi.mock('glob');

describe('searchVault with operators', () => {
  const mockVaultPath = '/test/vault';
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle NOT operator correctly', async () => {
    // Mock files
    glob.mockResolvedValue([
      '/test/vault/note1.md',
      '/test/vault/note2.md'
    ]);
    
    // Mock file stats
    stat.mockResolvedValue({ size: 1000 });
    
    // Mock file contents
    readFile
      .mockResolvedValueOnce('This note is about mcp and caas')
      .mockResolvedValueOnce('This note is about mcp only');
    
    const result = await searchVault(mockVaultPath, 'mcp NOT caas');
    
    console.log('Search result:', result);
    
    // Should only find the second note
    expect(result.count).toBe(1);
    expect(result.results[0].file).toBe('note2.md');
  });

  it('should handle minus operator correctly', async () => {
    // Mock files
    glob.mockResolvedValue([
      '/test/vault/note1.md',
      '/test/vault/note2.md'
    ]);
    
    // Mock file stats
    stat.mockResolvedValue({ size: 1000 });
    
    // Mock file contents
    readFile
      .mockResolvedValueOnce('This note is about mcp and caas')
      .mockResolvedValueOnce('This note is about mcp only');
    
    const result = await searchVault(mockVaultPath, 'mcp -caas');
    
    console.log('Search result with minus:', result);
    
    // Should only find the second note
    expect(result.count).toBe(1);
    expect(result.results[0].file).toBe('note2.md');
  });

  it('should show what evaluateExpression returns', async () => {
    // Mock files
    glob.mockResolvedValue([
      '/test/vault/note1.md'
    ]);
    
    // Mock file stats
    stat.mockResolvedValue({ size: 1000 });
    
    // Mock file contents
    readFile.mockResolvedValueOnce('This note is about mcp and caas');
    
    // Test both queries
    const result1 = await searchVault(mockVaultPath, 'mcp NOT caas');
    const result2 = await searchVault(mockVaultPath, 'mcp -caas');
    
    console.log('Result for "mcp NOT caas":', result1);
    console.log('Result for "mcp -caas":', result2);
    
    // Both should exclude the note with caas
    expect(result1.count).toBe(0);
    expect(result2.count).toBe(0);
  });
});
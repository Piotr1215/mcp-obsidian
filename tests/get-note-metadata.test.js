import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getNoteMetadata } from '../src/tools.js';

// Mock fs and glob
vi.mock('fs/promises');
vi.mock('glob');

import { readFile, stat } from 'fs/promises';
import { glob } from 'glob';

describe('getNoteMetadata', () => {
  const mockVaultPath = '/test/vault';
  
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should extract frontmatter metadata', async () => {
    const mockContent = `---
title: My Note Title
tags: [tag1, tag2, tag3]
date: 2024-01-15
author: John Doe
custom_field: Custom Value
---

# My Note Title

Content of the note.`;
    
    readFile.mockResolvedValue(mockContent);
    stat.mockResolvedValue({ size: 1024 });
    
    const result = await getNoteMetadata(mockVaultPath, 'notes/my-note.md');
    
    expect(result).toMatchObject({
      path: 'notes/my-note.md',
      frontmatter: {
        title: 'My Note Title',
        tags: ['tag1', 'tag2', 'tag3'],
        date: '2024-01-15',
        author: 'John Doe',
        custom_field: 'Custom Value'
      },
      title: 'My Note Title',
      titleLine: 9,
      hasContent: true,
      contentLength: mockContent.length,
      contentPreview: 'Content of the note.'
    });
  });
  
  it('should handle notes without frontmatter', async () => {
    const mockContent = `# Note Without Frontmatter

This is a simple note without any frontmatter.`;
    
    readFile.mockResolvedValue(mockContent);
    stat.mockResolvedValue({ size: 1024 });
    
    const result = await getNoteMetadata(mockVaultPath, 'simple-note.md');
    
    expect(result).toMatchObject({
      path: 'simple-note.md',
      frontmatter: {},
      title: 'Note Without Frontmatter',
      titleLine: 1,
      hasContent: true,
      contentLength: mockContent.length,
      contentPreview: 'This is a simple note without any frontmatter.'
    });
  });
  
  it('should handle notes with only frontmatter', async () => {
    const mockContent = `---
title: Metadata Only
tags: [meta]
---`;
    
    readFile.mockResolvedValue(mockContent);
    stat.mockResolvedValue({ size: 1024 });
    
    const result = await getNoteMetadata(mockVaultPath, 'meta-only.md');
    
    expect(result).toMatchObject({
      path: 'meta-only.md',
      frontmatter: {
        title: 'Metadata Only',
        tags: ['meta']
      },
      title: null,
      titleLine: null,
      hasContent: false,
      contentLength: mockContent.length,
      contentPreview: ''
    });
  });
  
  it('should extract inline tags from content', async () => {
    const mockContent = `# Note with Inline Tags

This note has #inline-tag and #another-tag in the content.`;
    
    readFile.mockResolvedValue(mockContent);
    stat.mockResolvedValue({ size: 1024 });
    
    const result = await getNoteMetadata(mockVaultPath, 'inline-tags.md');
    
    expect(result.inlineTags).toEqual(['inline-tag', 'another-tag']);
  });
  
  it('should handle multiple notes in batch mode', async () => {
    const mockFiles = [
      '/test/vault/note1.md',
      '/test/vault/note2.md'
    ];
    
    glob.mockResolvedValue(mockFiles);
    stat.mockResolvedValue({ size: 1024 });
    
    readFile
      .mockResolvedValueOnce('# Note 1\n\nContent 1')
      .mockResolvedValueOnce('---\ntitle: Note 2\n---\n# Note 2\n\nContent 2');
    
    const result = await getNoteMetadata(mockVaultPath, null, { batch: true });
    
    expect(result.notes).toHaveLength(2);
    expect(result.notes[0].title).toBe('Note 1');
    expect(result.notes[1].frontmatter.title).toBe('Note 2');
    expect(result.count).toBe(2);
  });
  
  it('should handle batch mode with directory filter', async () => {
    const mockFiles = [
      '/test/vault/folder/note1.md',
      '/test/vault/folder/note2.md'
    ];
    
    glob.mockResolvedValue(mockFiles);
    stat.mockResolvedValue({ size: 1024 });
    
    readFile.mockResolvedValue('# Test Note\n\nContent');
    
    const result = await getNoteMetadata(mockVaultPath, 'folder', { batch: true });
    
    expect(glob).toHaveBeenCalledWith('/test/vault/folder/**/*.md');
    expect(result.notes).toHaveLength(2);
  });
  
  it('should limit content preview length', async () => {
    const longContent = 'This is a very long content. '.repeat(20);
    const mockContent = `# Long Note\n\n${longContent}`;
    
    readFile.mockResolvedValue(mockContent);
    stat.mockResolvedValue({ size: mockContent.length });
    
    const result = await getNoteMetadata(mockVaultPath, 'long-note.md');
    
    expect(result.contentPreview.length).toBeLessThanOrEqual(200);
    expect(result.contentPreview.endsWith('...')).toBe(true);
  });
  
  it('should handle empty notes', async () => {
    readFile.mockResolvedValue('');
    stat.mockResolvedValue({ size: 0 });
    
    const result = await getNoteMetadata(mockVaultPath, 'empty.md');
    
    expect(result).toMatchObject({
      path: 'empty.md',
      frontmatter: {},
      title: null,
      titleLine: null,
      hasContent: false,
      contentLength: 0,
      contentPreview: ''
    });
  });
  
  it('should validate path parameter', async () => {
    await expect(getNoteMetadata(mockVaultPath, '../outside.md'))
      .rejects.toThrow('Path traversal');
  });
  
  it('should require either path or batch mode', async () => {
    await expect(getNoteMetadata(mockVaultPath))
      .rejects.toThrow();
  });
  
  it('should handle file read errors gracefully in batch mode', async () => {
    const mockFiles = [
      '/test/vault/good.md',
      '/test/vault/bad.md'
    ];
    
    glob.mockResolvedValue(mockFiles);
    stat.mockResolvedValue({ size: 1024 });
    
    readFile
      .mockResolvedValueOnce('# Good Note')
      .mockRejectedValueOnce(new Error('Permission denied'));
    
    const result = await getNoteMetadata(mockVaultPath, null, { batch: true });
    
    expect(result.notes).toHaveLength(1);
    expect(result.notes[0].title).toBe('Good Note');
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({
      file: 'bad.md',
      error: 'Permission denied'
    });
  });
});
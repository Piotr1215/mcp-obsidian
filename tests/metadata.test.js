import { describe, it, expect } from 'vitest';
import { 
  extractFrontmatter, 
  extractInlineTags, 
  extractContentPreview,
  extractNoteMetadata,
  transformBatchMetadata
} from '../src/metadata.js';

describe('Metadata Pure Functions', () => {
  describe('extractFrontmatter', () => {
    it('should extract valid frontmatter', () => {
      const content = `---
title: Test Note
tags: [tag1, tag2]
date: 2024-01-15
---

# Test Note

Content here.`;
      
      const result = extractFrontmatter(content);
      
      expect(result.frontmatter).toEqual({
        title: 'Test Note',
        tags: ['tag1', 'tag2'],
        date: '2024-01-15'
      });
      expect(result.contentWithoutFrontmatter).toBe('\n# Test Note\n\nContent here.');
    });
    
    it('should handle content without frontmatter', () => {
      const content = '# Title\n\nContent';
      const result = extractFrontmatter(content);
      
      expect(result.frontmatter).toEqual({});
      expect(result.contentWithoutFrontmatter).toBe(content);
    });
    
    it('should handle empty content', () => {
      const result = extractFrontmatter('');
      
      expect(result.frontmatter).toEqual({});
      expect(result.contentWithoutFrontmatter).toBe('');
    });
    
    it('should handle frontmatter without closing delimiter', () => {
      const content = '---\ntitle: Test\nNo closing delimiter';
      const result = extractFrontmatter(content);
      
      expect(result.frontmatter).toEqual({});
      expect(result.contentWithoutFrontmatter).toBe(content);
    });
    
    it('should parse different value types', () => {
      const content = `---
string: "quoted string"
number: 42
boolean: true
array: [item1, item2]
---`;
      
      const result = extractFrontmatter(content);
      
      expect(result.frontmatter).toEqual({
        string: 'quoted string',
        number: 42,
        boolean: true,
        array: ['item1', 'item2']
      });
    });
  });
  
  describe('extractInlineTags', () => {
    it('should extract inline tags', () => {
      const content = 'This has #tag1 and #tag2 in the text.';
      const tags = extractInlineTags(content);
      
      expect(tags).toEqual(['tag1', 'tag2']);
    });
    
    it('should handle tags with hyphens and underscores', () => {
      const content = '#my-tag #another_tag #tag123';
      const tags = extractInlineTags(content);
      
      expect(tags).toEqual(['my-tag', 'another_tag', 'tag123']);
    });
    
    it('should deduplicate tags', () => {
      const content = '#duplicate #other #duplicate';
      const tags = extractInlineTags(content);
      
      expect(tags).toEqual(['duplicate', 'other']);
    });
    
    it('should return empty array for no tags', () => {
      const content = 'No tags here';
      const tags = extractInlineTags(content);
      
      expect(tags).toEqual([]);
    });
    
    it('should handle empty content', () => {
      expect(extractInlineTags('')).toEqual([]);
      expect(extractInlineTags(null)).toEqual([]);
    });
  });
  
  describe('extractContentPreview', () => {
    it('should extract preview from content', () => {
      const content = '# Title\n\nThis is the preview text.';
      const preview = extractContentPreview(content);
      
      expect(preview).toBe('This is the preview text.');
    });
    
    it('should skip frontmatter', () => {
      const content = '---\ntitle: Test\n---\n# Title\n\nPreview text.';
      const preview = extractContentPreview(content);
      
      expect(preview).toBe('Preview text.');
    });
    
    it('should skip headings', () => {
      const content = '# Title\n## Subtitle\nActual content here.';
      const preview = extractContentPreview(content);
      
      expect(preview).toBe('Actual content here.');
    });
    
    it('should truncate long content', () => {
      const longText = 'This is a very long text. '.repeat(20);
      const content = `# Title\n\n${longText}`;
      const preview = extractContentPreview(content, 50);
      
      expect(preview.length).toBe(50);
      expect(preview.endsWith('...')).toBe(true);
    });
    
    it('should handle empty content', () => {
      expect(extractContentPreview('')).toBe('');
      expect(extractContentPreview('# Only Heading')).toBe('');
    });
  });
  
  describe('extractNoteMetadata', () => {
    it('should extract complete metadata', () => {
      const content = `---
title: Test Note
tags: [tag1]
---

# Test Note

Content with #inline-tag.`;
      
      const metadata = extractNoteMetadata(content, 'test.md');
      
      expect(metadata).toMatchObject({
        path: 'test.md',
        frontmatter: { title: 'Test Note', tags: ['tag1'] },
        title: 'Test Note',
        titleLine: expect.any(Number),
        hasContent: true,
        contentLength: content.length,
        contentPreview: 'Content with #inline-tag.',
        inlineTags: ['inline-tag']
      });
    });
    
    it('should handle content without title', () => {
      const content = 'Just content, no title.';
      const metadata = extractNoteMetadata(content, 'no-title.md');
      
      expect(metadata.title).toBeNull();
      expect(metadata.titleLine).toBeNull();
    });
  });
  
  describe('transformBatchMetadata', () => {
    it('should transform successful results', () => {
      const results = [
        {
          file: '/vault/note1.md',
          metadata: { path: 'note1.md', title: 'Note 1' }
        },
        {
          file: '/vault/note2.md',
          metadata: { path: 'note2.md', title: 'Note 2' }
        }
      ];
      
      const transformed = transformBatchMetadata(results, '/vault');
      
      expect(transformed).toEqual({
        notes: [
          { path: 'note1.md', title: 'Note 1' },
          { path: 'note2.md', title: 'Note 2' }
        ],
        count: 2,
        errors: []
      });
    });
    
    it('should handle errors', () => {
      const results = [
        {
          file: '/vault/good.md',
          metadata: { path: 'good.md', title: 'Good' }
        },
        {
          file: '/vault/bad.md',
          error: new Error('Read error')
        }
      ];
      
      const transformed = transformBatchMetadata(results, '/vault');
      
      expect(transformed.notes).toHaveLength(1);
      expect(transformed.errors).toHaveLength(1);
      expect(transformed.errors[0]).toEqual({
        file: 'bad.md',
        error: 'Read error'
      });
    });
  });
});
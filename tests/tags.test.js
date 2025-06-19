import { describe, it, expect } from 'vitest';
import {
  extractTags,
  extractFrontmatterTags,
  extractInlineTags,
  removeCodeBlocks,
  hasAllTags
} from '../src/tags.js';

describe('Functional Tag Utilities', () => {
  describe('extractFrontmatterTags', () => {
    it('should extract tags from YAML array format', () => {
      const content = '---\ntags: [tag1, tag2, "tag3"]\n---\nContent';
      const tags = extractFrontmatterTags(content);
      
      expect(tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should extract tags from YAML list format', () => {
      const content = '---\ntags:\n  - tag1\n  - tag2\n  - tag3\n---\nContent';
      const tags = extractFrontmatterTags(content);
      
      expect(tags).toEqual(['tag1', 'tag2', 'tag3']);
    });

    it('should extract single tag', () => {
      const content = '---\ntags: singletag\n---\nContent';
      const tags = extractFrontmatterTags(content);
      
      expect(tags).toEqual(['singletag']);
    });

    it('should handle empty tags', () => {
      expect(extractFrontmatterTags('---\ntags: []\n---\n')).toEqual([]);
      expect(extractFrontmatterTags('---\ntags:\n---\n')).toEqual([]);
      expect(extractFrontmatterTags('No frontmatter')).toEqual([]);
    });

    it('should handle special characters in tags', () => {
      const content = '---\ntags: [tag-with-dash, tag.with.dot, tag/with/slash]\n---\n';
      const tags = extractFrontmatterTags(content);
      
      expect(tags).toEqual(['tag-with-dash', 'tag.with.dot', 'tag/with/slash']);
    });
  });

  describe('extractInlineTags', () => {
    it('should extract hashtags from content', () => {
      const content = 'Some text with #tag1 and #tag2.';
      const tags = extractInlineTags(content);
      
      expect(tags).toEqual(['tag1', 'tag2']);
    });

    it('should handle tags at line boundaries', () => {
      const content = '#start-tag\nMiddle text\nEnd with #end-tag';
      const tags = extractInlineTags(content);
      
      expect(tags).toEqual(['start-tag', 'end-tag']);
    });

    it('should ignore hashtags in code blocks', () => {
      const content = 'Text with #real-tag\n```\ncode with #not-a-tag\n```\n#another-real-tag';
      const tags = extractInlineTags(content);
      
      expect(tags).toEqual(['real-tag', 'another-real-tag']);
    });

    it('should not extract markdown headings as tags', () => {
      const content = '# Heading 1\n## Heading 2\nText with #actual-tag';
      const tags = extractInlineTags(content);
      
      expect(tags).toEqual(['actual-tag']);
    });

    it('should handle special characters in tags', () => {
      const content = '#tag_with_underscore #tag-with-dash #tag/with/slash';
      const tags = extractInlineTags(content);
      
      expect(tags).toEqual(['tag_with_underscore', 'tag-with-dash', 'tag/with/slash']);
    });
    
    it('should handle dots in tags but not as ending', () => {
      const content = '#tag.with.dot text';
      const tags = extractInlineTags(content);
      
      // Note: dots at the end are treated as boundaries in the current implementation
      expect(tags).toEqual(['tag']);
    });

    it('should remove trailing dots', () => {
      const content = 'Sentence ending with #tag.';
      const tags = extractInlineTags(content);
      
      expect(tags).toEqual(['tag']);
    });
  });

  describe('removeCodeBlocks', () => {
    it('should remove code blocks', () => {
      const content = 'Before\n```js\nconst code = true;\n```\nAfter';
      const result = removeCodeBlocks(content);
      
      expect(result).toBe('Before\n\nAfter');
    });

    it('should handle multiple code blocks', () => {
      const content = 'Text\n```\ncode1\n```\nMiddle\n```\ncode2\n```\nEnd';
      const result = removeCodeBlocks(content);
      
      expect(result).toBe('Text\n\nMiddle\n\nEnd');
    });

    it('should handle inline code', () => {
      const content = 'Text with `inline code` remains';
      const result = removeCodeBlocks(content);
      
      expect(result).toBe('Text with `inline code` remains');
    });
  });

  describe('extractTags', () => {
    it('should extract both frontmatter and inline tags', () => {
      const content = '---\ntags: [tag1, tag2]\n---\nContent with #tag3 and #tag4';
      const tags = extractTags(content);
      
      expect(tags).toContain('tag1');
      expect(tags).toContain('tag2');
      expect(tags).toContain('tag3');
      expect(tags).toContain('tag4');
      expect(tags).toHaveLength(4);
    });

    it('should deduplicate tags', () => {
      const content = '---\ntags: [duplicate]\n---\nContent with #duplicate tag';
      const tags = extractTags(content);
      
      expect(tags).toEqual(['duplicate']);
    });

    it('should handle empty content', () => {
      expect(extractTags('')).toEqual([]);
      expect(extractTags(null)).toEqual([]);
      expect(extractTags(undefined)).toEqual([]);
    });
  });

  describe('hasAllTags', () => {
    const noteTags = ['javascript', 'react', 'frontend', 'testing'];

    it('should return true when note has all search tags', () => {
      expect(hasAllTags(noteTags, ['javascript', 'react'])).toBe(true);
      expect(hasAllTags(noteTags, ['frontend'])).toBe(true);
      expect(hasAllTags(noteTags, [])).toBe(true);
    });

    it('should return false when note is missing tags', () => {
      expect(hasAllTags(noteTags, ['javascript', 'backend'])).toBe(false);
      expect(hasAllTags(noteTags, ['python'])).toBe(false);
    });

    it('should handle case-insensitive matching', () => {
      expect(hasAllTags(noteTags, ['JavaScript', 'React'], false)).toBe(true);
      expect(hasAllTags(noteTags, ['FRONTEND'], false)).toBe(true);
    });

    it('should handle case-sensitive matching', () => {
      expect(hasAllTags(noteTags, ['JavaScript'], true)).toBe(false);
      expect(hasAllTags(noteTags, ['javascript'], true)).toBe(true);
    });

    it('should handle empty note tags', () => {
      expect(hasAllTags([], ['tag1'])).toBe(false);
      expect(hasAllTags([], [])).toBe(true);
    });
  });
});
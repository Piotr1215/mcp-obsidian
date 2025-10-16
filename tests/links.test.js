import { describe, it, expect } from 'vitest';
import { extractWikilinks, isMoc } from '../src/links.js';

describe('Links module', () => {
  describe('extractWikilinks', () => {
    it('should extract simple wikilinks', () => {
      const content = '- [[link1]]\n- [[link2]]\n- [[link3]]';
      const links = extractWikilinks(content);

      expect(links).toHaveLength(3);
      expect(links).toEqual(['link1', 'link2', 'link3']);
    });

    it('should extract links with aliases', () => {
      const content = '[[link|Display Name]]';
      const links = extractWikilinks(content);

      expect(links).toEqual(['link']);
    });

    it('should extract nested path links', () => {
      const content = '[[path/to/note]]';
      const links = extractWikilinks(content);

      expect(links).toEqual(['path/to/note']);
    });

    it('should handle multiple links on same line', () => {
      const content = '[[link1]] and [[link2]]';
      const links = extractWikilinks(content);

      expect(links).toEqual(['link1', 'link2']);
    });

    it('should remove duplicates while preserving order', () => {
      const content = '[[same]]\n[[different]]\n[[same]]';
      const links = extractWikilinks(content);

      expect(links).toEqual(['same', 'different']);
    });

    it('should not match markdown links', () => {
      const content = '[external](https://example.com)';
      const links = extractWikilinks(content);

      expect(links).toHaveLength(0);
    });

    it('should handle empty content', () => {
      expect(extractWikilinks('')).toEqual([]);
      expect(extractWikilinks(null)).toEqual([]);
      expect(extractWikilinks(undefined)).toEqual([]);
    });

    it('should extract from full note with frontmatter', () => {
      const content = `---
tags: [moc, test]
---

# Test MOC

- [[link1]]
- [[link2]]
- [[link3]]`;

      const links = extractWikilinks(content);
      expect(links).toHaveLength(3);
      expect(links).toEqual(['link1', 'link2', 'link3']);
    });
  });

  describe('isMoc', () => {
    it('should return true when moc tag is present', () => {
      expect(isMoc('', ['moc'])).toBe(true);
      expect(isMoc('', ['moc', 'other'])).toBe(true);
      expect(isMoc('', ['other', 'moc'])).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(isMoc('', ['MOC'])).toBe(true);
      expect(isMoc('', ['Moc'])).toBe(true);
    });

    it('should return false when moc tag is not present', () => {
      expect(isMoc('', [])).toBe(false);
      expect(isMoc('', ['other', 'tags'])).toBe(false);
    });

    it('should handle invalid input', () => {
      expect(isMoc('', null)).toBe(false);
      expect(isMoc('', undefined)).toBe(false);
    });
  });
});

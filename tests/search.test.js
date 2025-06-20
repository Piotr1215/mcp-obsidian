import { describe, it, expect } from 'vitest';
import {
  findMatchesInContent,
  transformSearchResults,
  makeRelativePath,
  limitSearchResults
} from '../src/search.js';

describe('Functional Search Utilities', () => {
  describe('findMatchesInContent', () => {
    it('should find matches in content', () => {
      const content = 'Line 1\nThis contains TEST\nLine 3 with test\nAnother line';
      const matches = findMatchesInContent(content, 'test', false);
      
      expect(matches).toHaveLength(2);
      expect(matches[0]).toEqual({
        line: 2,
        content: 'This contains TEST'
      });
      expect(matches[1]).toEqual({
        line: 3,
        content: 'Line 3 with test'
      });
    });

    it('should handle case-sensitive search', () => {
      const content = 'test\nTest\nTEST';
      const matches = findMatchesInContent(content, 'Test', true);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].line).toBe(2);
    });

    it('should return empty array for no matches', () => {
      const matches = findMatchesInContent('No matches here', 'xyz', false);
      expect(matches).toEqual([]);
    });

    it('should handle empty inputs', () => {
      expect(findMatchesInContent('', 'test', false)).toEqual([]);
      expect(findMatchesInContent(null, 'test', false)).toEqual([]);
      
      // Empty query matches all lines
      const matches = findMatchesInContent('content', '', false);
      expect(matches).toHaveLength(1);
      expect(matches[0].content).toBe('content');
    });

    it('should handle multiline queries', () => {
      const content = 'Line 1\nLine 2 contains multiple words\nLine 3';
      const matches = findMatchesInContent(content, 'multiple words', false);
      
      expect(matches).toHaveLength(1);
      expect(matches[0].content).toBe('Line 2 contains multiple words');
    });
  });

  describe('transformSearchResults', () => {
    it('should transform file matches to search results', () => {
      const fileMatches = [
        {
          file: '/base/file1.md',
          matches: [
            { line: 1, content: 'Match 1' },
            { line: 3, content: 'Match 2' }
          ]
        },
        {
          file: '/base/folder/file2.md',
          matches: [
            { line: 5, content: 'Match 3' }
          ]
        }
      ];
      
      const result = transformSearchResults(fileMatches, '/base');
      
      expect(result.totalMatches).toBe(3);
      expect(result.filesSearched).toBe(2);
      expect(result.files).toHaveLength(2);
      expect(result.files[0]).toEqual({
        path: 'file1.md',
        matchCount: 2,
        matches: [
          { line: 1, content: 'Match 1' },
          { line: 3, content: 'Match 2' }
        ]
      });
      expect(result.files[1].path).toBe('folder/file2.md');
    });

    it('should handle empty file matches', () => {
      const result = transformSearchResults([], '/base');
      expect(result).toEqual({ files: [], totalMatches: 0, fileCount: 0, filesSearched: 0 });
    });
  });

  describe('makeRelativePath', () => {
    it('should make paths relative', () => {
      expect(makeRelativePath('/base/folder/file.md', '/base')).toBe('folder/file.md');
      expect(makeRelativePath('/base/file.md', '/base')).toBe('file.md');
      expect(makeRelativePath('/base/a/b/c.md', '/base')).toBe('a/b/c.md');
    });

    it('should handle trailing slashes', () => {
      expect(makeRelativePath('/base/file.md', '/base/')).toBe('file.md');
      expect(makeRelativePath('/base/folder/', '/base')).toBe('folder');
    });

    it('should return original path if not under base', () => {
      expect(makeRelativePath('/other/file.md', '/base')).toBe('/other/file.md');
    });

    it('should handle empty inputs', () => {
      expect(makeRelativePath('', '/base')).toBe('');
      expect(makeRelativePath('/path', '')).toBe('/path');
      expect(makeRelativePath(null, '/base')).toBe('');
    });
  });

  describe('limitSearchResults', () => {
    const createResults = (count) => ({
      files: Array(Math.ceil(count / 5)).fill(null).map((_, i) => ({
        path: `file${i}.md`,
        matchCount: Math.min(5, count - i * 5),
        matches: Array(Math.min(5, count - i * 5)).fill(null).map((_, j) => ({
          line: i * 5 + j + 1,
          content: `Match ${i * 5 + j}`
        }))
      })),
      totalMatches: count,
      fileCount: Math.ceil(count / 5),
      filesSearched: Math.ceil(count / 5)
    });

    it('should not limit results under threshold', () => {
      const results = createResults(5);
      const limited = limitSearchResults(results, 10);
      
      expect(limited).toEqual(results);
      expect(limited.truncated).toBeUndefined();
    });

    it('should limit results over threshold', () => {
      const results = createResults(20);
      const limited = limitSearchResults(results, 10);
      
      expect(limited.totalMatches).toBe(10);
      expect(limited.truncated).toBe(true);
      expect(limited.message).toMatch(/limited to 10/);
    });

    it('should preserve first results when limiting', () => {
      const results = createResults(5);
      const limited = limitSearchResults(results, 3);
      
      expect(limited.files[0].matches[0].content).toBe('Match 0');
      expect(limited.files[0].matches[2].content).toBe('Match 2');
    });
  });
});
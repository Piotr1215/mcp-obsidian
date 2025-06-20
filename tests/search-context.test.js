import { describe, it, expect } from 'vitest';
import { extractContextLines, formatContextResult, highlightMatch } from '../src/search-context.js';

describe('Search Context Functions', () => {
  describe('extractContextLines', () => {
    it('should extract context lines around a match', () => {
      const lines = [
        'Line 1',
        'Line 2',
        'Line 3 with match',
        'Line 4',
        'Line 5'
      ];
      
      const result = extractContextLines(lines, 2, 2);
      
      expect(result).toEqual({
        lines: ['Line 1', 'Line 2', 'Line 3 with match', 'Line 4', 'Line 5'],
        startIndex: 0,
        matchIndex: 2
      });
    });

    it('should handle match at start of file', () => {
      const lines = [
        'Match line',
        'Line 2',
        'Line 3'
      ];
      
      const result = extractContextLines(lines, 0, 2);
      
      expect(result).toEqual({
        lines: ['Match line', 'Line 2', 'Line 3'],
        startIndex: 0,
        matchIndex: 0
      });
    });

    it('should handle match at end of file', () => {
      const lines = [
        'Line 1',
        'Line 2',
        'Match line'
      ];
      
      const result = extractContextLines(lines, 2, 2);
      
      expect(result).toEqual({
        lines: ['Line 1', 'Line 2', 'Match line'],
        startIndex: 0,
        matchIndex: 2
      });
    });

    it('should handle large context size', () => {
      const lines = ['Line 1', 'Line 2', 'Match', 'Line 4', 'Line 5'];
      
      const result = extractContextLines(lines, 2, 10);
      
      expect(result).toEqual({
        lines: ['Line 1', 'Line 2', 'Match', 'Line 4', 'Line 5'],
        startIndex: 0,
        matchIndex: 2
      });
    });

    it('should handle zero context size', () => {
      const lines = ['Line 1', 'Line 2', 'Match', 'Line 4', 'Line 5'];
      
      const result = extractContextLines(lines, 2, 0);
      
      expect(result).toEqual({
        lines: ['Match'],
        startIndex: 2,
        matchIndex: 0
      });
    });
  });

  describe('highlightMatch', () => {
    it('should highlight simple match', () => {
      const result = highlightMatch('This is a test line', 'test');
      expect(result).toBe('This is a **test** line');
    });

    it('should highlight multiple matches', () => {
      const result = highlightMatch('test this test again', 'test');
      expect(result).toBe('**test** this **test** again');
    });

    it('should handle case-insensitive highlighting', () => {
      const result = highlightMatch('This is a TEST line', 'test', false);
      expect(result).toBe('This is a **TEST** line');
    });

    it('should handle case-sensitive highlighting', () => {
      const result = highlightMatch('This is a TEST line', 'test', true);
      expect(result).toBe('This is a TEST line');
    });

    it('should escape special regex characters', () => {
      const result = highlightMatch('Price is $10.99', '$10.99');
      expect(result).toBe('Price is **$10.99**');
    });

    it('should handle no matches', () => {
      const result = highlightMatch('No match here', 'xyz');
      expect(result).toBe('No match here');
    });

    it('should handle empty query', () => {
      const result = highlightMatch('Some text', '');
      expect(result).toBe('Some text');
    });
  });

  describe('formatContextResult', () => {
    it('should format context with line numbers', () => {
      const match = { line: 42, content: 'Matched line' };
      const contextLines = {
        lines: ['Before', 'Matched line', 'After'],
        startIndex: 40,
        matchIndex: 1
      };
      
      const result = formatContextResult(match, contextLines, 'Matched');
      
      expect(result).toEqual({
        line: 42,
        content: 'Matched line',
        context: {
          lines: [
            { number: 41, text: 'Before', isMatch: false },
            { number: 42, text: 'Matched line', isMatch: true },
            { number: 43, text: 'After', isMatch: false }
          ],
          highlighted: '**Matched** line'
        }
      });
    });

    it('should handle single line context', () => {
      const match = { line: 10, content: 'Only match' };
      const contextLines = {
        lines: ['Only match'],
        startIndex: 9,
        matchIndex: 0
      };
      
      const result = formatContextResult(match, contextLines, 'match');
      
      expect(result).toEqual({
        line: 10,
        content: 'Only match',
        context: {
          lines: [
            { number: 10, text: 'Only match', isMatch: true }
          ],
          highlighted: 'Only **match**'
        }
      });
    });

    it('should handle no query for highlighting', () => {
      const match = { line: 5, content: 'Some content' };
      const contextLines = {
        lines: ['Some content'],
        startIndex: 4,
        matchIndex: 0
      };
      
      const result = formatContextResult(match, contextLines, '');
      
      expect(result.context.highlighted).toBe('Some content');
    });

    it('should truncate long lines', () => {
      const longLine = 'x'.repeat(200);
      const match = { line: 1, content: longLine };
      const contextLines = {
        lines: [longLine],
        startIndex: 0,
        matchIndex: 0
      };
      
      const result = formatContextResult(match, contextLines, 'x', { maxLineLength: 100 });
      
      expect(result.context.lines[0].text.length).toBeLessThanOrEqual(103); // 100 + '...'
      expect(result.context.lines[0].text).toMatch(/\.\.\.$/);
    });
  });
});
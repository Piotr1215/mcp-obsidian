import { describe, it, expect } from 'vitest';
import {
  parseSearchQuery,
  tokenizeQuery,
  buildSearchExpression,
  evaluateExpression
} from '../src/search-operators.js';

describe('Search Operators', () => {
  describe('tokenizeQuery', () => {
    it('should tokenize simple terms', () => {
      const tokens = tokenizeQuery('term1 term2');
      expect(tokens).toEqual([
        { type: 'TERM', value: 'term1' },
        { type: 'AND' },
        { type: 'TERM', value: 'term2' }
      ]);
    });

    it('should handle quoted phrases', () => {
      const tokens = tokenizeQuery('"exact phrase" term');
      expect(tokens).toEqual([
        { type: 'TERM', value: 'exact phrase' },
        { type: 'AND' },
        { type: 'TERM', value: 'term' }
      ]);
    });

    it('should recognize AND operator', () => {
      const tokens = tokenizeQuery('term1 AND term2');
      expect(tokens).toEqual([
        { type: 'TERM', value: 'term1' },
        { type: 'AND' },
        { type: 'TERM', value: 'term2' }
      ]);
    });

    it('should recognize OR operator', () => {
      const tokens = tokenizeQuery('term1 OR term2');
      expect(tokens).toEqual([
        { type: 'TERM', value: 'term1' },
        { type: 'OR' },
        { type: 'TERM', value: 'term2' }
      ]);
    });

    it('should recognize NOT operator', () => {
      const tokens = tokenizeQuery('term1 NOT term2');
      expect(tokens).toEqual([
        { type: 'TERM', value: 'term1' },
        { type: 'AND' },
        { type: 'NOT' },
        { type: 'TERM', value: 'term2' }
      ]);
    });

    it('should handle minus as NOT operator', () => {
      const tokens = tokenizeQuery('term1 -term2');
      expect(tokens).toEqual([
        { type: 'TERM', value: 'term1' },
        { type: 'AND' },
        { type: 'NOT' },
        { type: 'TERM', value: 'term2' }
      ]);
    });

    it('should parse field specifiers', () => {
      const tokens = tokenizeQuery('title:readme content:install');
      expect(tokens).toEqual([
        { type: 'FIELD', field: 'title', value: 'readme' },
        { type: 'AND' },
        { type: 'FIELD', field: 'content', value: 'install' }
      ]);
    });

    it('should handle parentheses for grouping', () => {
      const tokens = tokenizeQuery('(term1 OR term2) AND term3');
      expect(tokens).toEqual([
        { type: 'LPAREN' },
        { type: 'TERM', value: 'term1' },
        { type: 'OR' },
        { type: 'TERM', value: 'term2' },
        { type: 'RPAREN' },
        { type: 'AND' },
        { type: 'TERM', value: 'term3' }
      ]);
    });

    it('should handle complex queries', () => {
      const tokens = tokenizeQuery('(term1 OR term2) AND -term3 title:"Project Setup"');
      expect(tokens).toEqual([
        { type: 'LPAREN' },
        { type: 'TERM', value: 'term1' },
        { type: 'OR' },
        { type: 'TERM', value: 'term2' },
        { type: 'RPAREN' },
        { type: 'AND' },
        { type: 'NOT' },
        { type: 'TERM', value: 'term3' },
        { type: 'AND' },
        { type: 'FIELD', field: 'title', value: 'Project Setup' }
      ]);
    });

    it('should handle empty query', () => {
      const tokens = tokenizeQuery('');
      expect(tokens).toEqual([]);
    });

    it('should handle query with only spaces', () => {
      const tokens = tokenizeQuery('   ');
      expect(tokens).toEqual([]);
    });
  });

  describe('buildSearchExpression', () => {
    it('should build expression for simple AND', () => {
      const tokens = [
        { type: 'TERM', value: 'term1' },
        { type: 'AND' },
        { type: 'TERM', value: 'term2' }
      ];
      const expr = buildSearchExpression(tokens);
      expect(expr).toEqual({
        type: 'AND',
        left: { type: 'TERM', value: 'term1' },
        right: { type: 'TERM', value: 'term2' }
      });
    });

    it('should build expression for OR', () => {
      const tokens = [
        { type: 'TERM', value: 'term1' },
        { type: 'OR' },
        { type: 'TERM', value: 'term2' }
      ];
      const expr = buildSearchExpression(tokens);
      expect(expr).toEqual({
        type: 'OR',
        left: { type: 'TERM', value: 'term1' },
        right: { type: 'TERM', value: 'term2' }
      });
    });

    it('should build expression for NOT', () => {
      const tokens = [
        { type: 'NOT' },
        { type: 'TERM', value: 'term1' }
      ];
      const expr = buildSearchExpression(tokens);
      expect(expr).toEqual({
        type: 'NOT',
        operand: { type: 'TERM', value: 'term1' }
      });
    });

    it('should respect operator precedence (NOT > AND > OR)', () => {
      const tokens = [
        { type: 'TERM', value: 'a' },
        { type: 'OR' },
        { type: 'TERM', value: 'b' },
        { type: 'AND' },
        { type: 'NOT' },
        { type: 'TERM', value: 'c' }
      ];
      const expr = buildSearchExpression(tokens);
      expect(expr).toEqual({
        type: 'OR',
        left: { type: 'TERM', value: 'a' },
        right: {
          type: 'AND',
          left: { type: 'TERM', value: 'b' },
          right: {
            type: 'NOT',
            operand: { type: 'TERM', value: 'c' }
          }
        }
      });
    });

    it('should handle parentheses correctly', () => {
      const tokens = [
        { type: 'LPAREN' },
        { type: 'TERM', value: 'a' },
        { type: 'OR' },
        { type: 'TERM', value: 'b' },
        { type: 'RPAREN' },
        { type: 'AND' },
        { type: 'TERM', value: 'c' }
      ];
      const expr = buildSearchExpression(tokens);
      expect(expr).toEqual({
        type: 'AND',
        left: {
          type: 'OR',
          left: { type: 'TERM', value: 'a' },
          right: { type: 'TERM', value: 'b' }
        },
        right: { type: 'TERM', value: 'c' }
      });
    });

    it('should handle field expressions', () => {
      const tokens = [
        { type: 'FIELD', field: 'title', value: 'readme' }
      ];
      const expr = buildSearchExpression(tokens);
      expect(expr).toEqual({
        type: 'FIELD',
        field: 'title',
        value: 'readme'
      });
    });

    it('should handle single term', () => {
      const tokens = [{ type: 'TERM', value: 'term1' }];
      const expr = buildSearchExpression(tokens);
      expect(expr).toEqual({ type: 'TERM', value: 'term1' });
    });

    it('should handle empty tokens', () => {
      const expr = buildSearchExpression([]);
      expect(expr).toBeNull();
    });

    it('should throw on invalid syntax', () => {
      const tokens = [
        { type: 'AND' },
        { type: 'TERM', value: 'term1' }
      ];
      expect(() => buildSearchExpression(tokens)).toThrow();
    });
  });

  describe('evaluateExpression', () => {
    const content = 'This is a test document with some content about README files.';
    const metadata = {
      title: 'Test Document',
      tags: ['test', 'readme']
    };

    it('should evaluate simple term match', () => {
      const expr = { type: 'TERM', value: 'test' };
      expect(evaluateExpression(expr, content, metadata)).toBe(true);
    });

    it('should evaluate term non-match', () => {
      const expr = { type: 'TERM', value: 'missing' };
      expect(evaluateExpression(expr, content, metadata)).toBe(false);
    });

    it('should evaluate AND expression', () => {
      const expr = {
        type: 'AND',
        left: { type: 'TERM', value: 'test' },
        right: { type: 'TERM', value: 'content' }
      };
      expect(evaluateExpression(expr, content, metadata)).toBe(true);
    });

    it('should evaluate OR expression', () => {
      const expr = {
        type: 'OR',
        left: { type: 'TERM', value: 'missing' },
        right: { type: 'TERM', value: 'test' }
      };
      expect(evaluateExpression(expr, content, metadata)).toBe(true);
    });

    it('should evaluate NOT expression', () => {
      const expr = {
        type: 'NOT',
        operand: { type: 'TERM', value: 'missing' }
      };
      expect(evaluateExpression(expr, content, metadata)).toBe(true);
    });

    it('should evaluate field expression for title', () => {
      const expr = { type: 'FIELD', field: 'title', value: 'Test' };
      expect(evaluateExpression(expr, content, metadata)).toBe(true);
    });

    it('should evaluate field expression for content', () => {
      const expr = { type: 'FIELD', field: 'content', value: 'README' };
      expect(evaluateExpression(expr, content, metadata)).toBe(true);
    });

    it('should evaluate field expression for tag', () => {
      const expr = { type: 'FIELD', field: 'tag', value: 'test' };
      expect(evaluateExpression(expr, content, metadata)).toBe(true);
    });

    it('should handle case-insensitive matching', () => {
      const expr = { type: 'TERM', value: 'readme' };
      expect(evaluateExpression(expr, content, metadata)).toBe(true);
    });

    it('should evaluate complex expression', () => {
      const expr = {
        type: 'AND',
        left: {
          type: 'OR',
          left: { type: 'TERM', value: 'test' },
          right: { type: 'TERM', value: 'document' }
        },
        right: {
          type: 'NOT',
          operand: { type: 'TERM', value: 'missing' }
        }
      };
      expect(evaluateExpression(expr, content, metadata)).toBe(true);
    });

    it('should handle null expression', () => {
      expect(evaluateExpression(null, content, metadata)).toBe(true);
    });
  });

  describe('parseSearchQuery (integration)', () => {
    it('should parse and return expression tree', () => {
      const expr = parseSearchQuery('term1 AND term2');
      expect(expr).toEqual({
        type: 'AND',
        left: { type: 'TERM', value: 'term1' },
        right: { type: 'TERM', value: 'term2' }
      });
    });

    it('should handle complex query end-to-end', () => {
      const expr = parseSearchQuery('(readme OR setup) AND -deprecated title:"Getting Started"');
      expect(expr).toBeTruthy();
      expect(expr.type).toBe('AND');
    });

    it('should return null for empty query', () => {
      const expr = parseSearchQuery('');
      expect(expr).toBeNull();
    });
  });
});
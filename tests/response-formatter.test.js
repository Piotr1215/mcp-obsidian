import { describe, it, expect } from 'vitest';
import {
  textResponse,
  structuredResponse,
  errorResponse,
  createMetadata,
  withNextOffset
} from '../src/response-formatter.js';

describe('Response Formatter', () => {
  describe('textResponse', () => {
    it('should create a text response', () => {
      const response = textResponse('Hello, world!');
      
      expect(response).toEqual({
        content: [
          {
            type: 'text',
            text: 'Hello, world!'
          }
        ]
      });
    });

    it('should include metadata when provided', () => {
      const metadata = { executionTime: 100, tool: 'test' };
      const response = textResponse('Hello', metadata);
      
      expect(response._meta).toEqual(metadata);
    });
  });

  describe('structuredResponse', () => {
    it('puts exactly the serialized structuredContent in the text block', () => {
      const data = { count: 5, items: ['a', 'b', 'c'] };
      const response = structuredResponse(data);

      expect(response).toEqual({
        content: [{ type: 'text', text: JSON.stringify(data) }],
        structuredContent: data
      });
    });

    it('includes metadata when provided', () => {
      const metadata = { executionTime: 50, filesSearched: 10 };
      const response = structuredResponse({ key: 'value' }, metadata);

      expect(response._meta).toEqual(metadata);
    });
  });

  describe('withNextOffset', () => {
    it('adds the next page offset when more results remain', () => {
      const result = withNextOffset({ pagination: { total: 9, returned: 3, limit: 3, offset: 3, hasMore: true } });
      expect(result.pagination.nextOffset).toBe(6);
    });

    it('is null on the last page', () => {
      const result = withNextOffset({ pagination: { total: 3, returned: 3, limit: 3, offset: 0, hasMore: false } });
      expect(result.pagination.nextOffset).toBeNull();
    });

    it('leaves a result without pagination alone', () => {
      expect(withNextOffset({ path: 'a.md' })).toEqual({ path: 'a.md' });
    });
  });

  describe('errorResponse', () => {
    it('creates an isError result whose text carries the message and a next step', () => {
      const response = errorResponse(new Error('Something went wrong'));

      expect(response.isError).toBe(true);
      expect(response.content).toHaveLength(1);
      expect(response.content[0].text).toMatch(/^Error: Something went wrong\nNext step: /);
    });
  });

  describe('createMetadata', () => {
    it('should create metadata with execution time', () => {
      const startTime = Date.now() - 100; // 100ms ago
      const metadata = createMetadata(startTime);
      
      expect(metadata.executionTime).toBeGreaterThanOrEqual(100);
      expect(metadata.executionTime).toBeLessThan(200); // Should not take more than 100ms extra
      expect(metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should include additional fields', () => {
      const startTime = Date.now();
      const additional = { tool: 'test-tool', filesSearched: 42 };
      const metadata = createMetadata(startTime, additional);
      
      expect(metadata.tool).toBe('test-tool');
      expect(metadata.filesSearched).toBe(42);
      expect(metadata).toHaveProperty('executionTime');
      expect(metadata).toHaveProperty('timestamp');
    });
  });
});
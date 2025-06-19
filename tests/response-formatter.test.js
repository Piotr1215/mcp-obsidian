import { describe, it, expect } from 'vitest';
import { 
  textResponse, 
  structuredResponse, 
  errorResponse, 
  resourceLink,
  multiContentResponse 
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
  });

  describe('structuredResponse', () => {
    it('should create structured response with description', () => {
      const data = { count: 5, items: ['a', 'b', 'c'] };
      const response = structuredResponse(data, 'Found 5 items');
      
      expect(response).toEqual({
        content: [
          {
            type: 'text',
            text: 'Found 5 items'
          }
        ],
        structuredContent: data
      });
    });

    it('should create structured response without description', () => {
      const data = { key: 'value' };
      const response = structuredResponse(data);
      
      expect(response.content[0].text).toBe(JSON.stringify(data, null, 2));
      expect(response.structuredContent).toEqual(data);
    });
  });

  describe('errorResponse', () => {
    it('should create error response from Error', () => {
      const error = new Error('Something went wrong');
      const response = errorResponse(error);
      
      expect(response).toEqual({
        content: [
          {
            type: 'text',
            text: 'Error: Something went wrong'
          }
        ],
        isError: true
      });
    });
  });

  describe('resourceLink', () => {
    it('should create minimal resource link', () => {
      const link = resourceLink('file:///test.md', 'test.md');
      
      expect(link).toEqual({
        type: 'resource_link',
        uri: 'file:///test.md',
        name: 'test.md'
      });
    });

    it('should create full resource link', () => {
      const link = resourceLink(
        'file:///test.md', 
        'test.md',
        'Test markdown file',
        'text/markdown'
      );
      
      expect(link).toEqual({
        type: 'resource_link',
        uri: 'file:///test.md',
        name: 'test.md',
        description: 'Test markdown file',
        mimeType: 'text/markdown'
      });
    });
  });

  describe('multiContentResponse', () => {
    it('should create response with multiple content items', () => {
      const items = [
        { type: 'text', text: 'Line 1' },
        { type: 'text', text: 'Line 2' }
      ];
      
      const response = multiContentResponse(items);
      
      expect(response).toEqual({
        content: items
      });
    });

    it('should create response with structured content', () => {
      const items = [{ type: 'text', text: 'Summary' }];
      const structured = { data: [1, 2, 3] };
      
      const response = multiContentResponse(items, structured);
      
      expect(response).toEqual({
        content: items,
        structuredContent: structured
      });
    });
  });
});
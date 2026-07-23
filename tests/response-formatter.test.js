import { describe, it, expect } from 'vitest';
import {
  textResponse,
  structuredResponse,
  errorResponse,
  createMetadata,
  stripSearchContext
} from '../src/response-formatter.js';
import { toolDefinitions } from '../src/toolDefinitions.js';

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

    it('should include metadata when provided', () => {
      const data = { key: 'value' };
      const metadata = { executionTime: 50, filesSearched: 10 };
      const response = structuredResponse(data, null, metadata);
      
      expect(response._meta).toEqual(metadata);
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

  describe('stripSearchContext', () => {
    const searchResultsWithContext = {
      files: [
        {
          path: 'note.md',
          matchCount: 1,
          matches: [
            {
              line: 2,
              content: 'a test line',
              context: {
                lines: [
                  { number: 1, text: 'before', isMatch: false },
                  { number: 2, text: 'a test line', isMatch: true },
                  { number: 3, text: 'after', isMatch: false }
                ],
                highlighted: 'a **test** line'
              }
            }
          ]
        }
      ],
      totalMatches: 1,
      fileCount: 1,
      filesSearched: 1,
      pagination: { total: 1, returned: 1, limit: 100, offset: 0, hasMore: false }
    };

    it('should remove context.lines but keep highlighted', () => {
      const stripped = stripSearchContext(searchResultsWithContext);
      const match = stripped.files[0].matches[0];

      expect(match.context).toEqual({ highlighted: 'a **test** line' });
      expect(match.context).not.toHaveProperty('lines');
      expect(match.line).toBe(2);
      expect(match.content).toBe('a test line');
    });

    it('should leave matches without context untouched', () => {
      const results = {
        files: [
          {
            path: 'note.md',
            matchCount: 1,
            matches: [{ line: 1, content: 'plain match' }]
          }
        ],
        totalMatches: 1,
        fileCount: 1,
        filesSearched: 1
      };

      const stripped = stripSearchContext(results);
      expect(stripped.files[0].matches[0]).toEqual({ line: 1, content: 'plain match' });
    });

    it('should return input unchanged when there are no files', () => {
      expect(stripSearchContext(null)).toBeNull();
      expect(stripSearchContext({ totalMatches: 0 })).toEqual({ totalMatches: 0 });
    });

    it('should produce context objects valid against the search-vault outputSchema (regression: includeContext=true)', () => {
      // Regression for: "data/files/0/matches/0/context must have required property 'lines'".
      // stripSearchContext intentionally drops context.lines for token savings,
      // so the schema must not require any property that gets stripped.
      const searchTool = toolDefinitions.find(t => t.name === 'search-vault');
      const contextSchema = searchTool.outputSchema
        .properties.files.items
        .properties.matches.items
        .properties.context;

      const stripped = stripSearchContext(searchResultsWithContext);
      const context = stripped.files[0].matches[0].context;

      for (const requiredProp of contextSchema.required) {
        expect(context, `stripped context is missing required property '${requiredProp}'`)
          .toHaveProperty(requiredProp);
      }
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
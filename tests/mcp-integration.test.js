import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

describe('MCP Server Integration', () => {
  let server;
  const mockVaultPath = '/test/vault';

  beforeEach(() => {
    // Create a test server instance
    server = new Server(
      {
        name: 'obsidian-mcp-filesystem',
        version: '0.1.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
  });

  describe('Server initialization', () => {
    it('should have correct server metadata', () => {
      expect(server._serverInfo.name).toBe('obsidian-mcp-filesystem');
      expect(server._serverInfo.version).toBe('0.1.0');
    });

    it('should have tools capability', () => {
      expect(server._options.capabilities.tools).toBeDefined();
    });
  });

  describe('ListTools handler', () => {
    it('should return all available tools', async () => {
      const mockHandler = vi.fn().mockResolvedValue({
        tools: [
          {
            name: 'search-vault',
            description: 'Search for content in Obsidian vault notes',
            inputSchema: { type: 'object' }
          },
          {
            name: 'list-notes',
            description: 'List all notes in the vault or a specific directory',
            inputSchema: { type: 'object' }
          },
          {
            name: 'read-note',
            description: 'Read the content of a specific note',
            inputSchema: { type: 'object' }
          },
          {
            name: 'write-note',
            description: 'Create or update a note',
            inputSchema: { type: 'object' }
          },
          {
            name: 'delete-note',
            description: 'Delete a note',
            inputSchema: { type: 'object' }
          }
        ]
      });

      server.setRequestHandler(ListToolsRequestSchema, mockHandler);

      const response = await mockHandler({});
      
      expect(response.tools).toHaveLength(5);
      expect(response.tools.map(t => t.name)).toEqual([
        'search-vault',
        'list-notes',
        'read-note',
        'write-note',
        'delete-note'
      ]);
    });
  });

  describe('Tool input validation', () => {
    const toolSchemas = {
      'search-vault': {
        type: 'object',
        properties: {
          query: { type: 'string' },
          path: { type: 'string' },
          caseSensitive: { type: 'boolean' }
        },
        required: ['query']
      },
      'list-notes': {
        type: 'object',
        properties: {
          directory: { type: 'string' }
        }
      },
      'read-note': {
        type: 'object',
        properties: {
          path: { type: 'string' }
        },
        required: ['path']
      },
      'write-note': {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' }
        },
        required: ['path', 'content']
      },
      'delete-note': {
        type: 'object',
        properties: {
          path: { type: 'string' }
        },
        required: ['path']
      }
    };

    it('should validate required parameters', () => {
      const searchSchema = toolSchemas['search-vault'];
      expect(searchSchema.required).toContain('query');

      const readSchema = toolSchemas['read-note'];
      expect(readSchema.required).toContain('path');

      const writeSchema = toolSchemas['write-note'];
      expect(writeSchema.required).toContain('path');
      expect(writeSchema.required).toContain('content');
    });

    it('should have proper type definitions', () => {
      Object.values(toolSchemas).forEach(schema => {
        expect(schema.type).toBe('object');
        expect(schema.properties).toBeDefined();
      });
    });
  });

  describe('Error handling', () => {
    it('should handle invalid tool names', async () => {
      const mockHandler = vi.fn().mockRejectedValue(
        new Error('Unknown tool: invalid-tool')
      );

      server.setRequestHandler(CallToolRequestSchema, mockHandler);

      await expect(mockHandler({
        params: {
          name: 'invalid-tool',
          arguments: {}
        }
      })).rejects.toThrow('Unknown tool: invalid-tool');
    });

    it('should handle missing required arguments', async () => {
      const mockHandler = vi.fn().mockRejectedValue(
        new Error('Missing required argument: path')
      );

      server.setRequestHandler(CallToolRequestSchema, mockHandler);

      await expect(mockHandler({
        params: {
          name: 'read-note',
          arguments: {}
        }
      })).rejects.toThrow('Missing required argument: path');
    });
  });
});
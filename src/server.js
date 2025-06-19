import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { searchVault, listNotes, readNote, writeNote, deleteNote, searchByTags } from './tools.js';
import { toolDefinitions } from './toolDefinitions.js';
import { Errors, MCPError } from './errors.js';
import { textResponse, structuredResponse, errorResponse, createMetadata } from './response-formatter.js';

export function createServer(vaultPath) {
  const server = new Server(
    {
      name: 'obsidian-mcp-filesystem',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {
          // We don't support dynamic tool list changes
          listChanged: false
        },
        // We could add these in the future:
        // resources: {},
        // prompts: {},
        // logging: {},
        // completions: {}
      },
    }
  );

  // Define available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();

    try {
      switch (name) {
      case 'search-vault': {
        const { query, path: searchPath, caseSensitive = false } = args;
        const result = await searchVault(vaultPath, query, searchPath, caseSensitive);
        
        const description = result.count === 0 
          ? `No matches found for "${query}"`
          : `Found ${result.count} matches for "${query}"`;
        
        const metadata = createMetadata(startTime, { 
          tool: 'search-vault',
          filesSearched: result.filesSearched || 0
        });
        
        return structuredResponse(result, description, metadata);
      }

      case 'list-notes': {
        const { directory } = args;
        const result = await listNotes(vaultPath, directory);
        
        const description = result.count === 0
          ? `No notes found${directory ? ` in ${directory}` : ''}`
          : `Found ${result.count} notes${directory ? ` in ${directory}` : ''}`;
        
        const metadata = createMetadata(startTime, { tool: 'list-notes' });
        return structuredResponse(result, description, metadata);
      }

      case 'read-note': {
        const { path: notePath } = args;
        const content = await readNote(vaultPath, notePath);
        
        // For read-note, we return the content directly as text
        const metadata = createMetadata(startTime, { 
          tool: 'read-note',
          contentLength: content.length 
        });
        return textResponse(content, metadata);
      }

      case 'write-note': {
        const { path: notePath, content } = args;
        await writeNote(vaultPath, notePath, content);
        
        const metadata = createMetadata(startTime, { 
          tool: 'write-note',
          contentLength: content.length 
        });
        return textResponse(`Note written successfully to ${notePath}`, metadata);
      }

      case 'delete-note': {
        const { path: notePath } = args;
        await deleteNote(vaultPath, notePath);
        
        const metadata = createMetadata(startTime, { tool: 'delete-note' });
        return textResponse(`Note deleted successfully: ${notePath}`, metadata);
      }

      case 'search-by-tags': {
        const { tags, directory, caseSensitive = false } = args;
        const result = await searchByTags(vaultPath, tags, directory, caseSensitive);
        
        const tagList = tags.join(', ');
        const description = result.count === 0
          ? `No notes found with tags: ${tagList}`
          : `Found ${result.count} notes with tags: ${tagList}`;
        
        const metadata = createMetadata(startTime, { 
          tool: 'search-by-tags',
          tagsSearched: tags.length 
        });
        return structuredResponse(result, description, metadata);
      }

      default:
        throw Errors.toolNotFound(name);
      }
    } catch (error) {
      // If it's already an MCPError, re-throw it
      if (error instanceof MCPError) {
        throw error;
      }
      
      // For tool execution errors, return with isError flag
      return errorResponse(error);
    }
  });

  return server;
}
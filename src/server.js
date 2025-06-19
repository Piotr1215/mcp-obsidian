import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { searchVault, listNotes, readNote, writeNote, deleteNote, searchByTags } from './tools.js';
import { toolDefinitions } from './toolDefinitions.js';

export function createServer(vaultPath) {
  const server = new Server(
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

  // Define available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    switch (name) {
      case 'search-vault': {
        const { query, path: searchPath, caseSensitive = false } = args;
        const result = await searchVault(vaultPath, query, searchPath, caseSensitive);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'list-notes': {
        const { directory } = args;
        const result = await listNotes(vaultPath, directory);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'read-note': {
        const { path: notePath } = args;
        const content = await readNote(vaultPath, notePath);
        
        return {
          content: [
            {
              type: 'text',
              text: content
            }
          ]
        };
      }

      case 'write-note': {
        const { path: notePath, content } = args;
        await writeNote(vaultPath, notePath, content);
        
        return {
          content: [
            {
              type: 'text',
              text: `Note written successfully to ${notePath}`
            }
          ]
        };
      }

      case 'delete-note': {
        const { path: notePath } = args;
        await deleteNote(vaultPath, notePath);
        
        return {
          content: [
            {
              type: 'text',
              text: `Note deleted successfully: ${notePath}`
            }
          ]
        };
      }

      case 'search-by-tags': {
        const { tags, directory, caseSensitive = false } = args;
        const result = await searchByTags(vaultPath, tags, directory, caseSensitive);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  return server;
}
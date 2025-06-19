#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

// Get vault path from command line args
const vaultPath = process.argv[2];
if (!vaultPath) {
  console.error('Usage: node index.js <vault-path>');
  process.exit(1);
}

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'search-vault',
      description: 'Search for content in Obsidian vault notes',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query (supports regex)',
          },
          path: {
            type: 'string',
            description: 'Optional path within vault to search',
          },
          caseSensitive: {
            type: 'boolean',
            description: 'Case sensitive search (default: false)',
          },
        },
        required: ['query'],
      },
    },
    {
      name: 'list-notes',
      description: 'List all notes in the vault or a specific directory',
      inputSchema: {
        type: 'object',
        properties: {
          directory: {
            type: 'string',
            description: 'Directory path relative to vault root (optional)',
          },
        },
      },
    },
    {
      name: 'read-note',
      description: 'Read the content of a specific note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note relative to vault root',
          },
        },
        required: ['path'],
      },
    },
    {
      name: 'write-note',
      description: 'Create or update a note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note relative to vault root',
          },
          content: {
            type: 'string',
            description: 'Content of the note',
          },
        },
        required: ['path', 'content'],
      },
    },
    {
      name: 'delete-note',
      description: 'Delete a note',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Path to the note relative to vault root',
          },
        },
        required: ['path'],
      },
    },
  ],
}));

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'search-vault': {
      const { query, path: searchPath = '', caseSensitive = false } = args;
      const searchDir = path.join(vaultPath, searchPath);
      
      try {
        // Use ripgrep for fast content search
        const flags = caseSensitive ? '' : '-i';
        const cmd = `rg ${flags} "${query.replace(/"/g, '\\"')}" "${searchDir}" --type md -n --no-heading`;
        
        const { stdout, stderr } = await execAsync(cmd);
        
        if (stderr && !stderr.includes('No files were searched')) {
          throw new Error(stderr);
        }
        
        // Parse ripgrep output
        const results = stdout.split('\n')
          .filter(line => line.trim())
          .map(line => {
            const match = line.match(/^(.+?):(\d+):(.*)$/);
            if (match) {
              const [, filePath, lineNumber, content] = match;
              return {
                file: path.relative(vaultPath, filePath),
                line: parseInt(lineNumber),
                content: content.trim(),
              };
            }
            return null;
          })
          .filter(Boolean);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ results, count: results.length }, null, 2),
          }],
        };
      } catch (error) {
        if (error.code === 1) {
          // No matches found
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ results: [], count: 0 }, null, 2),
            }],
          };
        }
        throw error;
      }
    }

    case 'list-notes': {
      const { directory = '' } = args;
      const searchPattern = path.join(vaultPath, directory, '**/*.md');
      
      const files = await glob(searchPattern, { nodir: true });
      const notes = files.map(file => path.relative(vaultPath, file));
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ notes, count: notes.length }, null, 2),
        }],
      };
    }

    case 'read-note': {
      const { path: notePath } = args;
      const fullPath = path.join(vaultPath, notePath);
      
      const content = await readFile(fullPath, 'utf-8');
      
      return {
        content: [{
          type: 'text',
          text: content,
        }],
      };
    }

    case 'write-note': {
      const { path: notePath, content } = args;
      const fullPath = path.join(vaultPath, notePath);
      
      // Create directory if it doesn't exist
      await mkdir(path.dirname(fullPath), { recursive: true });
      
      await writeFile(fullPath, content, 'utf-8');
      
      return {
        content: [{
          type: 'text',
          text: `Note written successfully: ${notePath}`,
        }],
      };
    }

    case 'delete-note': {
      const { path: notePath } = args;
      const fullPath = path.join(vaultPath, notePath);
      
      await unlink(fullPath);
      
      return {
        content: [{
          type: 'text',
          text: `Note deleted successfully: ${notePath}`,
        }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);

console.error(`Obsidian MCP Server running for vault: ${vaultPath}`);
#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

// Get vault path from command line args
const vaultPath = process.argv[2];
if (!vaultPath) {
  console.error('Usage: node index.js <vault-path>');
  process.exit(1);
}

const server = createServer(vaultPath);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);

// console.error(`Obsidian MCP Server running for vault: ${vaultPath}`);
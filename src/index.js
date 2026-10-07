#!/usr/bin/env node

import { homedir } from 'os';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';
import { expandHomePath } from './vault.js';

// Get vault path from command line args
if (!process.argv[2]) {
  console.error('Usage: node index.js <vault-path>');
  process.exit(1);
}
const vaultPath = expandHomePath(process.argv[2], homedir());

const server = createServer(vaultPath);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);

// console.error(`Obsidian MCP Server running for vault: ${vaultPath}`);
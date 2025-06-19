# Obsidian MCP Server

[![Tests](https://github.com/Piotr1215/mcp-obsidian/actions/workflows/test.yml/badge.svg)](https://github.com/Piotr1215/mcp-obsidian/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/Piotr1215/mcp-obsidian/graph/badge.svg)](https://codecov.io/gh/Piotr1215/mcp-obsidian)

A Model Context Protocol (MCP) server for Obsidian that works directly with vault files.

## Why This Server?

Most existing Obsidian MCP servers rely on the Obsidian REST API plugin, which requires:
- Obsidian to be installed
- Obsidian to be running
- The REST API plugin to be configured

This server instead works directly with Obsidian vault files on disk, making it compatible with setups using [obsidian.nvim](https://github.com/obsidian-nvim/obsidian.nvim) - a Neovim plugin that provides Obsidian-like features without requiring the Obsidian app.

## Features

- Direct file system access to Obsidian vaults
- No dependency on running Obsidian instance
- Compatible with obsidian.nvim workflows
- Search, read, write, and manage notes via MCP
- Search notes by tags (supports both frontmatter and inline tags)

## Installation

```bash
npm install
```

## Usage

### Testing with MCP Inspector

```bash
# Replace /home/decoder/dev/obsidian/decoder with your vault path
npx @modelcontextprotocol/inspector node src/index.js /home/decoder/dev/obsidian/decoder
```

The inspector will open at http://localhost:5173

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run tests with coverage and check thresholds
npm run coverage
```

The test suite includes unit tests for all tools and integration tests for the MCP protocol.

### Adding to Claude Desktop

To add this server to Claude Desktop, use the Claude CLI:

```bash
# Clone this repository
git clone https://github.com/Piotr1215/mcp-obsidian.git
cd mcp-obsidian

# Install dependencies
npm install

# Add to Claude (replace /path/to/your/vault with your Obsidian vault path)
claude mcp add obsidian -s user -- node /path/to/mcp-obsidian/src/index.js /path/to/your/vault
```

For example, if you cloned the repo to `~/dev/mcp-obsidian` and your vault is at `~/Documents/ObsidianVault`:

```bash
claude mcp add obsidian -s user -- node ~/dev/mcp-obsidian/src/index.js ~/Documents/ObsidianVault
```

This will add the server to your Claude configuration file (typically `~/.claude.json` or `~/.config/Claude/claude_desktop_config.json`).

To verify the installation:

```bash
claude mcp list
```

You should see `obsidian` in the list of available MCP servers.
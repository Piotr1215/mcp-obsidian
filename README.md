# Obsidian MCP Server

[![Tests](https://github.com/Piotr1215/mcp-obsidian/actions/workflows/test.yml/badge.svg)](https://github.com/Piotr1215/mcp-obsidian/actions/workflows/test.yml)
[![codecov](https://codecov.io/gh/Piotr1215/mcp-obsidian/graph/badge.svg)](https://codecov.io/gh/Piotr1215/mcp-obsidian)
[![MCP Compliant](https://img.shields.io/badge/MCP-Compliant-green)](./MCP_SPEC_COMPLIANCE.md)

MCP server for Obsidian that provides secure, direct file system access to vault files.

## Why This Server?

Most existing Obsidian MCP servers rely on the Obsidian REST API plugin, which requires:
- Obsidian to be installed
- Obsidian to be running
- The REST API plugin to be configured

This server instead works directly with Obsidian vault files on disk, making it compatible with setups using [obsidian.nvim](https://github.com/obsidian-nvim/obsidian.nvim) - a Neovim plugin that provides Obsidian-like features without requiring the Obsidian app.

## Features

- **Direct file system access** to Obsidian vaults - no Obsidian app required
- **Security-first design** with path traversal prevention and input validation
- **High performance** with execution time tracking and resource limits
- **Rich search capabilities** including regex support and tag-based search
- **Metadata support** with frontmatter and inline tag parsing

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

## Available Tools

### search-vault
Search for content across all notes in your vault.
- Supports regular expressions
- Case-sensitive/insensitive search
- Returns line numbers and matched content
- Optional path filtering

### search-by-title
Search for notes by their H1 title (# Title).
- Fast title-based search
- Case-sensitive/insensitive matching
- Returns title, file path, and line number
- Optional path filtering
- Only matches H1 headings (single #)

### list-notes
List all markdown files in your vault or a specific directory.
- Returns file paths and total count
- Supports directory filtering

### read-note
Read the complete content of a specific note.
- Path validation ensures security
- File size limits prevent memory issues

### write-note
Create or update a note with new content.
- Atomic writes for data integrity
- Automatic directory creation
- Content size validation

### delete-note
Delete a note from your vault.
- Safe deletion with proper validation
- Path security checks

### search-by-tags
Find notes containing specific tags.
- Supports both YAML frontmatter and inline #tags
- AND operation for multiple tags
- Case-sensitive/insensitive matching

### get-note-metadata
Get metadata for one or all notes without reading full content.
- Single note mode: Get metadata for a specific note
- Batch mode: Get metadata for all notes in vault
- Extracts frontmatter, title, tags, and content preview
- Lightweight alternative to reading full notes
- Useful for building note indexes or dashboards

## Security Features

This server implements comprehensive security measures:

- **Path Traversal Prevention**: All file paths are validated to prevent access outside the vault
- **Input Validation**: All inputs validated against JSON schemas
- **File Size Limits**: Configurable limits prevent memory exhaustion (default: 10MB)
- **Content Sanitization**: Removes potentially harmful null bytes
- **Markdown-only Access**: Only `.md` files can be accessed

See [MCP_SPEC_COMPLIANCE.md](./MCP_SPEC_COMPLIANCE.md) for detailed compliance information.

## Contributing

1. Ensure all tests pass: `npm test`
2. Maintain test coverage above 90%: `npm run coverage`
3. Follow functional programming principles
4. Add tests for new features
5. Update documentation as needed

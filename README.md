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
- **MCP Resources** for HATEOAS-style discovery and navigation

## Recent Updates

### 🎉 New Features
- **🗺️ MOC Discovery**: New `discover-mocs` tool provides a high-level map of your vault's knowledge structure by discovering Maps of Content and their relationships. **Start here for 10x faster navigation!**
- **Resource Links**: Search results now include MCP resource links for direct note access
- **Context Snippets in Search Results**: Search results now include surrounding lines for better context understanding
- **Match Highlighting**: Search terms are highlighted with **bold** markers in results
- **Improved Search Result Structure**: Results are now grouped by file with match counts and snippets

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

**Features:**
- Boolean operators: AND, OR, NOT (also supports &&, ||, -)
- Field specifiers: `title:term`, `content:term`, `tag:term`
- Quoted phrases: `"exact phrase"`
- Grouping with parentheses: `(term1 OR term2) AND term3`
- Case-sensitive/insensitive search
- **Context snippets**: See surrounding lines for each match
- **Match highlighting**: Search terms are highlighted with **bold**
- **Resource links**: Results include MCP resource links for direct note access
- Returns grouped results by file with match counts
- Optional path filtering

**Context Options:**
- `includeContext` (default: true) - Show surrounding lines
- `contextLines` (default: 2) - Number of lines before/after match (0-10)

**Examples:**
- `readme AND install` - Find notes containing both words
- `title:setup OR tag:documentation` - Find by title or tag
- `"getting started" -deprecated` - Exact phrase, excluding deprecated
- `(python OR javascript) AND tutorial` - Complex queries with grouping

**Example Output with Context:**
```json
{
  "files": [{
    "path": "notes/dotfiles.md",
    "matchCount": 3,
    "matches": [{
      "line": 42,
      "content": "Managing my dotfiles with stow",
      "context": {
        "lines": [
          { "number": 40, "text": "## Configuration Management", "isMatch": false },
          { "number": 41, "text": "", "isMatch": false },
          { "number": 42, "text": "Managing my dotfiles with stow", "isMatch": true },
          { "number": 43, "text": "has simplified my setup process.", "isMatch": false },
          { "number": 44, "text": "", "isMatch": false }
        ],
        "highlighted": "Managing my **dotfiles** with stow"
      }
    }]
  }],
  "totalMatches": 43,
  "fileCount": 15
}
```

### search-by-title
Search for notes by their H1 title (# Title).
- Fast title-based search
- Case-sensitive/insensitive matching
- Returns title, file path, and line number
- **Resource links**: Results include MCP resource links for direct note access
- Optional path filtering
- Only matches H1 headings (single #)

### list-notes
List all markdown files in your vault or a specific directory.
- Returns file paths and total count
- **Resource links**: Results include MCP resource links for direct note access
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
- **Resource links**: Results include MCP resource links for direct note access
- Case-sensitive/insensitive matching

### get-note-metadata
Get metadata for one or all notes without reading full content.
- Single note mode: Get metadata for a specific note
- Batch mode: Get metadata for all notes in vault
- Extracts frontmatter, title, tags, and content preview
- **Resource links**: Results include MCP resource links for direct note access
- Lightweight alternative to reading full notes
- Useful for building note indexes or dashboards

### discover-mocs
**⭐ RECOMMENDED: Start here!** Discover MOCs (Maps of Content) to understand your vault's knowledge structure.

[Maps of Content](https://notes.linkingyourthinking.com/Cards/MOCs+Overview) are organizational hub notes (tagged with `#moc`) that link to related content. They were pioneered by [Nick Milo](https://www.linkingyourthinking.com/) as a flexible alternative to rigid folder structures.

**Features:**
- Lists all MOCs in your vault with their linked notes
- Shows MOC hierarchy (which MOCs link to other MOCs)
- Displays full list of wikilinks from each MOC
- **Provides a high-level map** of your vault's organization
- **10x faster navigation** - understand structure before searching
- Filter by MOC name or directory

**Why use MOCs?**
- **Context**: See what knowledge areas exist in your vault
- **Scale**: Understand how developed each area is
- **Relationships**: Discover how topics connect through MOC hierarchy
- **Entry points**: Find the best starting point for exploration

**Example Output:**
```
Found 10 MOCs

📚 Vault Index (24 linked notes)
   Path: 00-INDEX.md
   Links: Work-MOC, AI-MOC, Development-MOC, DevOps-MOC, Tools-MOC, Personal-MOC, Homelab-MOC, MCP-Framework-MOC
   🔗 Links to MOCs: Work-MOC, AI-MOC, Development-MOC, DevOps-MOC, Tools-MOC, Personal-MOC, Homelab-MOC, MCP-Framework-MOC

📚 AI-MOC (61 linked notes)
   Path: _mocs/AI-MOC.md
   Links: chatgpt, ollama, langchain, aider, gp-nvim, MCP-Framework-MOC, ...
   🔗 Links to MOCs: MCP-Framework-MOC, Development-MOC, DevOps-MOC, Tools-MOC, Work-MOC, 00-INDEX
```

This tool enables agents to understand your knowledge graph structure instantly, making navigation ~10x faster than blind keyword searching.

## MCP Resources

This server implements MCP resource support for HATEOAS-style discovery:

- **Automatic Resource Links**: All search and list tools return resource links
- **Direct Note Access**: Use resource URIs to read notes without searching
- **Resource URI Format**: `obsidian-note://relative/path/to/note.md`
- **Rich Metadata**: Resource links include tags, titles, and match counts

**Example**: When you search for "MCP", results include resource links:
```json
{
  "content": [
    {
      "type": "text",
      "text": "Found 5 matches in 2 files for \"MCP\""
    },
    {
      "type": "resource_link",
      "uri": "obsidian-note://guides/MCP-Guide.md",
      "name": "MCP Implementation Guide",
      "description": "3 matches | Tags: mcp, guide, development"
    }
  ]
}
```

Agents can then directly read the note using the resource URI, enabling seamless navigation through your knowledge base.

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

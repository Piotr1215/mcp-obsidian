# Obsidian MCP Server

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

## Installation

```bash
npm install
```

## Usage

Add to your Claude desktop configuration to enable Obsidian vault access through MCP.
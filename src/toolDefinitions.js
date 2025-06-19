export const toolDefinitions = [
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
];
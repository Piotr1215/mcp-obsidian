export const toolDefinitions = [
  {
    name: 'search-vault',
    title: 'Search Vault',
    description: 'Search for content in Obsidian vault notes',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (supports regex)',
          minLength: 1
        },
        path: {
          type: 'string',
          description: 'Optional path within vault to search',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Case sensitive search (default: false)',
          default: false
        },
      },
      required: ['query'],
      additionalProperties: false
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              file: {
                type: 'string',
                description: 'Path to the file relative to vault root'
              },
              line: {
                type: 'integer',
                description: 'Line number where match was found',
                minimum: 1
              },
              content: {
                type: 'string',
                description: 'Content of the matching line'
              }
            },
            required: ['file', 'line', 'content'],
            additionalProperties: false
          }
        },
        count: {
          type: 'integer',
          description: 'Total number of matches found',
          minimum: 0
        }
      },
      required: ['results', 'count'],
      additionalProperties: false
    }
  },
  {
    name: 'list-notes',
    title: 'List Notes',
    description: 'List all notes in the vault or a specific directory',
    inputSchema: {
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Directory path relative to vault root (optional)',
        },
      },
      additionalProperties: false
    },
    outputSchema: {
      type: 'object',
      properties: {
        notes: {
          type: 'array',
          items: {
            type: 'string',
            description: 'Path to note relative to vault root'
          },
          description: 'List of note paths'
        },
        count: {
          type: 'integer',
          description: 'Total number of notes found',
          minimum: 0
        }
      },
      required: ['notes', 'count'],
      additionalProperties: false
    }
  },
  {
    name: 'read-note',
    title: 'Read Note',
    description: 'Read the content of a specific note',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the note relative to vault root',
          minLength: 1,
          pattern: '\\.md$'
        },
      },
      required: ['path'],
      additionalProperties: false
    },
    // Output is unstructured text content, so no outputSchema
  },
  {
    name: 'write-note',
    title: 'Write Note',
    description: 'Create or update a note',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the note relative to vault root',
          minLength: 1,
          pattern: '\\.md$'
        },
        content: {
          type: 'string',
          description: 'Content of the note',
        },
      },
      required: ['path', 'content'],
      additionalProperties: false
    },
    // Output is just a success message, so no outputSchema
  },
  {
    name: 'delete-note',
    title: 'Delete Note',
    description: 'Delete a note',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to the note relative to vault root',
          minLength: 1,
          pattern: '\\.md$'
        },
      },
      required: ['path'],
      additionalProperties: false
    },
    // Output is just a success message, so no outputSchema
  },
  {
    name: 'search-by-tags',
    title: 'Search by Tags',
    description: 'Search for notes by tags (supports both frontmatter and inline tags)',
    inputSchema: {
      type: 'object',
      properties: {
        tags: {
          type: 'array',
          items: {
            type: 'string',
            minLength: 1
          },
          description: 'Tags to search for (AND operation - notes must have all specified tags)',
          minItems: 1
        },
        directory: {
          type: 'string',
          description: 'Directory path relative to vault root (optional)',
        },
        caseSensitive: {
          type: 'boolean',
          description: 'Case sensitive tag matching (default: false)',
          default: false
        },
      },
      required: ['tags'],
      additionalProperties: false
    },
    outputSchema: {
      type: 'object',
      properties: {
        notes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the note relative to vault root'
              },
              tags: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'All tags found in the note'
              }
            },
            required: ['path', 'tags'],
            additionalProperties: false
          },
          description: 'List of notes matching all specified tags'
        },
        count: {
          type: 'integer',
          description: 'Total number of matching notes',
          minimum: 0
        }
      },
      required: ['notes', 'count'],
      additionalProperties: false
    }
  },
];
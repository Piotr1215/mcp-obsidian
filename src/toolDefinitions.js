export const toolDefinitions = [
  {
    name: 'search-vault',
    title: 'Search Vault',
    description: 'Search for content in Obsidian vault notes. Supports boolean operators (AND, OR, NOT), field specifiers (title:, content:, tag:), quoted phrases, and parentheses for grouping. Examples: "term1 AND term2", "title:readme OR tag:important", "(term1 OR term2) AND -deprecated"',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query. Supports: AND/OR/NOT operators, field specifiers (title:, content:, tag:), quoted phrases, parentheses for grouping',
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
        includeContext: {
          type: 'boolean',
          description: 'Include surrounding lines for context (default: true)',
          default: true
        },
        contextLines: {
          type: 'integer',
          description: 'Number of lines before and after match to include (default: 2)',
          default: 2,
          minimum: 0,
          maximum: 10
        }
      },
      required: ['query'],
      additionalProperties: false
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        files: {
          type: 'array',
          description: 'List of files containing matches',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the file relative to vault root'
              },
              matchCount: {
                type: 'integer',
                description: 'Number of matches in this file',
                minimum: 1
              },
              matches: {
                type: 'array',
                description: 'List of matches in this file',
                items: {
                  type: 'object',
                  properties: {
                    line: {
                      type: 'integer',
                      description: 'Line number where match was found',
                      minimum: 1
                    },
                    content: {
                      type: 'string',
                      description: 'Content of the matching line'
                    },
                    context: {
                      type: 'object',
                      description: 'Context information if includeContext is true',
                      properties: {
                        lines: {
                          type: 'array',
                          description: 'Surrounding lines with line numbers',
                          items: {
                            type: 'object',
                            properties: {
                              number: {
                                type: 'integer',
                                description: 'Line number',
                                minimum: 1
                              },
                              text: {
                                type: 'string',
                                description: 'Line content'
                              },
                              isMatch: {
                                type: 'boolean',
                                description: 'Whether this is the matching line'
                              }
                            },
                            required: ['number', 'text', 'isMatch']
                          }
                        },
                        highlighted: {
                          type: 'string',
                          description: 'Matching line with search terms highlighted using **'
                        }
                      },
                      required: ['lines', 'highlighted']
                    }
                  },
                  required: ['line', 'content']
                }
              }
            },
            required: ['path', 'matchCount', 'matches']
          }
        },
        totalMatches: {
          type: 'integer',
          description: 'Total number of matches across all files',
          minimum: 0
        },
        fileCount: {
          type: 'integer',
          description: 'Number of files containing matches',
          minimum: 0
        },
        filesSearched: {
          type: 'integer',
          description: 'Total number of files searched',
          minimum: 0
        }
      },
      required: ['files', 'totalMatches', 'fileCount', 'filesSearched'],
      additionalProperties: false
    }
  },
  {
    name: 'search-by-title',
    title: 'Search by Title',
    description: 'Search for notes by their H1 title',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Title search query',
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
      $schema: 'http://json-schema.org/draft-07/schema#',
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
              title: {
                type: 'string',
                description: 'The H1 title of the note'
              },
              line: {
                type: 'integer',
                description: 'Line number where title was found',
                minimum: 1
              }
            },
            required: ['file', 'title', 'line'],
            additionalProperties: false
          }
        },
        count: {
          type: 'integer',
          description: 'Number of results found',
          minimum: 0
        },
        filesSearched: {
          type: 'integer',
          description: 'Number of files searched',
          minimum: 0
        }
      },
      required: ['results', 'count', 'filesSearched'],
      additionalProperties: false
    }
  },
  {
    name: 'list-notes',
    title: 'List Notes',
    description: 'List all notes in the vault or a specific directory',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
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
      $schema: 'http://json-schema.org/draft-07/schema#',
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
      $schema: 'http://json-schema.org/draft-07/schema#',
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
      $schema: 'http://json-schema.org/draft-07/schema#',
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
      $schema: 'http://json-schema.org/draft-07/schema#',
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
      $schema: 'http://json-schema.org/draft-07/schema#',
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
      $schema: 'http://json-schema.org/draft-07/schema#',
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
  {
    name: 'get-note-metadata',
    title: 'Get Note Metadata',
    description: 'Get metadata for a specific note or all notes in the vault',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Path to a specific note (for single note mode)',
        },
        batch: {
          type: 'boolean',
          description: 'Enable batch mode to get metadata for all notes',
          default: false
        },
        directory: {
          type: 'string',
          description: 'In batch mode, limit to specific directory',
        },
      },
      additionalProperties: false
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      oneOf: [
        {
          // Single note response
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the note'
            },
            frontmatter: {
              type: 'object',
              description: 'Parsed frontmatter metadata'
            },
            title: {
              type: ['string', 'null'],
              description: 'H1 title from content'
            },
            titleLine: {
              type: ['integer', 'null'],
              description: 'Line number of title'
            },
            hasContent: {
              type: 'boolean',
              description: 'Whether note has content'
            },
            contentLength: {
              type: 'integer',
              description: 'Total content length'
            },
            contentPreview: {
              type: 'string',
              description: 'Preview of content'
            },
            inlineTags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Inline tags found in content'
            }
          },
          required: ['path', 'frontmatter', 'hasContent', 'contentLength', 'contentPreview', 'inlineTags'],
          additionalProperties: false
        },
        {
          // Batch mode response
          type: 'object',
          properties: {
            notes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  frontmatter: { type: 'object' },
                  title: { type: ['string', 'null'] },
                  titleLine: { type: ['integer', 'null'] },
                  hasContent: { type: 'boolean' },
                  contentLength: { type: 'integer' },
                  contentPreview: { type: 'string' },
                  inlineTags: { type: 'array', items: { type: 'string' } }
                }
              }
            },
            count: {
              type: 'integer',
              description: 'Number of notes processed'
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  file: { type: 'string' },
                  error: { type: 'string' }
                }
              }
            }
          },
          required: ['notes', 'count', 'errors'],
          additionalProperties: false
        }
      ]
    }
  },
];
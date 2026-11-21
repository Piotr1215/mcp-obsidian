/**
 * delete-note describes itself differently depending on what the connected
 * client can do. The confirmation is an optional feature, negotiated at
 * connect: a client that cannot be asked never loads it, and must not be told
 * a prompt is coming. A tool description is a prompt to the model, so an
 * unconditional "the user is asked to confirm first" is not a harmless
 * inaccuracy, it invites the model to treat a delete as reviewed when nobody
 * reviewed it.
 */
export const DELETE_NOTE_DESCRIPTION = {
  plain: 'Delete a note permanently. There is no trash, so this cannot be undone.',
  confirming: 'Delete a note permanently. The user is asked to confirm first, and may refuse, in which case the note is kept and the tool says so. Read the result rather than assuming the deletion happened.',
};

/**
 * Sent once at initialize. Hosts cut instructions at a few thousand characters
 * and Codex reads the first 512 closely, so the order carries the weight.
 * delete-note's confirmation is described as it behaves: it is asked only of a
 * client that advertised elicitation, and kept on any failure to get an answer.
 */
export const SERVER_INSTRUCTIONS = 'Reads and edits markdown notes in one Obsidian vault on disk. Paths are vault-relative, such as "Projects/Plan.md". Search with search-vault, search-by-title or search-by-tags, then read-note. Results are paged: pass nextOffset. read-note cuts long notes and says where to continue. New notes use write-note, which never replaces a note. Changes use edit-note (exact text) or append-note. delete-note is permanent: it asks the user to confirm through elicitation and keeps the note if the user declines or cannot be reached.';

const READ_ONLY = { readOnlyHint: true, openWorldHint: false };

const pagination = (what) => ({
  type: 'object',
  description: 'Pagination metadata. Pass nextOffset as offset to get the next page',
  properties: {
    total: { type: 'integer', description: `Total number of ${what} across all pages`, minimum: 0 },
    returned: { type: 'integer', description: `Number of ${what} returned in this response`, minimum: 0 },
    limit: { type: 'integer', description: 'Limit parameter used', minimum: 1 },
    offset: { type: 'integer', description: 'Offset parameter used', minimum: 0 },
    hasMore: { type: 'boolean', description: `Whether there are more ${what} available` },
    nextOffset: { type: ['integer', 'null'], description: 'Offset of the next page, null on the last page', minimum: 0 }
  },
  required: ['total', 'returned', 'limit', 'offset', 'hasMore', 'nextOffset']
});

export const toolDefinitions = [
  {
    name: 'search-vault',
    title: 'Search Vault',
    annotations: { ...READ_ONLY },
    description: 'Search for content in Obsidian vault notes. CRITICAL: Multiple space-separated terms default to AND (all required). Use OR for better results: "git OR repository OR backup" finds notes with ANY term. Search progressively: start broad (single key term), then narrow down. Don\'t give up after one try! Supports: boolean operators (AND, OR, NOT), field specifiers (title:, content:, tag:), quoted phrases, parentheses. Examples: "kubernetes OR k8s" (broad), "git OR mirror OR backup" (any match), "title:readme OR tag:important", "(docker OR podman) AND deployment"',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query. IMPORTANT: Space-separated terms are AND by default (all required). Use OR for broader results: "git OR backup OR mirror". Start with single terms or OR queries, then narrow down. Supports: AND/OR/NOT operators, field specifiers (title:, content:, tag:), quoted phrases, parentheses for grouping',
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
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of matches to return (default: 100)',
          default: 100,
          minimum: 1,
          maximum: 500
        },
        offset: {
          type: 'integer',
          description: 'Number of matches to skip for pagination (default: 0)',
          default: 0,
          minimum: 0
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
                      description: 'Present when includeContext is true. The server drops the surrounding lines to save tokens; read-note returns the full note',
                      properties: {
                        highlighted: {
                          type: 'string',
                          description: 'Matching line with search terms highlighted using **'
                        }
                      },
                      required: ['highlighted']
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
        },
        pagination: {
          type: 'object',
          description: 'Pagination metadata for iterating through results',
          properties: {
            total: {
              type: 'integer',
              description: 'Total number of matches across all pages',
              minimum: 0
            },
            returned: {
              type: 'integer',
              description: 'Number of matches returned in this response',
              minimum: 0
            },
            limit: {
              type: 'integer',
              description: 'Limit parameter used for this request',
              minimum: 1
            },
            offset: {
              type: 'integer',
              description: 'Offset parameter used for this request',
              minimum: 0
            },
            hasMore: {
              type: 'boolean',
              description: 'Whether there are more results available'
            },
            nextOffset: {
              type: ['integer', 'null'],
              description: 'Offset of the next page, null on the last page',
              minimum: 0
            }
          },
          required: ['total', 'returned', 'limit', 'offset', 'hasMore', 'nextOffset']
        }
      },
      required: ['files', 'totalMatches', 'fileCount', 'filesSearched', 'pagination'],
      additionalProperties: false
    }
  },
  {
    name: 'search-by-title',
    title: 'Search by Title',
    annotations: { ...READ_ONLY },
    description: 'Search for notes by title: the first H1, else a title property (YAML or Logseq title::), else the file name',
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
        limit: {
          type: 'integer',
          description: 'Maximum number of results to return (default: 100)',
          default: 100,
          minimum: 1,
          maximum: 1000
        },
        offset: {
          type: 'integer',
          description: 'Number of results to skip for pagination (default: 0)',
          default: 0,
          minimum: 0
        }
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
                description: 'The note title: H1, title property, or file name'
              },
              line: {
                type: ['integer', 'null'],
                description: 'Line number where title was found, null when it came from the file name',
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
        },
        pagination: {
          type: 'object',
          description: 'Pagination metadata',
          properties: {
            total: {
              type: 'integer',
              description: 'Total number of results across all pages',
              minimum: 0
            },
            returned: {
              type: 'integer',
              description: 'Number of results returned in this response',
              minimum: 0
            },
            limit: {
              type: 'integer',
              description: 'Limit parameter used',
              minimum: 1
            },
            offset: {
              type: 'integer',
              description: 'Offset parameter used',
              minimum: 0
            },
            hasMore: {
              type: 'boolean',
              description: 'Whether there are more results available'
            },
            nextOffset: {
              type: ['integer', 'null'],
              description: 'Offset of the next page, null on the last page',
              minimum: 0
            }
          },
          required: ['total', 'returned', 'limit', 'offset', 'hasMore', 'nextOffset']
        }
      },
      required: ['results', 'count', 'filesSearched', 'pagination'],
      additionalProperties: false
    }
  },
  {
    name: 'list-notes',
    title: 'List Notes',
    annotations: { ...READ_ONLY },
    description: 'List all notes in the vault or a specific directory',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        directory: {
          type: 'string',
          description: 'Directory path relative to vault root (optional)',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of notes to return (default: 100)',
          default: 100,
          minimum: 1,
          maximum: 1000
        },
        offset: {
          type: 'integer',
          description: 'Number of notes to skip for pagination (default: 0)',
          default: 0,
          minimum: 0
        }
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
        },
        pagination: {
          type: 'object',
          description: 'Pagination metadata',
          properties: {
            total: {
              type: 'integer',
              description: 'Total number of notes across all pages',
              minimum: 0
            },
            returned: {
              type: 'integer',
              description: 'Number of notes returned in this response',
              minimum: 0
            },
            limit: {
              type: 'integer',
              description: 'Limit parameter used',
              minimum: 1
            },
            offset: {
              type: 'integer',
              description: 'Offset parameter used',
              minimum: 0
            },
            hasMore: {
              type: 'boolean',
              description: 'Whether there are more notes available'
            },
            nextOffset: {
              type: ['integer', 'null'],
              description: 'Offset of the next page, null on the last page',
              minimum: 0
            }
          },
          required: ['total', 'returned', 'limit', 'offset', 'hasMore', 'nextOffset']
        }
      },
      required: ['notes', 'count', 'pagination'],
      additionalProperties: false
    }
  },
  {
    name: 'read-note',
    title: 'Read Note',
    annotations: { ...READ_ONLY },
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
        offset: {
          type: 'integer',
          description: 'Character offset to start reading from (default: 0). Long notes are cut at about 40,000 characters; continue with the nextOffset the response gives',
          default: 0,
          minimum: 0
        },
      },
      required: ['path'],
      additionalProperties: false
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path as requested' },
        content: { type: 'string', description: 'The note text from offset, up to the size cap' },
        offset: { type: 'integer', description: 'Character offset this content starts at', minimum: 0 },
        returned: { type: 'integer', description: 'Number of characters in content', minimum: 0 },
        total: { type: 'integer', description: 'Total characters in the note', minimum: 0 },
        truncated: { type: 'boolean', description: 'True when the note continues past this content' },
        nextOffset: { type: ['integer', 'null'], description: 'Offset to pass to read the rest, null when nothing remains', minimum: 0 },
        notice: { type: 'string', description: 'Present when truncated: how to read the rest' }
      },
      required: ['path', 'content', 'offset', 'returned', 'total', 'truncated', 'nextOffset'],
      additionalProperties: false
    }
  },
  {
    name: 'write-note',
    title: 'Write Note',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: 'Create a new note. Fails if the note already exists and leaves it untouched, so it never replaces text you may not have seen (read-note shows long notes in pages). To change an existing note use edit-note or append-note.',
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
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path created' },
        written: { type: 'boolean' },
        contentLength: { type: 'integer', minimum: 0, description: 'Characters in the content sent' }
      },
      required: ['path', 'written', 'contentLength'],
      additionalProperties: false
    }
  },
  {
    name: 'edit-note',
    title: 'Edit Note',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    description: 'Replace one exact piece of text in an existing note and leave the rest untouched. oldText must occur exactly once: copy it from read-note, whitespace and line breaks included, and add surrounding text if it matches more than once. Use write-note for a new note and append-note to add text without quoting any.',
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
        oldText: {
          type: 'string',
          description: 'Exact text to replace, copied from read-note. Must occur exactly once in the note.',
          minLength: 1
        },
        newText: {
          type: 'string',
          description: 'Text that replaces oldText. May be empty to delete oldText.'
        },
      },
      required: ['path', 'oldText', 'newText'],
      additionalProperties: false
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path edited' },
        previousLength: { type: 'integer', minimum: 0, description: 'Characters in the note before the edit' },
        newLength: { type: 'integer', minimum: 0, description: 'Characters in the note after the edit' }
      },
      required: ['path', 'previousLength', 'newLength'],
      additionalProperties: false
    }
  },
  {
    name: 'delete-note',
    title: 'Delete Note',
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    description: DELETE_NOTE_DESCRIPTION.plain,
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
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path of the note' },
        deleted: { type: 'boolean', description: 'False when the note was kept' },
        reason: { type: 'string', description: 'Why the note was kept, when deleted is false' }
      },
      required: ['path', 'deleted'],
      additionalProperties: false
    }
  },
  {
    name: 'append-note',
    title: 'Append to Note',
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    description: 'Append content to an existing note or create a new note. Existing content is preserved; the new content goes at the end or under a specific heading.',
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
          description: 'Content to append to the note',
        },
        section: {
          type: 'string',
          description: 'Optional heading name to append content under. Content will be inserted after this heading but before the next heading of same or higher level.',
        },
        ensureNewline: {
          type: 'boolean',
          description: 'Ensure content starts on a new line (default: true)',
          default: true
        },
      },
      required: ['path', 'content'],
      additionalProperties: false
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path appended to' },
        appended: { type: 'boolean' },
        section: { type: ['string', 'null'], description: 'Heading the content went under, null for the end of the note' },
        contentLength: { type: 'integer', minimum: 0, description: 'Characters in the content sent' }
      },
      required: ['path', 'appended', 'section', 'contentLength'],
      additionalProperties: false
    }
  },
  {
    name: 'search-by-tags',
    title: 'Search by Tags',
    annotations: { ...READ_ONLY },
    description: 'Search for notes by tags (supports frontmatter, Logseq tags:: properties, inline #tags and #[[multi word]] tags)',
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
        limit: {
          type: 'integer',
          description: 'Maximum number of notes to return (default: 100)',
          default: 100,
          minimum: 1,
          maximum: 500
        },
        offset: {
          type: 'integer',
          description: 'Number of notes to skip for pagination (default: 0)',
          default: 0,
          minimum: 0
        }
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
          description: 'Number of notes in this page',
          minimum: 0
        },
        pagination: pagination('notes')
      },
      required: ['notes', 'count', 'pagination'],
      additionalProperties: false
    }
  },
  {
    name: 'get-note-metadata',
    title: 'Get Note Metadata',
    annotations: { ...READ_ONLY },
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
        limit: {
          type: 'integer',
          description: 'Maximum number of notes to return in batch mode (default: 50)',
          default: 50,
          minimum: 1,
          maximum: 500
        },
        offset: {
          type: 'integer',
          description: 'Number of notes to skip for pagination in batch mode (default: 0)',
          default: 0,
          minimum: 0
        }
      },
      additionalProperties: false
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        // For single note mode
        path: {
          type: 'string',
          description: 'Path to the note'
        },
        frontmatter: {
          type: 'object',
          description: 'Parsed frontmatter metadata, or Logseq page properties (key:: value)'
        },
        title: {
          type: ['string', 'null'],
          description: 'Note title: H1, title property, or file name'
        },
        titleLine: {
          type: ['integer', 'null'],
          description: 'Line number of title, null when it came from the file name'
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
        },
        // For batch mode
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
        },
        pagination: {
          type: 'object',
          description: 'Pagination metadata for batch mode',
          properties: {
            total: {
              type: 'integer',
              description: 'Total number of notes across all pages',
              minimum: 0
            },
            returned: {
              type: 'integer',
              description: 'Number of notes returned in this response',
              minimum: 0
            },
            limit: {
              type: 'integer',
              description: 'Limit parameter used',
              minimum: 1
            },
            offset: {
              type: 'integer',
              description: 'Offset parameter used',
              minimum: 0
            },
            hasMore: {
              type: 'boolean',
              description: 'Whether there are more notes available'
            },
            nextOffset: {
              type: ['integer', 'null'],
              description: 'Offset of the next page, null on the last page',
              minimum: 0
            }
          },
          required: ['total', 'returned', 'limit', 'offset', 'hasMore', 'nextOffset']
        }
      },
      additionalProperties: false
    }
  },
  {
    name: 'discover-mocs',
    title: 'Discover MOCs',
    annotations: { ...READ_ONLY },
    description: 'RECOMMENDED: Start here to explore the vault! Discover MOCs (Maps of Content) - organizational hub notes tagged with #moc that link to related content. MOCs provide a high-level map of the vault\'s knowledge structure. Use this tool first to understand how notes are organized, then drill down into specific areas of interest.',
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        mocName: {
          type: 'string',
          description: 'Filter by specific MOC name (optional)',
        },
        directory: {
          type: 'string',
          description: 'Limit search to specific directory (optional)',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of MOCs to return (default: 50)',
          default: 50,
          minimum: 1,
          maximum: 200
        },
        offset: {
          type: 'integer',
          description: 'Number of MOCs to skip for pagination (default: 0)',
          default: 0,
          minimum: 0
        }
      },
      additionalProperties: false
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        mocs: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              path: {
                type: 'string',
                description: 'Path to the MOC relative to vault root'
              },
              title: {
                type: 'string',
                description: 'Title of the MOC: H1, title property, or file name'
              },
              tags: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'All tags found in the MOC'
              },
              linkedNotes: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Array of note names linked from this MOC (wikilinks)'
              },
              linkCount: {
                type: 'integer',
                description: 'Number of linked notes',
                minimum: 0
              },
              linkedMocs: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Array of linked notes that are themselves MOCs (subset of linkedNotes)'
              }
            },
            required: ['path', 'title', 'tags', 'linkedNotes', 'linkCount', 'linkedMocs'],
            additionalProperties: false
          },
          description: 'List of discovered MOCs with their linked notes'
        },
        count: {
          type: 'integer',
          description: 'Number of MOCs in this page',
          minimum: 0
        },
        pagination: pagination('MOCs')
      },
      required: ['mocs', 'count', 'pagination'],
      additionalProperties: false
    }
  },
];
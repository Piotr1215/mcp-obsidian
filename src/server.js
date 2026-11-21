import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { searchVault, searchByTitle, listNotes, readNote, writeNote, editNote, appendNote, deleteNote, searchByTags, getNoteMetadata, discoverMocs } from './tools.js';
import { toolDefinitions, DELETE_NOTE_DESCRIPTION, SERVER_INSTRUCTIONS } from './toolDefinitions.js';
import { normalizeArguments } from './arguments.js';
import { windowNote } from './read-window.js';
import { Errors, MCPError } from './errors.js';
import { createDeleteConfirmer } from './confirm.js';
import { structuredResponse, errorResponse, createMetadata, stripSearchContext, withNextOffset } from './response-formatter.js';

export function createServer(vaultPath) {
  const server = new Server(
    {
      name: 'obsidian-mcp-filesystem',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {
          listChanged: false
        },
      },
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  // Optional features are negotiated once, when the client connects, rather
  // than re-derived on every call. A client that does not advertise elicitation
  // never loads the confirmation feature at all, and delete-note then behaves
  // exactly as it did before the feature existed: a normal delete, nothing
  // asked. Resolving it here rather than per-call is what makes it a property
  // of the session instead of a coincidence repeated on each request.
  const features = { confirmDelete: null };

  server.oninitialized = () => {
    features.confirmDelete = createDeleteConfirmer(server, {
      // Unload on proof, not on suspicion: the client advertised the
      // capability and then answered without a human. Later calls take the
      // plain path instead of re-asking a client that will never show it.
      onUnsupported: () => { features.confirmDelete = null; },
    });
  };

  // Define available tools. delete-note advertises the confirmation only when
  // it was actually loaded, so the model is never told to expect a prompt this
  // client cannot show.
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions.map(tool =>
      tool.name === 'delete-note'
        ? { ...tool, description: features.confirmDelete
            ? DELETE_NOTE_DESCRIPTION.confirming
            : DELETE_NOTE_DESCRIPTION.plain }
        : tool),
  }));

  // Handle tool calls. An unknown tool is a protocol error and is thrown. Every
  // other failure, bad argument values included, is an execution error the
  // model can read and act on, so it goes back as an isError result.
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: rawArgs } = request.params;
    const startTime = Date.now();

    const definition = toolDefinitions.find(tool => tool.name === name);
    if (!definition) {
      throw Errors.toolNotFound(name);
    }

    try {
      const checked = normalizeArguments(definition.inputSchema, rawArgs);
      if (checked.error) {
        throw Errors.invalidParams(checked.error);
      }
      const args = checked.args;

      switch (name) {
      case 'search-vault': {
        const { query, path: searchPath, caseSensitive = false, includeContext = true, contextLines = 2, limit = 100, offset = 0 } = args;
        const contextOptions = { includeContext, contextLines };
        const result = await searchVault(vaultPath, query, searchPath, caseSensitive, contextOptions, limit, offset);

        const metadata = createMetadata(startTime, {
          tool: 'search-vault',
          filesSearched: result.filesSearched || 0
        });

        return structuredResponse(withNextOffset(stripSearchContext(result)), metadata);
      }

      case 'search-by-title': {
        const { query, path: searchPath, caseSensitive = false, limit = 100, offset = 0 } = args;
        const result = await searchByTitle(vaultPath, query, searchPath, caseSensitive, limit, offset);

        const metadata = createMetadata(startTime, {
          tool: 'search-by-title',
          filesSearched: result.filesSearched || 0
        });

        return structuredResponse(withNextOffset(result), metadata);
      }

      case 'list-notes': {
        const { directory, limit = 100, offset = 0 } = args;
        const result = await listNotes(vaultPath, directory, limit, offset);

        return structuredResponse(withNextOffset(result), createMetadata(startTime, { tool: 'list-notes' }));
      }

      case 'read-note': {
        const { path: notePath, offset = 0 } = args;
        const content = await readNote(vaultPath, notePath);
        const result = windowNote(notePath, content, offset);

        const metadata = createMetadata(startTime, {
          tool: 'read-note',
          contentLength: content.length
        });
        return structuredResponse(result, metadata);
      }

      case 'write-note': {
        const { path: notePath, content } = args;
        await writeNote(vaultPath, notePath, content);

        const metadata = createMetadata(startTime, {
          tool: 'write-note',
          contentLength: content.length
        });
        return structuredResponse({ path: notePath, written: true, contentLength: content.length }, metadata);
      }

      case 'edit-note': {
        const { path: notePath, oldText, newText } = args;
        const result = await editNote(vaultPath, notePath, oldText, newText);

        const metadata = createMetadata(startTime, { tool: 'edit-note' });
        return structuredResponse(result, metadata);
      }

      case 'delete-note': {
        const { path: notePath } = args;
        const outcome = await deleteNote(vaultPath, notePath, {
          confirm: features.confirmDelete,
        });

        const metadata = createMetadata(startTime, {
          tool: 'delete-note',
          deleted: outcome.deleted
        });
        // A refusal is a failure to do what was asked, not a success: the note
        // is still there. Flag it so the model cannot read a kept note as a
        // deleted one.
        if (outcome.deleted) {
          return structuredResponse({ path: notePath, deleted: true }, metadata);
        }
        return {
          ...structuredResponse({ path: notePath, deleted: false, reason: outcome.reason }, metadata),
          isError: true,
        };
      }

      case 'append-note': {
        const { path: notePath, content, section, ensureNewline = true } = args;
        await appendNote(vaultPath, notePath, content, { section, ensureNewline });

        const metadata = createMetadata(startTime, {
          tool: 'append-note',
          contentLength: content.length,
          hasSection: !!section
        });
        return structuredResponse({
          path: notePath,
          appended: true,
          section: section ?? null,
          contentLength: content.length
        }, metadata);
      }

      case 'search-by-tags': {
        const { tags, directory, caseSensitive = false, limit = 100, offset = 0 } = args;
        const result = await searchByTags(vaultPath, tags, directory, caseSensitive, limit, offset);

        const metadata = createMetadata(startTime, {
          tool: 'search-by-tags',
          tagsSearched: tags.length
        });

        return structuredResponse(withNextOffset(result), metadata);
      }

      case 'get-note-metadata': {
        const { path: notePath, batch = false, directory, limit = 50, offset = 0 } = args;

        const pathArg = batch && directory ? directory : notePath;
        const result = await getNoteMetadata(vaultPath, pathArg, { batch, limit, offset });

        const metadata = createMetadata(startTime, {
          tool: 'get-note-metadata',
          mode: batch ? 'batch' : 'single'
        });

        return structuredResponse(withNextOffset(result), metadata);
      }

      case 'discover-mocs': {
        const { mocName, directory, limit = 50, offset = 0 } = args;
        const result = await discoverMocs(vaultPath, { mocName, directory, limit, offset });

        const metadata = createMetadata(startTime, {
          tool: 'discover-mocs',
          mocsFound: result.count,
          totalLinkedNotes: result.mocs.reduce((sum, moc) => sum + moc.linkCount, 0)
        });

        return structuredResponse(withNextOffset(result), metadata);
      }

      default:
        throw Errors.toolNotFound(name);
      }
    } catch (error) {
      if (error instanceof MCPError && error.message.startsWith('Unknown tool')) {
        throw error;
      }
      return errorResponse(error);
    }
  });

  return server;
}

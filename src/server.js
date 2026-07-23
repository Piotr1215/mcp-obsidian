import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { searchVault, searchByTitle, listNotes, readNote, writeNote, deleteNote, searchByTags, getNoteMetadata, discoverMocs, getBacklinks, findBrokenLinks, findOrphans, getGraphNeighborhood } from './tools.js';
import { toolDefinitions } from './toolDefinitions.js';
import { Errors, MCPError } from './errors.js';
import { textResponse, structuredResponse, errorResponse, createMetadata, stripSearchContext } from './response-formatter.js';

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
    }
  );

  // Define available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolDefinitions,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();

    try {
      switch (name) {
      case 'search-vault': {
        const { query, path: searchPath, caseSensitive = false, includeContext = true, contextLines = 2, limit = 100, offset = 0 } = args;
        const contextOptions = { includeContext, contextLines };
        const result = await searchVault(vaultPath, query, searchPath, caseSensitive, contextOptions, limit, offset);

        let description = result.totalMatches === 0
          ? `No matches found for "${query}"`
          : `Showing ${result.pagination.returned} of ${result.pagination.total} matches in ${result.fileCount} files for "${query}"`;

        if (result.pagination.hasMore) {
          const nextOffset = offset + limit;
          description += `\n(Use limit=${limit}, offset=${nextOffset} to get next page)`;
        }

        if (includeContext && result.files.length > 0) {
          description += '\n\n';
          const maxFilesInPreview = 5;
          const filesToShow = result.files.slice(0, maxFilesInPreview);

          filesToShow.forEach(file => {
            description += `${file.path} (${file.matchCount} matches)\n`;
            file.matches.slice(0, 3).forEach(match => {
              if (match.context) {
                description += `  Line ${match.line}: ${match.context.highlighted}\n`;
              } else {
                description += `  Line ${match.line}: ${match.content}\n`;
              }
            });
            if (file.matchCount > 3) {
              description += `  ... and ${file.matchCount - 3} more matches\n`;
            }
            description += '\n';
          });

          if (result.files.length > maxFilesInPreview) {
            description += `\n... and ${result.files.length - maxFilesInPreview} more files.\n`;
          }
        }

        const metadata = createMetadata(startTime, {
          tool: 'search-vault',
          filesSearched: result.filesSearched || 0
        });

        const structuredContent = stripSearchContext(result);

        return structuredResponse(structuredContent, description, metadata);
      }

      case 'search-by-title': {
        const { query, path: searchPath, caseSensitive = false, limit = 100, offset = 0 } = args;
        const result = await searchByTitle(vaultPath, query, searchPath, caseSensitive, limit, offset);

        let description = result.count === 0
          ? `No notes found with title matching "${query}"`
          : `Showing ${result.pagination.returned} of ${result.pagination.total} notes with title matching "${query}"`;

        if (result.pagination.hasMore) {
          const nextOffset = offset + limit;
          description += `\n(Use limit=${limit}, offset=${nextOffset} to get next page)`;
        }

        const metadata = createMetadata(startTime, {
          tool: 'search-by-title',
          filesSearched: result.filesSearched || 0
        });

        return structuredResponse(result, description, metadata);
      }

      case 'list-notes': {
        const { directory, limit = 100, offset = 0 } = args;
        const result = await listNotes(vaultPath, directory, limit, offset);

        let description = result.count === 0
          ? `No notes found${directory ? ` in ${directory}` : ''}`
          : `Showing ${result.pagination.returned} of ${result.pagination.total} notes${directory ? ` in ${directory}` : ''}`;

        if (result.pagination.hasMore) {
          const nextOffset = offset + limit;
          description += `\n(Use limit=${limit}, offset=${nextOffset} to get next page)`;
        }

        const metadata = createMetadata(startTime, { tool: 'list-notes' });

        return structuredResponse(result, description, metadata);
      }

      case 'read-note': {
        const { path: notePath } = args;
        const content = await readNote(vaultPath, notePath);
        
        // For read-note, we return the content directly as text
        const metadata = createMetadata(startTime, { 
          tool: 'read-note',
          contentLength: content.length 
        });
        return textResponse(content, metadata);
      }

      case 'write-note': {
        const { path: notePath, content } = args;
        await writeNote(vaultPath, notePath, content);
        
        const metadata = createMetadata(startTime, { 
          tool: 'write-note',
          contentLength: content.length 
        });
        return textResponse(`Note written successfully to ${notePath}`, metadata);
      }

      case 'delete-note': {
        const { path: notePath } = args;
        await deleteNote(vaultPath, notePath);
        
        const metadata = createMetadata(startTime, { tool: 'delete-note' });
        return textResponse(`Note deleted successfully: ${notePath}`, metadata);
      }

      case 'search-by-tags': {
        const { tags, directory, caseSensitive = false } = args;
        const result = await searchByTags(vaultPath, tags, directory, caseSensitive);

        const tagList = tags.join(', ');
        const description = result.count === 0
          ? `No notes found with tags: ${tagList}`
          : `Found ${result.count} notes with tags: ${tagList}`;

        const metadata = createMetadata(startTime, {
          tool: 'search-by-tags',
          tagsSearched: tags.length
        });

        return structuredResponse(result, description, metadata);
      }

      case 'get-note-metadata': {
        const { path: notePath, batch = false, directory, limit = 50, offset = 0 } = args;

        const pathArg = batch && directory ? directory : notePath;
        const result = await getNoteMetadata(vaultPath, pathArg, { batch, limit, offset });

        let description;

        if (batch) {
          description = result.count === 0
            ? 'No notes found'
            : `Showing ${result.pagination.returned} of ${result.pagination.total} notes`;
          if (result.errors && result.errors.length > 0) {
            description += ` (${result.errors.length} errors)`;
          }

          if (result.pagination.hasMore) {
            const nextOffset = offset + limit;
            description += `\n(Use limit=${limit}, offset=${nextOffset} to get next page)`;
          }
        } else {
          description = `Retrieved metadata for: ${notePath}`;
        }

        const metadata = createMetadata(startTime, {
          tool: 'get-note-metadata',
          mode: batch ? 'batch' : 'single'
        });

        return structuredResponse(result, description, metadata);
      }

      case 'discover-mocs': {
        const { mocName, directory } = args;
        const result = await discoverMocs(vaultPath, { mocName, directory });

        let description = result.count === 0
          ? 'No MOCs found'
          : `Found ${result.count} MOCs`;

        if (mocName) {
          description += ` matching "${mocName}"`;
        }
        if (directory) {
          description += ` in ${directory}`;
        }

        if (result.mocs.length > 0) {
          description += '\n\n';
          result.mocs.forEach(moc => {
            description += `${moc.title} (${moc.linkCount} linked notes)\n`;
            description += `  Path: ${moc.path}\n`;
            if (moc.linkedNotes.length > 0) {
              description += `  Links: ${moc.linkedNotes.join(', ')}\n`;
            }
            if (moc.linkedMocs && moc.linkedMocs.length > 0) {
              description += `  Links to MOCs: ${moc.linkedMocs.join(', ')}\n`;
            }
            description += '\n';
          });
        }

        const metadata = createMetadata(startTime, {
          tool: 'discover-mocs',
          mocsFound: result.count,
          totalLinkedNotes: result.mocs.reduce((sum, moc) => sum + moc.linkCount, 0)
        });

        return structuredResponse(result, description, metadata);
      }

      case 'get-backlinks': {
        const { path: notePath } = args;
        const result = await getBacklinks(vaultPath, notePath);

        let description = result.count === 0
          ? `No backlinks found for ${result.path}`
          : `Found ${result.count} backlinks for ${result.path}`;

        if (result.backlinks.length > 0) {
          description += '\n\n' + result.backlinks.map(b => `- ${b}`).join('\n');
        }

        const metadata = createMetadata(startTime, {
          tool: 'get-backlinks',
          backlinksFound: result.count
        });

        return structuredResponse(result, description, metadata);
      }

      case 'find-broken-links': {
        const { directory } = args;
        const result = await findBrokenLinks(vaultPath, { directory });

        let description = result.count === 0
          ? `No broken links found${directory ? ` in ${directory}` : ''}`
          : `Found ${result.count} broken links${directory ? ` in ${directory}` : ''}`;

        if (result.brokenLinks.length > 0) {
          description += '\n\n';
          const maxInPreview = 20;
          result.brokenLinks.slice(0, maxInPreview).forEach(link => {
            description += `${link.source}: [[${link.target}]]`;
            if (link.ambiguous.length > 0) {
              description += ` (ambiguous: ${link.ambiguous.join(', ')})`;
            }
            description += '\n';
          });
          if (result.brokenLinks.length > maxInPreview) {
            description += `... and ${result.brokenLinks.length - maxInPreview} more\n`;
          }
        }

        const metadata = createMetadata(startTime, {
          tool: 'find-broken-links',
          brokenLinksFound: result.count
        });

        return structuredResponse(result, description, metadata);
      }

      case 'find-orphans': {
        const { directory } = args;
        const result = await findOrphans(vaultPath, { directory });

        let description = result.count === 0
          ? `No orphaned notes found${directory ? ` in ${directory}` : ''}`
          : `Found ${result.count} orphaned notes${directory ? ` in ${directory}` : ''}`;

        if (result.orphans.length > 0) {
          description += '\n\n' + result.orphans.map(o => `- ${o}`).join('\n');
        }

        const metadata = createMetadata(startTime, {
          tool: 'find-orphans',
          orphansFound: result.count
        });

        return structuredResponse(result, description, metadata);
      }

      case 'get-graph-neighborhood': {
        const { path: notePath, depth = 1 } = args;
        const result = await getGraphNeighborhood(vaultPath, notePath, depth);

        let description = result.count === 0
          ? `No linked notes within ${result.depth} hops of ${result.path}`
          : `Found ${result.count} notes within ${result.depth} hops of ${result.path}`;

        if (result.neighbors.length > 0) {
          description += '\n\n';
          result.neighbors.forEach(n => {
            description += `- ${n.path} (distance ${n.distance})\n`;
          });
        }

        const metadata = createMetadata(startTime, {
          tool: 'get-graph-neighborhood',
          neighborsFound: result.count
        });

        return structuredResponse(result, description, metadata);
      }

      default:
        throw Errors.toolNotFound(name);
      }
    } catch (error) {
      if (error instanceof MCPError) {
        throw error;
      }
      return errorResponse(error);
    }
  });

  return server;
}
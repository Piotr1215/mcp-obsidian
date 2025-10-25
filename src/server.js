import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { searchVault, searchByTitle, listNotes, readNote, writeNote, deleteNote, searchByTags, getNoteMetadata, discoverMocs } from './tools.js';
import { toolDefinitions } from './toolDefinitions.js';
import { Errors, MCPError } from './errors.js';
import { textResponse, structuredResponse, errorResponse, createMetadata } from './response-formatter.js';
import { glob } from 'glob';
import path from 'path';
import { readFile } from 'fs/promises';
import { createNoteResource } from './resourceDefinitions.js';
import { validatePathWithinBase, validateRequiredParameters } from './validation.js';
import { createNoteResourceLink, createContentWithLinks } from './resource-links.js';
import { multiContentResponse } from './response-formatter.js';

export function createServer(vaultPath) {
  const server = new Server(
    {
      name: 'obsidian-mcp-filesystem',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {
          // We don't support dynamic tool list changes
          listChanged: false
        },
        resources: {
          // We support resources for notes
          listChanged: false
        },
        // We could add these in the future:
        // prompts: {},
        // logging: {},
        // completions: {}
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
        const { query, path: searchPath, caseSensitive = false, includeContext = true, contextLines = 2 } = args;
        const contextOptions = { includeContext, contextLines };
        const result = await searchVault(vaultPath, query, searchPath, caseSensitive, contextOptions);
        
        let description = result.totalMatches === 0 
          ? `No matches found for "${query}"`
          : `Found ${result.totalMatches} matches in ${result.fileCount} files for "${query}"`;
        
        // Add file results to the description when context is included
        // Limit preview to first 5 files to avoid context explosion
        if (includeContext && result.files.length > 0) {
          description += '\n\n';
          const maxFilesInPreview = 5;
          const filesToShow = result.files.slice(0, maxFilesInPreview);

          filesToShow.forEach(file => {
            description += `📄 ${file.path} (${file.matchCount} matches)\n`;
            file.matches.slice(0, 3).forEach(match => {
              if (match.context) {
                description += `  Line ${match.line}: ${match.context.highlighted}\n`;
                if (match.context.lines.length > 1) {
                  const contextPreview = match.context.lines
                    .filter(l => !l.isMatch)
                    .slice(0, 2)
                    .map(l => `    ${l.number}: ${l.text.substring(0, 80)}${l.text.length > 80 ? '...' : ''}`)
                    .join('\n');
                  if (contextPreview) description += contextPreview + '\n';
                }
              } else {
                description += `  Line ${match.line}: ${match.content}\n`;
              }
            });
            if (file.matchCount > 3) {
              description += `  ... and ${file.matchCount - 3} more matches\n`;
            }
            description += '\n';
          });

          // Indicate if results are truncated
          if (result.files.length > maxFilesInPreview) {
            description += `\n... and ${result.files.length - maxFilesInPreview} more files. Use resource links below to access all results.\n`;
          }
        }
        
        // Create resource links for all found files
        const resourceLinks = result.files.map(file => 
          createNoteResourceLink(vaultPath, file.path, {
            matchCount: file.matchCount,
            title: file.title,
            tags: file.tags
          })
        );
        
        const metadata = createMetadata(startTime, { 
          tool: 'search-vault',
          filesSearched: result.filesSearched || 0
        });
        
        // Create content array with text and resource links
        const content = createContentWithLinks(description, resourceLinks);
        
        return {
          content,
          structuredContent: result,
          _meta: metadata
        };
      }

      case 'search-by-title': {
        const { query, path: searchPath, caseSensitive = false } = args;
        const result = await searchByTitle(vaultPath, query, searchPath, caseSensitive);
        
        const description = result.count === 0 
          ? `No notes found with title matching "${query}"`
          : `Found ${result.count} notes with title matching "${query}"`;
        
        // Create resource links for found notes
        const resourceLinks = result.notes.map(note => 
          createNoteResourceLink(vaultPath, note.path, {
            title: note.title,
            tags: note.tags
          })
        );
        
        const metadata = createMetadata(startTime, { 
          tool: 'search-by-title',
          filesSearched: result.filesSearched || 0
        });
        
        const content = createContentWithLinks(description, resourceLinks);
        
        return {
          content,
          structuredContent: result,
          _meta: metadata
        };
      }

      case 'list-notes': {
        const { directory } = args;
        const result = await listNotes(vaultPath, directory);
        
        const description = result.count === 0
          ? `No notes found${directory ? ` in ${directory}` : ''}`
          : `Found ${result.count} notes${directory ? ` in ${directory}` : ''}`;
        
        // Create resource links for all notes
        const resourceLinks = result.notes.map(notePath => 
          createNoteResourceLink(vaultPath, notePath, {})
        );
        
        const metadata = createMetadata(startTime, { tool: 'list-notes' });
        const content = createContentWithLinks(description, resourceLinks);
        
        return {
          content,
          structuredContent: result,
          _meta: metadata
        };
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
        
        // Create resource links with tag context
        const resourceLinks = result.notes.map(note => 
          createNoteResourceLink(vaultPath, note.path, {
            title: note.title,
            tags: note.tags
          })
        );
        
        const metadata = createMetadata(startTime, { 
          tool: 'search-by-tags',
          tagsSearched: tags.length 
        });
        const content = createContentWithLinks(description, resourceLinks);
        
        return {
          content,
          structuredContent: result,
          _meta: metadata
        };
      }

      case 'get-note-metadata': {
        const { path: notePath, batch = false, directory } = args;

        // In batch mode with directory, pass directory as the path
        const pathArg = batch && directory ? directory : notePath;
        const result = await getNoteMetadata(vaultPath, pathArg, { batch });

        let description;
        let resourceLinks = [];

        if (batch) {
          description = result.count === 0
            ? 'No notes found'
            : `Retrieved metadata for ${result.count} notes`;
          if (result.errors && result.errors.length > 0) {
            description += ` (${result.errors.length} errors)`;
          }

          // Create resource links for batch mode
          if (result.notes) {
            resourceLinks = result.notes.map(note =>
              createNoteResourceLink(vaultPath, note.path, {
                title: note.metadata.title,
                tags: note.metadata.tags
              })
            );
          }
        } else {
          description = `Retrieved metadata for: ${notePath}`;

          // Create single resource link for single mode
          resourceLinks = [createNoteResourceLink(vaultPath, notePath, {
            title: result.title,
            tags: result.tags
          })];
        }

        const metadata = createMetadata(startTime, {
          tool: 'get-note-metadata',
          mode: batch ? 'batch' : 'single'
        });

        const content = createContentWithLinks(description, resourceLinks);

        return {
          content,
          structuredContent: result,
          _meta: metadata
        };
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

        // Add MOC details to description
        if (result.mocs.length > 0) {
          description += '\n\n';
          result.mocs.forEach(moc => {
            description += `📚 ${moc.title} (${moc.linkCount} linked notes)\n`;
            description += `   Path: ${moc.path}\n`;
            if (moc.linkedNotes.length > 0) {
              description += `   Links: ${moc.linkedNotes.join(', ')}\n`;
            }
            if (moc.linkedMocs && moc.linkedMocs.length > 0) {
              description += `   🔗 Links to MOCs: ${moc.linkedMocs.join(', ')}\n`;
            }
            description += '\n';
          });
        }

        // Create resource links for MOCs
        const resourceLinks = result.mocs.map(moc =>
          createNoteResourceLink(vaultPath, moc.path, {
            title: moc.title,
            tags: moc.tags
          })
        );

        const metadata = createMetadata(startTime, {
          tool: 'discover-mocs',
          mocsFound: result.count,
          totalLinkedNotes: result.mocs.reduce((sum, moc) => sum + moc.linkCount, 0)
        });

        const content = createContentWithLinks(description, resourceLinks);

        return {
          content,
          structuredContent: result,
          _meta: metadata
        };
      }

      default:
        throw Errors.toolNotFound(name);
      }
    } catch (error) {
      // If it's already an MCPError, re-throw it
      if (error instanceof MCPError) {
        throw error;
      }
      
      // For tool execution errors, return with isError flag
      return errorResponse(error);
    }
  });

  // List available resources (all notes in vault)
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    try {
      const notes = await glob(path.join(vaultPath, '**/*.md'));
      
      // Process in parallel for performance
      const resources = await Promise.all(
        notes.map(notePath => createNoteResource(vaultPath, notePath))
      );
      
      return { resources };
    } catch (error) {
      return { resources: [] };
    }
  });

  // Read a specific resource
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    const { uri } = request.params;
    
    if (!uri.startsWith('obsidian-note://')) {
      throw new Error(`Unknown resource URI: ${uri}`);
    }
    
    const relativePath = uri.replace('obsidian-note://', '');
    const fullPath = path.join(vaultPath, relativePath);
    
    // Validate path
    const pathValidation = validatePathWithinBase(vaultPath, fullPath);
    if (!pathValidation.valid) {
      throw Errors.accessDenied(pathValidation.error, { path: fullPath });
    }
    
    try {
      const content = await readFile(fullPath, 'utf-8');
      
      return {
        uri,
        mimeType: 'text/markdown',
        text: content
      };
    } catch (error) {
      throw Errors.fileNotFound(fullPath);
    }
  });

  return server;
}
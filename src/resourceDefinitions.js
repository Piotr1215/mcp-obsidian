import { readFile, stat } from 'fs/promises';
import path from 'path';
import { extractH1Title } from './title-search.js';
import { extractTags as extractTagsPure } from './tags.js';
import { extractNoteMetadata } from './metadata.js';

/**
 * Create a note resource with metadata for better discoverability
 * @param {string} vaultPath - The vault base path
 * @param {string} notePath - The full path to the note
 * @returns {Promise<object>} Resource object
 */
export async function createNoteResource(vaultPath, notePath) {
  const relativePath = path.relative(vaultPath, notePath);
  const stats = await stat(notePath);
  
  try {
    // Extract metadata for better discoverability
    const content = await readFile(notePath, 'utf-8');
    const titleData = extractH1Title(content);
    const tags = extractTagsPure(content);
    const metadata = extractNoteMetadata(content);
    
    // Build description with available metadata
    let description = '';
    if (tags.length > 0) {
      description += `Tags: ${tags.slice(0, 5).join(', ')}${tags.length > 5 ? '...' : ''} | `;
    }
    description += `Modified: ${stats.mtime.toLocaleDateString()}`;
    
    return {
      uri: `obsidian-note://${relativePath}`,
      name: titleData?.title || path.basename(notePath, '.md'),
      description: description,
      mimeType: 'text/markdown'
    };
  } catch (error) {
    // Fallback for files that can't be read
    return {
      uri: `obsidian-note://${relativePath}`,
      name: path.basename(notePath, '.md'),
      description: `Modified: ${stats.mtime.toLocaleDateString()}`,
      mimeType: 'text/markdown'
    };
  }
}

// TODO: Future enhancement - support multi-vault scenarios by including vault identifier in URI
// Example: obsidian-note://vaultName/path/to/note.md
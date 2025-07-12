import path from 'path';
import { resourceLink } from './response-formatter.js';

/**
 * Create a note resource link with rich context for discoverability
 * @param {string} vaultPath - The vault base path
 * @param {string} notePath - The full path to the note
 * @param {object} context - Additional context for the link
 * @returns {object} Resource link content item
 */
export function createNoteResourceLink(vaultPath, notePath, context = {}) {
  const relativePath = path.relative(vaultPath, notePath);
  const filename = path.basename(notePath, '.md');
  
  // Build description with context for self-discovery
  let description = '';
  
  if (context.matchCount) {
    description += `${context.matchCount} matches | `;
  }
  
  if (context.tags && context.tags.length > 0) {
    const tagDisplay = context.tags.slice(0, 3).join(', ');
    description += `Tags: ${tagDisplay}`;
    if (context.tags.length > 3) {
      description += '...';
    }
    description += ' | ';
  }
  
  if (context.title && context.title !== filename) {
    description += `${context.title}`;
  } else {
    description += `Note: ${filename}`;
  }
  
  // Clean trailing separator
  description = description.replace(/ \| $/, '');
  
  // Use the resourceLink function to create proper MCP resource link
  return resourceLink(
    `obsidian-note://${relativePath}`,
    context.title || filename,
    description,
    'text/markdown'
  );
}

/**
 * Create content array with text and resource links
 * @param {string} text - The main text content
 * @param {Array} resourceLinks - Array of resource link objects
 * @returns {Array} Content array with text and resource links
 */
export function createContentWithLinks(text, resourceLinks = []) {
  const content = [
    {
      type: 'text',
      text: text
    }
  ];
  
  // Add resource links to content array
  if (resourceLinks && resourceLinks.length > 0) {
    content.push(...resourceLinks);
  }
  
  return content;
}
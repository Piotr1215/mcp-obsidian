/**
 * Pure functional utilities for title search operations
 */

import { extractFrontmatter, hasTitleProperty } from './metadata.js';
import { titleFromFilename, findTitlePropertyLine } from './logseq.js';
import { makeRelativePath } from './validation.js';

/**
 * Extracts the H1 title from markdown content (pure function)
 * @param {string} content - The markdown content
 * @returns {object|null} Object with title and line number, or null if no H1 found
 */
export function extractH1Title(content) {
  if (!content) {
    return null;
  }
  
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    // Match H1 heading: starts with single # followed by space
    if (line.match(/^#\s+(.+)$/)) {
      let title = line.substring(2).trim();
      // Strip inline tags from the end of the title (e.g., "Title #tag" -> "Title")
      title = title.replace(/\s+#\w+(\s+#\w+)*$/, '').trim();
      return {
        title,
        line: i + 1
      };
    }
  }
  
  return null;
}

/**
 * Resolves a note's title (pure function): the first H1, else a `title`
 * property (YAML or Logseq), else the file name. Logseq pages rarely have an
 * H1, so without the fallbacks they have no title at all.
 * @param {string} content - The markdown content
 * @param {string} filePath - Path to the note, for the file name fallback
 * @returns {object|null} Object with title and line (null for a file name title)
 */
export function resolveTitle(content, filePath) {
  const h1 = extractH1Title(content);
  if (h1) {
    return h1;
  }

  const { frontmatter } = extractFrontmatter(content || '');
  if (hasTitleProperty(frontmatter)) {
    return {
      title: String(frontmatter.title).trim(),
      line: findTitlePropertyLine(content)
    };
  }

  return filePath ? { title: titleFromFilename(filePath), line: null } : null;
}

/**
 * Checks if a title matches the search query (pure function)
 * @param {string} title - The title to check
 * @param {string} query - The search query
 * @param {boolean} caseSensitive - Whether to perform case-sensitive matching
 * @returns {boolean} True if title matches query
 */
export function titleMatchesQuery(title, query, caseSensitive = false) {
  if (!title || !query) {
    return false;
  }
  
  const searchTitle = caseSensitive ? title : title.toLowerCase();
  const searchQuery = caseSensitive ? query : query.toLowerCase();
  
  return searchTitle.includes(searchQuery);
}

/**
 * Transforms file title matches into search results (pure function)
 * @param {Array} fileTitleMatches - Array of {file, titleInfo} objects
 * @param {string} basePath - Base path to make paths relative
 * @returns {object} Search results with count
 */
export function transformTitleResults(fileTitleMatches, basePath) {
  const results = fileTitleMatches
    .filter(match => match.titleInfo !== null)
    .map(({ file, titleInfo }) => ({
      file: makeRelativePath(file, basePath),
      title: titleInfo.title,
      line: titleInfo.line
    }));
  
  return {
    results,
    count: results.length,
    filesSearched: fileTitleMatches.length
  };
}

/**
 * Pure functional utilities for title search operations
 */

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
      const title = line.substring(2).trim();
      return {
        title,
        line: i + 1
      };
    }
  }
  
  return null;
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

/**
 * Makes a path relative to a base path (pure function)
 * @param {string} absolutePath - The absolute path
 * @param {string} basePath - The base path
 * @returns {string} Relative path
 */
function makeRelativePath(absolutePath, basePath) {
  if (!absolutePath || !basePath) {
    return absolutePath || '';
  }
  
  // Normalize paths by removing trailing slashes
  const normalizedBase = basePath.replace(/\/$/, '');
  const normalizedPath = absolutePath.replace(/\/$/, '');
  
  if (normalizedPath.startsWith(normalizedBase + '/')) {
    return normalizedPath.slice(normalizedBase.length + 1);
  }
  
  return absolutePath;
}
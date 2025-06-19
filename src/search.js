/**
 * Pure functional utilities for search operations
 */

/**
 * Searches for matches in text content (pure function)
 * @param {string} content - The text content to search
 * @param {string} query - The search query
 * @param {boolean} caseSensitive - Whether to perform case-sensitive search
 * @returns {Array} Array of match objects with line number and content
 */
export function findMatchesInContent(content, query, caseSensitive = false) {
  if (!content) {
    return [];
  }
  
  // Empty query matches all lines
  if (!query) {
    return content.split('\n').map((line, index) => ({
      line: index + 1,
      content: line.trim()
    }));
  }

  const lines = content.split('\n');
  const searchQuery = caseSensitive ? query : query.toLowerCase();
  
  return lines.reduce((matches, line, index) => {
    const searchLine = caseSensitive ? line : line.toLowerCase();
    
    if (searchLine.includes(searchQuery)) {
      matches.push({
        line: index + 1,
        content: line.trim()
      });
    }
    
    return matches;
  }, []);
}

/**
 * Transforms file matches into search results (pure function)
 * @param {Array} fileMatches - Array of {file, matches} objects
 * @param {string} basePath - Base path to make paths relative
 * @returns {object} Search results with count
 */
export function transformSearchResults(fileMatches, basePath) {
  const results = fileMatches.flatMap(({ file, matches }) =>
    matches.map(match => ({
      file: makeRelativePath(file, basePath),
      ...match
    }))
  );
  
  return {
    results,
    count: results.length,
    filesSearched: fileMatches.length
  };
}

/**
 * Makes a path relative to a base path (pure function)
 * @param {string} absolutePath - The absolute path
 * @param {string} basePath - The base path
 * @returns {string} Relative path
 */
export function makeRelativePath(absolutePath, basePath) {
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

/**
 * Filters search results by limit (pure function)
 * @param {object} searchResults - Search results object
 * @param {number} maxResults - Maximum number of results
 * @returns {object} Limited search results
 */
export function limitSearchResults(searchResults, maxResults) {
  if (searchResults.results.length <= maxResults) {
    return searchResults;
  }
  
  return {
    results: searchResults.results.slice(0, maxResults),
    count: maxResults,
    filesSearched: searchResults.filesSearched,
    truncated: true,
    message: `Results limited to ${maxResults} matches`
  };
}
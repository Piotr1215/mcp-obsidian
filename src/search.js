/**
 * Pure functional utilities for search operations
 */

import { parseSearchQuery, evaluateExpression } from './search-operators.js';
import { extractH1Title } from './title-search.js';
import { extractTags } from './tags.js';

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

/**
 * Searches for matches using search operators (pure function)
 * @param {string} content - The text content to search
 * @param {string} query - The search query (may include operators)
 * @param {Object} metadata - Note metadata (title, tags, etc.)
 * @param {boolean} caseSensitive - Whether to perform case-sensitive search
 * @returns {Array} Array of match objects with line number and content
 */
export function findMatchesWithOperators(content, query, metadata, caseSensitive = false) {
  if (!content) {
    return [];
  }
  
  // Parse the query into an expression tree
  const expression = parseSearchQuery(query);
  
  // If no valid expression (empty query), return all lines
  if (!expression) {
    return content.split('\n').map((line, index) => ({
      line: index + 1,
      content: line.trim()
    }));
  }
  
  // Evaluate if the document matches the expression
  const matches = evaluateExpression(expression, content, metadata);
  
  if (!matches) {
    return [];
  }
  
  // For field-specific searches (title:, tag:), only return the matching field
  // For other searches, return all lines containing search terms
  const lines = content.split('\n');
  const matchedLines = [];
  
  // Check if this is a pure field search (only field expressions, no other operators)
  const isPureFieldSearch = expression.type === 'FIELD';
  
  if (isPureFieldSearch && expression.field === 'title') {
    // For title searches, only return the title line itself
    const titleMatch = lines.findIndex(line => line.trim().match(/^#\s+(.+)$/));
    if (titleMatch !== -1) {
      matchedLines.push({
        line: titleMatch + 1,
        content: lines[titleMatch].trim()
      });
    }
  } else if (isPureFieldSearch && expression.field === 'tag') {
    // For tag searches, return lines containing the tags
    // This is tricky because tags can be in frontmatter or inline
    // For now, return the first line as a summary
    matchedLines.push({
      line: 1,
      content: `[Document matches tag: ${expression.value}]`
    });
  } else {
    // For content searches and complex queries, return all matching lines
    const terms = extractSearchTerms(expression);
    
    lines.forEach((line, index) => {
      const searchLine = caseSensitive ? line : line.toLowerCase();
      
      // Check if this line contains any of the search terms
      const lineMatches = terms.some(term => {
        const searchTerm = caseSensitive ? term : term.toLowerCase();
        return searchLine.includes(searchTerm);
      });
      
      if (lineMatches) {
        matchedLines.push({
          line: index + 1,
          content: line.trim()
        });
      }
    });
  }
  
  return matchedLines;
}

/**
 * Extract all search terms from an expression tree (pure function)
 * Only extracts positive terms (not negated ones)
 * @param {Object} expression - The expression tree
 * @returns {Array} Array of search terms
 */
function extractSearchTerms(expression) {
  if (!expression) return [];
  
  const terms = [];
  
  switch (expression.type) {
    case 'TERM':
      terms.push(expression.value);
      break;
    case 'FIELD':
      // For field searches, we need to include the search value
      // so we can highlight matching lines in the results
      terms.push(expression.value);
      break;
    case 'AND':
    case 'OR':
      terms.push(...extractSearchTerms(expression.left));
      terms.push(...extractSearchTerms(expression.right));
      break;
    case 'NOT':
      // Don't include NOT terms - we only want positive matches
      break;
  }
  
  return terms;
}
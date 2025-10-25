/**
 * Pure functional utilities for search operations
 */

import { parseSearchQuery, evaluateExpression } from './search-operators.js';
import { extractH1Title } from './title-search.js';
import { extractTags } from './tags.js';
import { extractContextLines, formatContextResult } from './search-context.js';

/**
 * Creates pagination metadata for a result set
 * @param {number} total - Total number of items across all pages
 * @param {number} returned - Number of items in this response
 * @param {number} limit - Limit parameter used
 * @param {number} offset - Offset parameter used
 * @returns {object} Pagination metadata
 */
export function createPaginationMetadata(total, returned, limit, offset) {
  return {
    total,
    returned,
    limit,
    offset,
    hasMore: offset + returned < total
  };
}

/**
 * Applies pagination to an array of items
 * @param {Array} items - Array of items to paginate
 * @param {number} limit - Maximum number of items to return
 * @param {number} offset - Number of items to skip
 * @returns {object} Object with paginated items and metadata
 */
export function paginateArray(items, limit = 100, offset = 0) {
  const total = items.length;
  const paginatedItems = items.slice(offset, offset + limit);
  const returned = paginatedItems.length;

  return {
    items: paginatedItems,
    pagination: createPaginationMetadata(total, returned, limit, offset)
  };
}

/**
 * Searches for matches in text content (pure function)
 * @param {string} content - The text content to search
 * @param {string} query - The search query
 * @param {boolean} caseSensitive - Whether to perform case-sensitive search
 * @param {Object} options - Additional options including context settings
 * @returns {Array} Array of match objects with line number and content
 */
export function findMatchesInContent(content, query, caseSensitive = false, options = {}) {
  const { includeContext = false, contextLines = 2 } = options;
  
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
      const match = {
        line: index + 1,
        content: line.trim()
      };
      
      // Add context if requested
      if (includeContext) {
        const contextData = extractContextLines(lines, index, contextLines);
        const formattedMatch = formatContextResult(match, contextData, query);
        matches.push(formattedMatch);
      } else {
        matches.push(match);
      }
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
  // Group results by file and include match snippets
  const fileResults = fileMatches.map(({ file, matches }) => ({
    path: makeRelativePath(file, basePath),
    matchCount: matches.length,
    matches: matches
  }));

  // Calculate total match count
  const totalMatches = fileMatches.reduce((sum, { matches }) => sum + matches.length, 0);

  return {
    files: fileResults,
    totalMatches,
    fileCount: fileResults.length,
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
 * Applies pagination to search results with offset/limit
 * @param {object} searchResults - Search results object
 * @param {number} limit - Maximum number of matches to return
 * @param {number} offset - Number of matches to skip
 * @returns {object} Paginated search results with metadata
 */
export function paginateSearchResults(searchResults, limit = 100, offset = 0) {
  const totalMatches = searchResults.totalMatches;

  // Flatten all matches with file info
  const allMatches = [];
  for (const file of searchResults.files) {
    for (const match of file.matches) {
      allMatches.push({
        filePath: file.path,
        ...match
      });
    }
  }

  // Apply pagination
  const paginatedMatches = allMatches.slice(offset, offset + limit);

  // Reconstruct file structure
  const filesMap = new Map();
  for (const match of paginatedMatches) {
    const filePath = match.filePath;
    if (!filesMap.has(filePath)) {
      filesMap.set(filePath, {
        path: filePath,
        matchCount: 0,
        matches: []
      });
    }
    const file = filesMap.get(filePath);
    file.matchCount++;
    file.matches.push({
      line: match.line,
      content: match.content,
      ...(match.context && { context: match.context })
    });
  }

  const paginatedFiles = Array.from(filesMap.values());
  const pagination = createPaginationMetadata(totalMatches, paginatedMatches.length, limit, offset);

  return {
    files: paginatedFiles,
    totalMatches: paginatedMatches.length,
    fileCount: paginatedFiles.length,
    filesSearched: searchResults.filesSearched,
    pagination
  };
}


/**
 * Searches for matches using search operators (pure function)
 * @param {string} content - The text content to search
 * @param {string} query - The search query (may include operators)
 * @param {Object} metadata - Note metadata (title, tags, etc.)
 * @param {boolean} caseSensitive - Whether to perform case-sensitive search
 * @param {Object} options - Additional options including context settings
 * @returns {Array} Array of match objects with line number and content
 */
export function findMatchesWithOperators(content, query, metadata, caseSensitive = false, options = {}) {
  const { includeContext = false, contextLines = 2 } = options;
  
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
      const match = {
        line: titleMatch + 1,
        content: lines[titleMatch].trim()
      };
      
      if (includeContext) {
        const contextData = extractContextLines(lines, titleMatch, contextLines);
        const formattedMatch = formatContextResult(match, contextData, expression.value);
        matchedLines.push(formattedMatch);
      } else {
        matchedLines.push(match);
      }
    }
  } else if (isPureFieldSearch && expression.field === 'tag') {
    // For tag searches, return lines containing the tags
    // This is tricky because tags can be in frontmatter or inline
    // For now, return the first line as a summary
    const match = {
      line: 1,
      content: `[Document matches tag: ${expression.value}]`
    };
    matchedLines.push(match);
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
        const match = {
          line: index + 1,
          content: line.trim()
        };
        
        if (includeContext) {
          const contextData = extractContextLines(lines, index, contextLines);
          // Use the first matching term for highlighting
          const highlightTerm = terms.find(term => {
            const searchTerm = caseSensitive ? term : term.toLowerCase();
            return searchLine.includes(searchTerm);
          });
          const formattedMatch = formatContextResult(match, contextData, highlightTerm || query);
          matchedLines.push(formattedMatch);
        } else {
          matchedLines.push(match);
        }
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
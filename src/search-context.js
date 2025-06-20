/**
 * Pure functional utilities for search result context extraction
 */

/**
 * Escapes special regex characters in a string
 * @param {string} string - The string to escape
 * @returns {string} Escaped string safe for regex
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Extracts context lines around a match
 * @param {Array<string>} lines - All lines in the file
 * @param {number} matchIndex - Index of the matching line
 * @param {number} contextSize - Number of lines before and after to include
 * @returns {Object} Object with context lines and indices
 */
export function extractContextLines(lines, matchIndex, contextSize = 2) {
  if (!lines || lines.length === 0) {
    return { lines: [], startIndex: 0, matchIndex: 0 };
  }

  const startIdx = Math.max(0, matchIndex - contextSize);
  const endIdx = Math.min(lines.length - 1, matchIndex + contextSize);
  
  const contextLines = lines.slice(startIdx, endIdx + 1);
  const relativeMatchIndex = matchIndex - startIdx;

  return {
    lines: contextLines,
    startIndex: startIdx,
    matchIndex: relativeMatchIndex
  };
}

/**
 * Highlights matches in a line of text
 * @param {string} line - The line to highlight
 * @param {string} query - The search query
 * @param {boolean} caseSensitive - Whether to match case sensitively
 * @returns {string} Line with matches wrapped in **
 */
export function highlightMatch(line, query, caseSensitive = false) {
  if (!line || !query) {
    return line || '';
  }

  const escapedQuery = escapeRegex(query);
  const flags = caseSensitive ? 'g' : 'gi';
  const regex = new RegExp(escapedQuery, flags);
  
  return line.replace(regex, '**$&**');
}

/**
 * Formats a match result with context
 * @param {Object} match - The original match object
 * @param {Object} contextLines - Context lines from extractContextLines
 * @param {string} query - The search query for highlighting
 * @param {Object} options - Formatting options
 * @returns {Object} Formatted match with context
 */
export function formatContextResult(match, contextLines, query, options = {}) {
  const { maxLineLength = 150 } = options;
  
  const formattedLines = contextLines.lines.map((line, idx) => {
    const lineNumber = contextLines.startIndex + idx + 1;
    const isMatch = idx === contextLines.matchIndex;
    
    // Truncate long lines
    let text = line;
    if (text.length > maxLineLength) {
      text = text.substring(0, maxLineLength) + '...';
    }
    
    return {
      number: lineNumber,
      text,
      isMatch
    };
  });

  // Highlight the matched line
  const matchedLine = contextLines.lines[contextLines.matchIndex] || '';
  const highlighted = highlightMatch(matchedLine, query);

  return {
    ...match,
    context: {
      lines: formattedLines,
      highlighted
    }
  };
}

/**
 * Extracts snippet around a specific match position
 * @param {string} line - The line containing the match
 * @param {number} matchPos - Position of the match in the line
 * @param {number} snippetRadius - Characters to show before/after match
 * @returns {string} Snippet with ellipsis if truncated
 */
export function extractSnippet(line, matchPos, snippetRadius = 40) {
  if (!line) return '';
  
  const start = Math.max(0, matchPos - snippetRadius);
  const end = Math.min(line.length, matchPos + snippetRadius);
  
  let snippet = line.substring(start, end);
  
  if (start > 0) snippet = '...' + snippet;
  if (end < line.length) snippet = snippet + '...';
  
  return snippet;
}
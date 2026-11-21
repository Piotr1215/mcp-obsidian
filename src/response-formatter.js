/**
 * Formats tool responses according to MCP specification
 */

/**
 * Creates a text response
 * @param {string} text - The text content
 * @param {object} [metadata] - Optional execution metadata
 * @returns {object} MCP-compliant response
 */
export function textResponse(text, metadata = null) {
  const response = {
    content: [
      {
        type: 'text',
        text
      }
    ]
  };
  
  if (metadata) {
    response._meta = metadata;
  }
  
  return response;
}

/**
 * Creates a structured response. The text block is exactly the serialized
 * structuredContent: Claude Code shows the model only structuredContent on
 * success and Codex shows both, so the two must say the same thing.
 * @param {object} data - The structured data
 * @param {object} [metadata] - Optional execution metadata
 * @returns {object} MCP-compliant response
 */
export function structuredResponse(data, metadata = null) {
  const response = {
    content: [
      {
        type: 'text',
        text: JSON.stringify(data)
      }
    ],
    structuredContent: data
  };

  if (metadata) {
    response._meta = metadata;
  }

  return response;
}

/**
 * Add the offset of the next page to a result's pagination block, so a model
 * can page without doing arithmetic. Null on the last page.
 * @param {object} result - A result with a pagination block
 * @returns {object} The result with pagination.nextOffset
 */
export function withNextOffset(result) {
  if (!result?.pagination) {
    return result;
  }
  const { offset, returned, hasMore } = result.pagination;
  return {
    ...result,
    pagination: { ...result.pagination, nextOffset: hasMore ? offset + returned : null }
  };
}

/**
 * What to try next, by error code. An error message is a prompt: it should
 * end with the call that gets the model unstuck.
 */
function recoveryHint(code) {
  switch (code) {
  case -32002:
    return 'Next step: find the note with search-by-title or list-notes, then retry with the vault-relative path it returns.';
  case -32003:
    return 'Next step: use a vault-relative path that stays inside the vault, such as "Folder/Note.md".';
  case -32004:
    return '';
  case -32602:
    return 'Next step: correct the argument as described and call the tool again.';
  default:
    return 'Next step: check the path with list-notes and retry; if it keeps failing, report the message to the user.';
  }
}

/**
 * Creates a tool execution error: isError true with a message that says how
 * to recover. Protocol errors (unknown tool, malformed request) are not built
 * here; they stay JSON-RPC errors.
 * @param {Error|MCPError} error - The error to format
 * @returns {object} MCP-compliant error response
 */
export function errorResponse(error) {
  return {
    content: [
      {
        type: 'text',
        text: [`Error: ${error.message}`, recoveryHint(error.code)].filter(Boolean).join('\n')
      }
    ],
    isError: true
  };
}

/**
 * Creates execution metadata for responses
 * @param {number} startTime - The start time from Date.now()
 * @param {object} [additional] - Additional metadata fields
 * @returns {object} Metadata object
 */
export function createMetadata(startTime, additional = {}) {
  return {
    executionTime: Date.now() - startTime,
    timestamp: new Date().toISOString(),
    ...additional
  };
}

/**
 * Strips verbose context data from search results to reduce token usage
 * Removes context.lines arrays while keeping essential match information
 * @param {object} searchResults - The search results object
 * @returns {object} Search results with context stripped
 */
export function stripSearchContext(searchResults) {
  if (!searchResults || !searchResults.files) {
    return searchResults;
  }

  return {
    ...searchResults,
    files: searchResults.files.map(file => ({
      ...file,
      matches: file.matches.map(match => {
        // Remove context.lines array but keep highlighted snippet
        if (match.context) {
          return {
            line: match.line,
            content: match.content,
            context: {
              highlighted: match.context.highlighted
            }
          };
        }
        return match;
      })
    }))
  };
}
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
 * Creates a structured response with both text and structured content
 * @param {object} data - The structured data
 * @param {string} [description] - Optional text description
 * @param {object} [metadata] - Optional execution metadata
 * @returns {object} MCP-compliant response
 */
export function structuredResponse(data, description = null, metadata = null) {
  const response = {
    content: [
      {
        type: 'text',
        text: description || JSON.stringify(data, null, 2)
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
 * Creates an error response
 * @param {Error|MCPError} error - The error to format
 * @returns {object} MCP-compliant error response
 */
export function errorResponse(error) {
  return {
    content: [
      {
        type: 'text',
        text: `Error: ${error.message}`
      }
    ],
    isError: true
  };
}

/**
 * Creates a resource link content item
 * @param {string} uri - The resource URI
 * @param {string} name - The resource name
 * @param {string} [description] - Optional description
 * @param {string} [mimeType] - Optional MIME type
 * @returns {object} MCP-compliant resource link
 */
export function resourceLink(uri, name, description, mimeType) {
  const link = {
    type: 'resource_link',
    uri,
    name
  };
  
  if (description) link.description = description;
  if (mimeType) link.mimeType = mimeType;
  
  return link;
}

/**
 * Creates a response with multiple content items
 * @param {Array} items - Array of content items
 * @param {object} [structuredContent] - Optional structured content
 * @param {object} [metadata] - Optional execution metadata
 * @returns {object} MCP-compliant response
 */
export function multiContentResponse(items, structuredContent = null, metadata = null) {
  const response = {
    content: items
  };
  
  if (structuredContent) {
    response.structuredContent = structuredContent;
  }
  
  if (metadata) {
    response._meta = metadata;
  }
  
  return response;
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
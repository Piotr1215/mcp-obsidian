/**
 * Formats tool responses according to MCP specification
 */

/**
 * Creates a text response
 * @param {string} text - The text content
 * @returns {object} MCP-compliant response
 */
export function textResponse(text) {
  return {
    content: [
      {
        type: 'text',
        text
      }
    ]
  };
}

/**
 * Creates a structured response with both text and structured content
 * @param {object} data - The structured data
 * @param {string} [description] - Optional text description
 * @returns {object} MCP-compliant response
 */
export function structuredResponse(data, description = null) {
  const response = {
    content: [
      {
        type: 'text',
        text: description || JSON.stringify(data, null, 2)
      }
    ],
    structuredContent: data
  };
  
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
 * Creates a resource link response
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
 * @returns {object} MCP-compliant response
 */
export function multiContentResponse(items, structuredContent = null) {
  const response = {
    content: items
  };
  
  if (structuredContent) {
    response.structuredContent = structuredContent;
  }
  
  return response;
}
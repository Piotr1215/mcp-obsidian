/**
 * MCP Error codes as defined in the specification
 */
export const ErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  
  // MCP specific error codes
  RESOURCE_NOT_FOUND: -32002,
  RESOURCE_ACCESS_DENIED: -32003,
  TOOL_NOT_FOUND: -32004,
};

/**
 * Base class for MCP errors
 */
export class MCPError extends Error {
  constructor(code, message, data = undefined) {
    super(message);
    this.code = code;
    this.data = data;
    this.name = 'MCPError';
  }

  toJSON() {
    const error = {
      code: this.code,
      message: this.message,
    };
    if (this.data !== undefined) {
      error.data = this.data;
    }
    return error;
  }
}

/**
 * Create a standard MCP error
 */
export function createError(code, message, data) {
  return new MCPError(code, message, data);
}

/**
 * Common error factory functions
 */
export const Errors = {
  invalidParams: (message, data) => 
    createError(ErrorCodes.INVALID_PARAMS, message, data),
  
  resourceNotFound: (resource, data) => 
    createError(ErrorCodes.RESOURCE_NOT_FOUND, `Resource not found: ${resource}`, data),
  
  toolNotFound: (tool) => 
    createError(ErrorCodes.INVALID_PARAMS, `Unknown tool: ${tool}`),
  
  internalError: (message, data) => 
    createError(ErrorCodes.INTERNAL_ERROR, message || 'Internal server error', data),
  
  accessDenied: (message, data) => 
    createError(ErrorCodes.RESOURCE_ACCESS_DENIED, message || 'Access denied', data),
};
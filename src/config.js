/**
 * Configuration constants for the MCP server
 */

export const config = {
  // File size limits
  limits: {
    maxFileSize: 10 * 1024 * 1024, // 10MB max file size
    maxSearchResults: 100, // Maximum number of search results (reduced from 1000 to prevent context explosion)
    maxConcurrentReads: 10, // Maximum concurrent file reads
  },
  
  // Timeout settings
  timeouts: {
    fileOperation: 30000, // 30 seconds for file operations
    searchOperation: 60000, // 60 seconds for search operations
  },
  
  // Security settings
  security: {
    allowedExtensions: ['.md'],
    sanitizeContent: true,
  }
};

// formatFileSize has been moved to functional/validation.js
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
    confirmation: 120000, // 2 minutes for a human to answer a delete prompt
  },

  // Human confirmation before an irreversible operation. Only applies when the
  // client advertises elicitation; anything else was never going to be asked.
  // Set OBSIDIAN_MCP_CONFIRM_DELETE=off to delete without prompting.
  confirmations: {
    deleteNote: process.env.OBSIDIAN_MCP_CONFIRM_DELETE !== 'off',
  },

  // Security settings
  security: {
    allowedExtensions: ['.md'],
    sanitizeContent: true,
  }
};

// formatFileSize has been moved to functional/validation.js
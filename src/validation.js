/**
 * Pure functional validation utilities
 */

import path from 'path';

/**
 * Validates that a path is within the allowed directory (pure function)
 * @param {string} basePath - The base directory path
 * @param {string} targetPath - The path to validate
 * @returns {object} Validation result with {valid: boolean, error?: string, resolvedPath?: string}
 */
export function validatePathWithinBase(basePath, targetPath) {
  if (!basePath) {
    return {
      valid: false,
      error: 'Base path is required'
    };
  }
  
  // Empty target path means base directory
  if (!targetPath || targetPath === '') {
    return {
      valid: true,
      resolvedPath: path.resolve(basePath)
    };
  }
  
  // Check for absolute paths outside base
  if (path.isAbsolute(targetPath) && !targetPath.startsWith(basePath)) {
    return {
      valid: false,
      error: 'Absolute path outside vault directory'
    };
  }
  
  const normalizedBase = path.resolve(basePath);
  const normalizedTarget = path.resolve(basePath, targetPath);
  
  // Check if resolved path is within base
  if (!normalizedTarget.startsWith(normalizedBase + path.sep) && 
      normalizedTarget !== normalizedBase) {
    return {
      valid: false,
      error: 'Path traversal detected'
    };
  }
  
  return {
    valid: true,
    resolvedPath: normalizedTarget
  };
}

/**
 * Validates that a file has markdown extension (pure function)
 * @param {string} filePath - The file path to validate
 * @returns {object} Validation result with {valid: boolean, error?: string}
 */
export function validateMarkdownExtension(filePath) {
  if (!filePath) {
    return {
      valid: false,
      error: 'File path is required'
    };
  }
  
  if (!filePath.toLowerCase().endsWith('.md')) {
    return {
      valid: false,
      error: 'Only markdown files (.md) are supported'
    };
  }
  
  return { valid: true };
}

/**
 * Validates required parameters (pure function)
 * @param {object} params - The parameters object
 * @param {Array<string>} required - Array of required parameter names
 * @returns {object} Validation result with {valid: boolean, error?: string, missingParam?: string}
 */
export function validateRequiredParameters(params, required) {
  if (!params || typeof params !== 'object') {
    return {
      valid: false,
      error: 'Parameters must be an object'
    };
  }
  
  for (const param of required) {
    if (params[param] === undefined || params[param] === null) {
      return {
        valid: false,
        error: `Missing required parameter: ${param}`,
        missingParam: param
      };
    }
  }
  
  return { valid: true };
}

/**
 * Validates file size (pure function)
 * @param {number} size - File size in bytes
 * @param {number} maxSize - Maximum allowed size in bytes
 * @returns {object} Validation result with {valid: boolean, error?: string, size?: number, maxSize?: number}
 */
export function validateFileSize(size, maxSize) {
  if (typeof size !== 'number' || size < 0) {
    return {
      valid: false,
      error: 'Invalid file size'
    };
  }
  
  if (size > maxSize) {
    return {
      valid: false,
      error: `File too large: ${formatFileSize(size)} exceeds maximum allowed size of ${formatFileSize(maxSize)}`,
      size,
      maxSize
    };
  }
  
  return { valid: true };
}

/**
 * Formats file size for display (pure function)
 * @param {number} bytes - Size in bytes
 * @returns {string} Human-readable size
 */
export function formatFileSize(bytes) {
  if (typeof bytes !== 'number' || bytes < 0) {
    return 'Invalid size';
  }
  
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Sanitizes content by removing null bytes (pure function)
 * @param {string} content - The content to sanitize
 * @returns {string} Sanitized content
 */
export function sanitizeContent(content) {
  if (typeof content !== 'string') {
    return '';
  }
  
  return content.replace(/\0/g, '');
}
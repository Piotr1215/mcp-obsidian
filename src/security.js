import path from 'path';
import { stat } from 'fs/promises';
import { Errors, MCPError } from './errors.js';
import { config } from './config.js';
import { formatFileSize } from './validation.js';

// Re-export validation functions that throw errors for backward compatibility
import {
  validatePathWithinBase,
  validateMarkdownExtension,
  validateRequiredParameters,
  sanitizeContent as sanitizeContentPure
} from './validation.js';

/**
 * Validates that a path is within the allowed vault directory
 * @param {string} vaultPath - The vault root path
 * @param {string} targetPath - The path to validate
 * @returns {string} The validated absolute path
 * @throws {MCPError} If the path is outside the vault
 */
export function validatePath(vaultPath, targetPath) {
  const result = validatePathWithinBase(vaultPath, targetPath);
  if (!result.valid) {
    throw Errors.accessDenied('Path traversal attempt detected', {
      path: targetPath,
      reason: result.error
    });
  }
  return result.resolvedPath;
}

/**
 * Validates that a file path has the .md extension
 * @param {string} filePath - The file path to validate
 * @throws {MCPError} If the file is not a markdown file
 */
export function validateMarkdownFile(filePath) {
  const result = validateMarkdownExtension(filePath);
  if (!result.valid) {
    throw Errors.invalidParams(result.error, { path: filePath });
  }
}

/**
 * Validates that required parameters are present
 * @param {object} params - The parameters object
 * @param {string[]} required - Array of required parameter names
 * @throws {MCPError} If any required parameter is missing
 */
export function validateRequiredParams(params, required) {
  const result = validateRequiredParameters(params, required);
  if (!result.valid) {
    throw Errors.invalidParams(result.error, { missingParam: result.missingParam });
  }
}

/**
 * Sanitizes file content to remove any potentially harmful data
 * @param {string} content - The content to sanitize
 * @returns {string} The sanitized content
 */
export function sanitizeContent(content) {
  return sanitizeContentPure(content);
}

/**
 * Validates file size is within acceptable limits
 * @param {string} filePath - The file path to check
 * @param {number} maxSize - Maximum allowed size in bytes
 * @throws {MCPError} If the file is too large
 */
export async function validateFileSize(filePath, maxSize = config.limits.maxFileSize) {
  try {
    const stats = await stat(filePath);
    
    if (stats.size > maxSize) {
      throw Errors.invalidParams(
        `File too large: ${formatFileSize(stats.size)} exceeds maximum allowed size of ${formatFileSize(maxSize)}`,
        { 
          path: filePath,
          size: stats.size,
          maxSize: maxSize
        }
      );
    }
    
    return stats.size;
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    if (error.code === 'ENOENT') {
      throw Errors.resourceNotFound(filePath, { path: filePath });
    }
    throw Errors.internalError(`Failed to check file size: ${error.message}`, { path: filePath });
  }
}
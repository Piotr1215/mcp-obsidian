import path from 'path';
import { Errors } from './errors.js';

/**
 * Validates that a path is within the allowed vault directory
 * @param {string} vaultPath - The vault root path
 * @param {string} targetPath - The path to validate
 * @returns {string} The validated absolute path
 * @throws {MCPError} If the path is outside the vault
 */
export function validatePath(vaultPath, targetPath) {
  // Reject absolute paths that don't start with the vault path
  if (path.isAbsolute(targetPath) && !targetPath.startsWith(vaultPath)) {
    throw Errors.accessDenied(
      'Path traversal attempt detected',
      { 
        path: targetPath,
        reason: 'Absolute path outside vault directory'
      }
    );
  }
  
  // Normalize paths to prevent traversal attacks
  const normalizedVault = path.resolve(vaultPath);
  const normalizedTarget = path.resolve(vaultPath, targetPath);
  
  // Check if the target path is within the vault
  if (!normalizedTarget.startsWith(normalizedVault + path.sep) && 
      normalizedTarget !== normalizedVault) {
    throw Errors.accessDenied(
      'Path traversal attempt detected',
      { 
        path: targetPath,
        reason: 'Path is outside vault directory'
      }
    );
  }
  
  return normalizedTarget;
}

/**
 * Validates that a file path has the .md extension
 * @param {string} filePath - The file path to validate
 * @throws {MCPError} If the file is not a markdown file
 */
export function validateMarkdownFile(filePath) {
  if (!filePath.toLowerCase().endsWith('.md')) {
    throw Errors.invalidParams(
      'Only markdown files (.md) are supported',
      { path: filePath }
    );
  }
}

/**
 * Validates that required parameters are present
 * @param {object} params - The parameters object
 * @param {string[]} required - Array of required parameter names
 * @throws {MCPError} If any required parameter is missing
 */
export function validateRequiredParams(params, required) {
  for (const param of required) {
    if (params[param] === undefined || params[param] === null) {
      throw Errors.invalidParams(
        `Missing required parameter: ${param}`,
        { missingParam: param }
      );
    }
  }
}

/**
 * Sanitizes file content to remove any potentially harmful data
 * @param {string} content - The content to sanitize
 * @returns {string} The sanitized content
 */
export function sanitizeContent(content) {
  // Remove any null bytes which could cause issues
  return content.replace(/\0/g, '');
}
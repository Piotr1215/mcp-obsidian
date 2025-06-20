import { readFile, writeFile, mkdir, unlink, access, stat } from 'fs/promises';
import { constants } from 'fs';
import { glob } from 'glob';
import path from 'path';
import { Errors, MCPError } from './errors.js';
import { config } from './config.js';

// Import pure functions
import { findMatchesInContent, findMatchesWithOperators, transformSearchResults, limitSearchResults } from './search.js';
import { extractTags as extractTagsPure, hasAllTags } from './tags.js';
import { extractH1Title, titleMatchesQuery, transformTitleResults } from './title-search.js';
import { extractNoteMetadata, transformBatchMetadata } from './metadata.js';
import { 
  validatePathWithinBase, 
  validateMarkdownExtension, 
  validateRequiredParameters,
  validateFileSize as validateFileSizePure,
  sanitizeContent as sanitizeContentPure
} from './validation.js';

/**
 * Wrapper to convert validation results to exceptions
 */
function assertValid(validationResult, errorFactory) {
  if (!validationResult.valid) {
    throw errorFactory(validationResult.error, validationResult);
  }
  return validationResult;
}

/**
 * Search for content in vault (I/O function using pure functions)
 */
export async function searchVault(vaultPath, query, searchPath, caseSensitive = false, contextOptions = {}) {
  // Validate using pure function
  const paramValidation = validateRequiredParameters({ query }, ['query']);
  assertValid(paramValidation, (msg) => Errors.invalidParams(msg));
  
  // Validate search path if provided
  if (searchPath) {
    const pathValidation = validatePathWithinBase(vaultPath, searchPath);
    assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: searchPath }));
  }
  
  // I/O: Get files
  const searchPattern = searchPath 
    ? path.join(vaultPath, searchPath, '**/*.md')
    : path.join(vaultPath, '**/*.md');
  const files = await glob(searchPattern);
  
  // Process files with pure functions
  const fileMatches = [];
  const totalFiles = files.length;
  
  for (const file of files) {
    try {
      // I/O: Check file size
      const stats = await stat(file);
      const sizeValidation = validateFileSizePure(stats.size, config.limits.maxFileSize);
      
      if (!sizeValidation.valid) {
        continue; // Skip large files
      }
      
      // I/O: Read file
      const content = await readFile(file, 'utf-8');
      
      // Check if query contains operators
      const hasOperators = /\b(AND|OR|NOT)\b|[:\-()]|"/.test(query);
      
      let matches;
      if (hasOperators) {
        // Extract metadata for operator-based search
        const titleData = extractH1Title(content);
        const tags = extractTagsPure(content);
        const metadata = { 
          title: titleData ? titleData.title : '', 
          tags 
        };
        
        // Use operator-based search
        matches = findMatchesWithOperators(content, query, metadata, caseSensitive, contextOptions);
      } else {
        // Use simple string matching for backward compatibility
        matches = findMatchesInContent(content, query, caseSensitive, contextOptions);
      }
      
      if (matches.length > 0) {
        fileMatches.push({ file, matches });
      }
    } catch (error) {
      // Skip files with read errors
      continue;
    }
  }
  
  // Pure: Transform and limit results
  const results = transformSearchResults(fileMatches, vaultPath);
  return limitSearchResults(results, config.limits.maxSearchResults);
}

/**
 * Search for notes by title (I/O function using pure functions)
 */
export async function searchByTitle(vaultPath, query, searchPath, caseSensitive = false) {
  // Validate using pure function
  const paramValidation = validateRequiredParameters({ query }, ['query']);
  assertValid(paramValidation, (msg) => Errors.invalidParams(msg));
  
  // Check for empty query
  if (!query || query.trim() === '') {
    throw Errors.invalidParams('query cannot be empty');
  }
  
  // Validate search path if provided
  if (searchPath) {
    const pathValidation = validatePathWithinBase(vaultPath, searchPath);
    assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: searchPath }));
  }
  
  // I/O: Get files
  const searchPattern = searchPath 
    ? path.join(vaultPath, searchPath, '**/*.md')
    : path.join(vaultPath, '**/*.md');
  const files = await glob(searchPattern);
  
  // Process files with pure functions
  const fileTitleMatches = [];
  
  for (const file of files) {
    try {
      // I/O: Check file size
      const stats = await stat(file);
      const sizeValidation = validateFileSizePure(stats.size, config.limits.maxFileSize);
      
      if (!sizeValidation.valid) {
        continue; // Skip large files
      }
      
      // I/O: Read file
      const content = await readFile(file, 'utf-8');
      
      // Pure: Extract title
      const titleInfo = extractH1Title(content);
      
      if (titleInfo && titleMatchesQuery(titleInfo.title, query, caseSensitive)) {
        fileTitleMatches.push({ file, titleInfo });
      }
    } catch (error) {
      // Skip files with read errors
      continue;
    }
  }
  
  // Pure: Transform results
  return transformTitleResults(fileTitleMatches, vaultPath);
}

/**
 * List notes in vault (I/O function)
 */
export async function listNotes(vaultPath, directory) {
  // Validate directory path if provided
  if (directory) {
    const pathValidation = validatePathWithinBase(vaultPath, directory);
    assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: directory }));
  }
  
  const searchPath = directory 
    ? path.join(vaultPath, directory, '**/*.md')
    : path.join(vaultPath, '**/*.md');
  
  const files = await glob(searchPath);
  const notes = files.map(file => path.relative(vaultPath, file)).sort();
  
  return {
    notes,
    count: notes.length
  };
}

/**
 * Read note content (I/O function with validation)
 */
export async function readNote(vaultPath, notePath) {
  // Pure validations
  const paramValidation = validateRequiredParameters({ path: notePath }, ['path']);
  assertValid(paramValidation, (msg) => Errors.invalidParams(msg));
  
  const extensionValidation = validateMarkdownExtension(notePath);
  assertValid(extensionValidation, (msg) => Errors.invalidParams(msg, { path: notePath }));
  
  const pathValidation = validatePathWithinBase(vaultPath, notePath);
  assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: notePath }));
  
  const fullPath = pathValidation.resolvedPath;
  
  // I/O: Check file exists and size
  try {
    await access(fullPath, constants.R_OK);
    const stats = await stat(fullPath);
    const sizeValidation = validateFileSizePure(stats.size, config.limits.maxFileSize);
    assertValid(sizeValidation, (msg, data) => 
      Errors.invalidParams(msg, { path: notePath, ...data })
    );
  } catch (error) {
    if (error instanceof MCPError) {
      throw error;
    }
    throw Errors.resourceNotFound(notePath, { path: notePath });
  }
  
  // I/O: Read file
  try {
    const content = await readFile(fullPath, 'utf-8');
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw Errors.resourceNotFound(notePath, { path: notePath });
    }
    throw Errors.internalError(`Failed to read note: ${error.message}`, { path: notePath });
  }
}

/**
 * Write note content (I/O function with validation)
 */
export async function writeNote(vaultPath, notePath, content) {
  // Pure validations
  const paramValidation = validateRequiredParameters({ path: notePath, content }, ['path', 'content']);
  assertValid(paramValidation, (msg) => Errors.invalidParams(msg));
  
  const extensionValidation = validateMarkdownExtension(notePath);
  assertValid(extensionValidation, (msg) => Errors.invalidParams(msg, { path: notePath }));
  
  const pathValidation = validatePathWithinBase(vaultPath, notePath);
  assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: notePath }));
  
  const fullPath = pathValidation.resolvedPath;
  const dir = path.dirname(fullPath);
  
  // Pure: Sanitize content
  const sanitizedContent = sanitizeContentPure(content);
  
  // I/O: Write file
  try {
    await mkdir(dir, { recursive: true });
    await writeFile(fullPath, sanitizedContent, 'utf-8');
    return notePath;
  } catch (error) {
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      throw Errors.accessDenied(`Permission denied: ${notePath}`, { path: notePath });
    }
    throw Errors.internalError(`Failed to write note: ${error.message}`, { path: notePath });
  }
}

/**
 * Delete note (I/O function with validation)
 */
export async function deleteNote(vaultPath, notePath) {
  // Pure validations
  const paramValidation = validateRequiredParameters({ path: notePath }, ['path']);
  assertValid(paramValidation, (msg) => Errors.invalidParams(msg));
  
  const extensionValidation = validateMarkdownExtension(notePath);
  assertValid(extensionValidation, (msg) => Errors.invalidParams(msg, { path: notePath }));
  
  const pathValidation = validatePathWithinBase(vaultPath, notePath);
  assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: notePath }));
  
  const fullPath = pathValidation.resolvedPath;
  
  // I/O: Check file exists
  try {
    await access(fullPath, constants.W_OK);
  } catch (error) {
    throw Errors.resourceNotFound(notePath, { path: notePath });
  }
  
  // I/O: Delete file
  try {
    await unlink(fullPath);
    return notePath;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw Errors.resourceNotFound(notePath, { path: notePath });
    }
    if (error.code === 'EACCES' || error.code === 'EPERM') {
      throw Errors.accessDenied(`Permission denied: ${notePath}`, { path: notePath });
    }
    throw Errors.internalError(`Failed to delete note: ${error.message}`, { path: notePath });
  }
}

/**
 * Search notes by tags (I/O function using pure functions)
 */
export async function searchByTags(vaultPath, searchTags, directory = null, caseSensitive = false) {
  // Validate directory path if provided
  if (directory) {
    const pathValidation = validatePathWithinBase(vaultPath, directory);
    assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: directory }));
  }
  
  const searchPattern = directory 
    ? path.join(vaultPath, directory, '**/*.md')
    : path.join(vaultPath, '**/*.md');
  
  const files = await glob(searchPattern);
  const results = [];
  
  for (const file of files) {
    try {
      // I/O: Read file
      const content = await readFile(file, 'utf-8');
      
      // Pure: Extract tags and check match
      const fileTags = extractTagsPure(content);
      
      if (hasAllTags(fileTags, searchTags, caseSensitive)) {
        results.push({
          path: path.relative(vaultPath, file),
          tags: fileTags
        });
      }
    } catch (error) {
      // Skip files with read errors
      continue;
    }
  }
  
  return {
    notes: results,
    count: results.length
  };
}

/**
 * Get metadata for a note or multiple notes (I/O function using pure functions)
 */
export async function getNoteMetadata(vaultPath, notePath, options = {}) {
  const { batch = false } = options;
  
  // Validate that we have either a path or batch mode
  if (!notePath && !batch) {
    throw Errors.invalidParams('Either path or batch mode must be specified');
  }
  
  // Single note mode
  if (notePath && !batch) {
    // Validate path
    const pathValidation = validatePathWithinBase(vaultPath, notePath);
    assertValid(pathValidation, (msg) => Errors.accessDenied(msg, { path: notePath }));
    
    const extensionValidation = validateMarkdownExtension(notePath);
    assertValid(extensionValidation, (msg) => Errors.invalidParams(msg, { path: notePath }));
    
    const fullPath = path.join(vaultPath, notePath);
    
    // I/O: Check file size
    const stats = await stat(fullPath);
    const sizeValidation = validateFileSizePure(stats.size, config.limits.maxFileSize);
    assertValid(sizeValidation, (msg, data) => 
      Errors.invalidParams(msg, { path: notePath, ...data }));
    
    // I/O: Read file
    const content = await readFile(fullPath, 'utf-8');
    
    // Pure: Extract metadata
    return extractNoteMetadata(content, notePath);
  }
  
  // Batch mode
  const searchPattern = notePath 
    ? path.join(vaultPath, notePath, '**/*.md')
    : path.join(vaultPath, '**/*.md');
  
  // I/O: Get files
  const files = await glob(searchPattern);
  
  // Process files
  const metadataResults = [];
  
  for (const file of files) {
    try {
      // I/O: Check file size
      const stats = await stat(file);
      const sizeValidation = validateFileSizePure(stats.size, config.limits.maxFileSize);
      
      if (!sizeValidation.valid) {
        metadataResults.push({
          file,
          error: new Error(sizeValidation.error)
        });
        continue;
      }
      
      // I/O: Read file
      const content = await readFile(file, 'utf-8');
      
      // Pure: Extract metadata
      const metadata = extractNoteMetadata(content, path.relative(vaultPath, file));
      metadataResults.push({ file, metadata });
    } catch (error) {
      metadataResults.push({ file, error });
    }
  }
  
  // Pure: Transform results
  return transformBatchMetadata(metadataResults, vaultPath);
}

// Re-export the pure extractTags function for backward compatibility
export const extractTags = extractTagsPure;
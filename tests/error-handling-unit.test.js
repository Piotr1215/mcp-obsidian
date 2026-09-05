import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPError, Errors, ErrorCodes } from '../src/errors.js';
import { readNote, writeNote } from '../src/tools.js';
import fs from 'fs/promises';

// Mock fs/promises
vi.mock('fs/promises');

describe('Error Handling Unit Tests', () => {
  describe('MCPError class', () => {
    it('should create error with code and message', () => {
      const error = new MCPError(-32602, 'Invalid params');
      expect(error.code).toBe(-32602);
      expect(error.message).toBe('Invalid params');
      expect(error.data).toBeUndefined();
    });

    it('should create error with data', () => {
      const error = new MCPError(-32002, 'Not found', { path: 'test.md' });
      expect(error.code).toBe(-32002);
      expect(error.message).toBe('Not found');
      expect(error.data).toEqual({ path: 'test.md' });
    });

    it('should serialize to JSON correctly', () => {
      const error = new MCPError(-32603, 'Internal error', { details: 'test' });
      const json = error.toJSON();
      expect(json).toEqual({
        code: -32603,
        message: 'Internal error',
        data: { details: 'test' }
      });
    });
  });

  describe('Error factory functions', () => {
    it('should create invalid params error', () => {
      const error = Errors.invalidParams('Missing required field', { field: 'path' });
      expect(error.code).toBe(ErrorCodes.INVALID_PARAMS);
      expect(error.message).toBe('Missing required field');
      expect(error.data).toEqual({ field: 'path' });
    });

    it('should create resource not found error', () => {
      const error = Errors.resourceNotFound('test.md', { path: 'test.md' });
      expect(error.code).toBe(ErrorCodes.RESOURCE_NOT_FOUND);
      expect(error.message).toBe('Resource not found: test.md');
    });

    it('should create tool not found error', () => {
      const error = Errors.toolNotFound('unknown-tool');
      expect(error.code).toBe(ErrorCodes.INVALID_PARAMS);
      expect(error.message).toBe('Unknown tool: unknown-tool');
    });
  });

  // Asserted through the tools the server exposes, not through a parallel
  // validation layer. tools.js does its own throwing via assertValid, so a test
  // against a separate wrapper proved nothing about what actually ships: the
  // wrapper could have been deleted with these green, which is what happened.
  // Path and extension checks are pure and run before any fs call, so these hold
  // with fs/promises mocked.
  describe('Security validation, through the shipped tool path', () => {
    // The traversal path has to end in .md. readNote checks the extension first,
    // so '../etc/passwd' comes back as "not markdown" and never reaches the path
    // check at all. Asserting traversal on a non-markdown path tests the wrong
    // guard and passes for the wrong reason.
    it('refuses a markdown path that escapes the vault', async () => {
      await expect(readNote('/vault', '../outside.md'))
        .rejects.toMatchObject({ code: ErrorCodes.RESOURCE_ACCESS_DENIED });
    });

    it('rejects a non-markdown path on the extension check, before the path check', async () => {
      await expect(readNote('/vault', '../etc/passwd'))
        .rejects.toMatchObject({ code: ErrorCodes.INVALID_PARAMS });
    });

    it('refuses a non-markdown target', async () => {
      await expect(writeNote('/vault', 'test.txt', 'content'))
        .rejects.toMatchObject({ code: ErrorCodes.INVALID_PARAMS });
    });

    it('raises MCPError, not a bare Error, so the code survives to the client', async () => {
      await expect(readNote('/vault', '../outside.md')).rejects.toThrow(MCPError);
    });
  });

  describe('Tool error handling', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('should throw resource not found error for missing file', async () => {
      fs.access.mockRejectedValue(new Error('ENOENT'));
      
      await expect(readNote('/vault', 'missing.md')).rejects.toThrow(MCPError);
      
      try {
        await readNote('/vault', 'missing.md');
      } catch (error) {
        expect(error.code).toBe(ErrorCodes.RESOURCE_NOT_FOUND);
        expect(error.data).toEqual({ path: 'missing.md' });
      }
    });

    it('should throw access denied for permission errors', async () => {
      fs.mkdir.mockResolvedValue();
      fs.writeFile.mockRejectedValue({ code: 'EACCES' });
      
      await expect(writeNote('/vault', 'test.md', 'content')).rejects.toThrow(MCPError);
      
      try {
        await writeNote('/vault', 'test.md', 'content');
      } catch (error) {
        expect(error.code).toBe(ErrorCodes.RESOURCE_ACCESS_DENIED);
        expect(error.message).toMatch(/permission denied/i);
      }
    });

    it('should throw invalid params for missing parameters', async () => {
      await expect(readNote('/vault', null)).rejects.toThrow(MCPError);
      
      try {
        await readNote('/vault', null);
      } catch (error) {
        expect(error.code).toBe(ErrorCodes.INVALID_PARAMS);
        expect(error.message).toMatch(/required parameter.*path/i);
      }
    });
  });
});
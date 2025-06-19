import { describe, it, expect } from 'vitest';
import {
  validatePathWithinBase,
  validateMarkdownExtension,
  validateRequiredParameters,
  validateFileSize,
  formatFileSize,
  sanitizeContent
} from '../src/validation.js';

describe('Functional Validation Utilities', () => {
  describe('validatePathWithinBase', () => {
    const basePath = '/test/vault';

    it('should validate paths within base', () => {
      const testCases = [
        { path: 'note.md', expected: true },
        { path: 'folder/note.md', expected: true },
        { path: './note.md', expected: true },
        { path: 'a/b/c/d.md', expected: true }
      ];

      testCases.forEach(({ path, expected }) => {
        const result = validatePathWithinBase(basePath, path);
        expect(result.valid).toBe(expected);
        if (expected) {
          expect(result.resolvedPath).toBeDefined();
        }
      });
    });

    it('should reject path traversal attempts', () => {
      const maliciousPaths = [
        '../etc/passwd',
        '../../etc/passwd',
        'folder/../../etc/passwd',
        './../../../etc/passwd'
      ];

      maliciousPaths.forEach(path => {
        const result = validatePathWithinBase(basePath, path);
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/traversal/i);
      });
    });

    it('should reject absolute paths outside base', () => {
      const result = validatePathWithinBase(basePath, '/etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/outside/i);
    });

    it('should accept absolute paths within base', () => {
      const result = validatePathWithinBase(basePath, '/test/vault/note.md');
      expect(result.valid).toBe(true);
    });

    it('should handle empty inputs', () => {
      expect(validatePathWithinBase('', 'path').valid).toBe(false);
      expect(validatePathWithinBase('base', '').valid).toBe(true); // Empty path means base directory
      expect(validatePathWithinBase(null, 'path').valid).toBe(false);
    });
  });

  describe('validateMarkdownExtension', () => {
    it('should accept markdown files', () => {
      const validFiles = [
        'note.md',
        'UPPERCASE.MD',
        'folder/note.md',
        'file.test.md'
      ];

      validFiles.forEach(file => {
        const result = validateMarkdownExtension(file);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject non-markdown files', () => {
      const invalidFiles = [
        'note.txt',
        'note.doc',
        'note',
        'note.md.txt'
      ];

      invalidFiles.forEach(file => {
        const result = validateMarkdownExtension(file);
        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/markdown/i);
      });
    });

    it('should handle empty input', () => {
      const result = validateMarkdownExtension('');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateRequiredParameters', () => {
    it('should validate when all required params present', () => {
      const params = { name: 'test', value: 123, flag: true };
      const result = validateRequiredParameters(params, ['name', 'value']);
      
      expect(result.valid).toBe(true);
    });

    it('should reject when params missing', () => {
      const params = { name: 'test' };
      const result = validateRequiredParameters(params, ['name', 'missing']);
      
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/missing.*missing/i);
      expect(result.missingParam).toBe('missing');
    });

    it('should reject null and undefined values', () => {
      const params = { name: null, value: undefined };
      
      expect(validateRequiredParameters(params, ['name']).valid).toBe(false);
      expect(validateRequiredParameters(params, ['value']).valid).toBe(false);
    });

    it('should accept zero and empty string', () => {
      const params = { zero: 0, empty: '' };
      const result = validateRequiredParameters(params, ['zero', 'empty']);
      
      expect(result.valid).toBe(true);
    });

    it('should handle invalid params object', () => {
      expect(validateRequiredParameters(null, ['x']).valid).toBe(false);
      expect(validateRequiredParameters('not object', ['x']).valid).toBe(false);
    });
  });

  describe('validateFileSize', () => {
    const MB = 1024 * 1024;

    it('should accept files within limit', () => {
      const result = validateFileSize(5 * MB, 10 * MB);
      expect(result.valid).toBe(true);
    });

    it('should reject files over limit', () => {
      const result = validateFileSize(15 * MB, 10 * MB);
      
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/too large/i);
      expect(result.size).toBe(15 * MB);
      expect(result.maxSize).toBe(10 * MB);
    });

    it('should handle edge cases', () => {
      expect(validateFileSize(10 * MB, 10 * MB).valid).toBe(true);
      expect(validateFileSize(0, 10 * MB).valid).toBe(true);
    });

    it('should reject invalid sizes', () => {
      expect(validateFileSize(-1, 10 * MB).valid).toBe(false);
      expect(validateFileSize('not a number', 10 * MB).valid).toBe(false);
      expect(validateFileSize(null, 10 * MB).valid).toBe(false);
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(500)).toBe('500.00 B');
      expect(formatFileSize(1024)).toBe('1.00 KB');
      expect(formatFileSize(1536)).toBe('1.50 KB');
      expect(formatFileSize(1048576)).toBe('1.00 MB');
      expect(formatFileSize(1073741824)).toBe('1.00 GB');
    });

    it('should handle edge cases', () => {
      expect(formatFileSize(0)).toBe('0.00 B');
      expect(formatFileSize(1023)).toBe('1023.00 B');
      expect(formatFileSize(1025)).toBe('1.00 KB');
    });

    it('should handle invalid input', () => {
      expect(formatFileSize(-1)).toBe('Invalid size');
      expect(formatFileSize('not a number')).toBe('Invalid size');
      expect(formatFileSize(null)).toBe('Invalid size');
    });
  });

  describe('sanitizeContent', () => {
    it('should remove null bytes', () => {
      expect(sanitizeContent('Hello\0World')).toBe('HelloWorld');
      expect(sanitizeContent('\0\0Test\0\0')).toBe('Test');
    });

    it('should preserve normal content', () => {
      const content = 'Normal content\nwith lines\tand tabs';
      expect(sanitizeContent(content)).toBe(content);
    });

    it('should handle empty and invalid input', () => {
      expect(sanitizeContent('')).toBe('');
      expect(sanitizeContent(null)).toBe('');
      expect(sanitizeContent(undefined)).toBe('');
      expect(sanitizeContent(123)).toBe('');
    });
  });
});
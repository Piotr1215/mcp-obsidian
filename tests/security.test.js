import { describe, it, expect, beforeEach } from 'vitest';
import { validatePath, validateMarkdownFile, validateRequiredParams, sanitizeContent } from '../src/security.js';
import { MCPError, ErrorCodes } from '../src/errors.js';
import path from 'path';

describe('Security Module', () => {
  const vaultPath = '/test/vault';

  describe('validatePath', () => {
    it('should allow paths within vault', () => {
      const testCases = [
        'note.md',
        'folder/note.md',
        'deep/nested/folder/note.md',
        './note.md',
        'folder/../folder/note.md'
      ];

      testCases.forEach(testPath => {
        const result = validatePath(vaultPath, testPath);
        expect(result).toMatch(/^\/test\/vault/);
      });
    });

    it('should prevent path traversal attacks', () => {
      const maliciousPaths = [
        '../etc/passwd',
        '../../etc/passwd',
        '../../../etc/passwd',
        'folder/../../etc/passwd',
        '/etc/passwd',
        'folder/../../../etc/passwd',
        './../../../etc/passwd',
        'valid/../../../../../../etc/passwd'
      ];
      
      // Add Windows-style paths only on Windows
      if (process.platform === 'win32') {
        maliciousPaths.push('..\\etc\\passwd');
      }

      maliciousPaths.forEach(maliciousPath => {
        try {
          const result = validatePath(vaultPath, maliciousPath);
          // If we get here, the validation failed to catch the malicious path
          throw new Error(`Path validation should have failed for: ${maliciousPath}, but got: ${result}`);
        } catch (error) {
          if (!(error instanceof MCPError)) {
            throw error;
          }
          // We expect an MCPError to be thrown
          expect(error).toBeInstanceOf(MCPError);
          expect(error.code).toBe(ErrorCodes.RESOURCE_ACCESS_DENIED);
          expect(error.message).toMatch(/path traversal/i);
          expect(error.data.path).toBe(maliciousPath);
        }
      });
    });

    it('should handle absolute paths correctly', () => {
      // Absolute path within vault should work
      const absoluteWithinVault = path.join(vaultPath, 'note.md');
      const result = validatePath(vaultPath, absoluteWithinVault);
      expect(result).toBe(absoluteWithinVault);

      // Absolute path outside vault should fail
      expect(() => validatePath(vaultPath, '/etc/passwd')).toThrow(MCPError);
    });

    it('should handle edge cases', () => {
      // Empty path should resolve to vault root
      const result = validatePath(vaultPath, '');
      expect(result).toBe(path.resolve(vaultPath));

      // Single dot should resolve to vault root
      const dotResult = validatePath(vaultPath, '.');
      expect(dotResult).toBe(path.resolve(vaultPath));
    });
  });

  describe('validateMarkdownFile', () => {
    it('should accept markdown files', () => {
      const validFiles = [
        'note.md',
        'folder/note.md',
        'UPPERCASE.MD',
        'note.test.md',
        'note-with-dashes.md',
        'note_with_underscores.md'
      ];

      validFiles.forEach(file => {
        expect(() => validateMarkdownFile(file)).not.toThrow();
      });
    });

    it('should reject non-markdown files', () => {
      const invalidFiles = [
        'note.txt',
        'note.doc',
        'note.pdf',
        'note.md.txt',
        'note',
        'note.markdown', // Only .md is supported
        '.gitignore',
        'folder/file.txt'
      ];

      invalidFiles.forEach(file => {
        expect(() => validateMarkdownFile(file)).toThrow(MCPError);
        
        try {
          validateMarkdownFile(file);
        } catch (error) {
          expect(error.code).toBe(ErrorCodes.INVALID_PARAMS);
          expect(error.message).toMatch(/markdown files/i);
          expect(error.data.path).toBe(file);
        }
      });
    });
  });

  describe('validateRequiredParams', () => {
    it('should pass when all required params are present', () => {
      const params = {
        name: 'test',
        value: 123,
        flag: true,
        zero: 0,
        empty: ''
      };

      expect(() => validateRequiredParams(params, ['name', 'value', 'flag'])).not.toThrow();
      expect(() => validateRequiredParams(params, ['zero', 'empty'])).not.toThrow();
    });

    it('should throw when required params are missing', () => {
      const params = {
        name: 'test',
        value: undefined,
        nullValue: null
      };

      expect(() => validateRequiredParams(params, ['missing'])).toThrow(MCPError);
      expect(() => validateRequiredParams(params, ['value'])).toThrow(MCPError);
      expect(() => validateRequiredParams(params, ['nullValue'])).toThrow(MCPError);

      try {
        validateRequiredParams(params, ['name', 'missing']);
      } catch (error) {
        expect(error.code).toBe(ErrorCodes.INVALID_PARAMS);
        expect(error.message).toMatch(/required parameter.*missing/i);
        expect(error.data.missingParam).toBe('missing');
      }
    });
  });

  describe('sanitizeContent', () => {
    it('should remove null bytes', () => {
      const content = 'Hello\0World\0!';
      const sanitized = sanitizeContent(content);
      expect(sanitized).toBe('HelloWorld!');
    });

    it('should preserve normal content', () => {
      const content = `# Heading
      
This is normal content with:
- Special chars: !@#$%^&*()
- Unicode: 你好世界 🌍
- Line breaks and tabs\t

\`\`\`code
function test() { return true; }
\`\`\``;

      const sanitized = sanitizeContent(content);
      expect(sanitized).toBe(content);
    });

    it('should handle empty content', () => {
      expect(sanitizeContent('')).toBe('');
    });
  });
});
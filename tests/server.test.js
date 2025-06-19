import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServer } from '../src/server.js';

describe('Server module', () => {
  let server;
  const mockVaultPath = '/test/vault';

  beforeEach(() => {
    server = createServer(mockVaultPath);
  });

  describe('createServer', () => {
    it('should create server with correct metadata', () => {
      expect(server._serverInfo.name).toBe('obsidian-mcp-filesystem');
      expect(server._serverInfo.version).toBe('0.1.0');
    });

    it('should have tools capability', () => {
      expect(server._options.capabilities.tools).toBeDefined();
    });

    it('should return a valid server instance', () => {
      expect(server).toBeDefined();
      expect(server.connect).toBeDefined();
      expect(server.setRequestHandler).toBeDefined();
    });
  });
});
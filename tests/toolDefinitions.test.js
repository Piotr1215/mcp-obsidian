import { describe, it, expect } from 'vitest';
import { toolDefinitions } from '../src/toolDefinitions.js';

describe('Tool Definitions', () => {
  it('should have all required tool names', () => {
    const toolNames = toolDefinitions.map(t => t.name);
    expect(toolNames).toContain('search-vault');
    expect(toolNames).toContain('search-by-title');
    expect(toolNames).toContain('list-notes');
    expect(toolNames).toContain('read-note');
    expect(toolNames).toContain('write-note');
    expect(toolNames).toContain('delete-note');
    expect(toolNames).toContain('search-by-tags');
    expect(toolNames).toContain('get-note-metadata');
  });

  it('should have valid schemas for all tools', () => {
    toolDefinitions.forEach(tool => {
      expect(tool).toHaveProperty('name');
      expect(tool).toHaveProperty('description');
      expect(tool).toHaveProperty('inputSchema');
      expect(tool.inputSchema).toHaveProperty('type', 'object');
      expect(tool.inputSchema).toHaveProperty('properties');
    });
  });

  it('should have required fields defined correctly', () => {
    const searchTool = toolDefinitions.find(t => t.name === 'search-vault');
    expect(searchTool.inputSchema.required).toEqual(['query']);

    const readTool = toolDefinitions.find(t => t.name === 'read-note');
    expect(readTool.inputSchema.required).toEqual(['path']);

    const writeTool = toolDefinitions.find(t => t.name === 'write-note');
    expect(writeTool.inputSchema.required).toEqual(['path', 'content']);

    const deleteTool = toolDefinitions.find(t => t.name === 'delete-note');
    expect(deleteTool.inputSchema.required).toEqual(['path']);

    const listTool = toolDefinitions.find(t => t.name === 'list-notes');
    expect(listTool.inputSchema.required).toBeUndefined();

    const tagSearchTool = toolDefinitions.find(t => t.name === 'search-by-tags');
    expect(tagSearchTool.inputSchema.required).toEqual(['tags']);
    
    const titleSearchTool = toolDefinitions.find(t => t.name === 'search-by-title');
    expect(titleSearchTool.inputSchema.required).toEqual(['query']);
  });
});
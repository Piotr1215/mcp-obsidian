import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * The shipped entrypoint over real stdio, the way Claude Code and Codex run
 * it: list the tools, then make several calls in a row on one connection.
 */

const entry = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'index.js');

describe('stdio client against src/index.js', () => {
  let root;
  let client;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'obsidian-stdio-'));
    await mkdir(join(root, 'Sub'), { recursive: true });
    await writeFile(join(root, 'Plan.md'), '# Plan\n\nalpha line #shared\n');
    await writeFile(join(root, 'Sub', 'Other.md'), '# Other\n\nbeta\n');
    client = new Client({ name: 'stdio-test', version: '1.0.0' });
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [entry, root] }));
  });

  afterAll(async () => {
    await client?.close();
    await rm(root, { recursive: true, force: true });
  });

  it('lists ten annotated tools and serves instructions', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(10);
    const byName = Object.fromEntries(tools.map(t => [t.name, t.annotations]));
    for (const name of ['search-vault', 'search-by-title', 'list-notes', 'read-note', 'search-by-tags', 'get-note-metadata', 'discover-mocs']) {
      expect(byName[name]).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    }
    expect(byName['write-note'].destructiveHint).toBe(true);
    expect(byName['append-note'].idempotentHint).toBe(false);
    expect(byName['delete-note'].destructiveHint).toBe(true);
    expect(client.getInstructions().length).toBeLessThan(600);
    expect(client.getInstructions()).toMatch(/vault-relative/i);
  });

  it('answers consecutive calls with text equal to JSON.stringify(structuredContent)', async () => {
    const calls = [
      ['list-notes', {}],
      ['read-note', { path: 'Plan.md' }],
      ['search-vault', { query: 'alpha' }],
      ['write-note', { path: 'New.md', content: '# New\n' }],
      ['read-note', { path: 'New.md' }],
      ['search-by-tags', { tags: ['shared'] }],
    ];
    for (const [name, args] of calls) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError, name).toBeFalsy();
      expect(result.content[0].text, name).toBe(JSON.stringify(result.structuredContent));
    }
  });

  it('reports a failed call as isError and keeps serving', async () => {
    const failed = await client.callTool({ name: 'read-note', arguments: { path: 'Missing.md' } });
    expect(failed.isError).toBe(true);
    const next = await client.callTool({ name: 'list-notes', arguments: {} });
    expect(next.isError).toBeFalsy();
    expect(next.structuredContent.notes).toContain('Plan.md');
  });
});

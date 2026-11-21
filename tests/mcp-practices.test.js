import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

/**
 * Current MCP practice, checked through a real SDK client over a temporary
 * vault: annotations, one JSON payload in text and structuredContent, bounded
 * results, execution failures as isError, and server instructions.
 */

const READS = ['search-vault', 'search-by-title', 'list-notes', 'read-note', 'search-by-tags', 'get-note-metadata', 'discover-mocs'];

describe('MCP practices through an SDK client', () => {
  let root;
  let client;

  const call = (name, args = {}) => client.callTool({ name, arguments: args });
  const parsed = (result) => JSON.parse(result.content[0].text);

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'obsidian-practices-'));
    const files = {
      'Plan.md': '---\ntags: [shared]\n---\n# Plan\n\nalpha line\nbeta line\n',
      'Index.md': '---\ntags: moc\n---\n# Index\n\n- [[Plan]]\n',
      'Big.md': 'line of text\n'.repeat(10000),
      'Quotes.md': '"\n'.repeat(60000),
    };
    for (let i = 0; i < 5; i++) {
      files[`Tagged/T${i}.md`] = `# T${i}\n\n#bulk\n`;
      files[`Mocs/M${i}.md`] = `---\ntags: moc\n---\n# M${i}\n\n[[Plan]]\n`;
    }
    for (const [file, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), content);
    }

    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(root).connect(serverSide);
    client = new Client({ name: 'practices-test', version: '1.0.0' });
    await client.connect(clientSide);
    await client.listTools();
  });

  afterAll(async () => {
    await client?.close();
    await rm(root, { recursive: true, force: true });
  });

  describe('annotations', () => {
    it.each(READS)('%s is read-only and closed-world', async (name) => {
      const { tools } = await client.listTools();
      const tool = tools.find(t => t.name === name);
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, openWorldHint: false });
    });

    it('marks write-note as a destructive, idempotent overwrite', async () => {
      const { tools } = await client.listTools();
      expect(tools.find(t => t.name === 'write-note').annotations)
        .toEqual({ readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false });
    });

    it('marks append-note as additive and not idempotent', async () => {
      const { tools } = await client.listTools();
      expect(tools.find(t => t.name === 'append-note').annotations)
        .toEqual({ readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false });
    });

    it('marks delete-note as destructive', async () => {
      const { tools } = await client.listTools();
      expect(tools.find(t => t.name === 'delete-note').annotations)
        .toEqual({ readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false });
    });

    it('annotates every tool', async () => {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(10);
      for (const tool of tools) expect(tool.annotations).toBeDefined();
    });
  });

  describe('instructions', () => {
    it('are short and cover paths, search before read and delete confirmation', () => {
      const text = client.getInstructions();
      expect(text.length).toBeGreaterThan(0);
      expect(text.length).toBeLessThan(600);
      expect(text).toMatch(/vault-relative/i);
      expect(text).toMatch(/search/i);
      expect(text).toMatch(/elicitation/i);
      expect(text).toMatch(/delete/i);
    });
  });

  describe('one payload in text and structuredContent', () => {
    const CALLS = [
      ['search-vault', { query: 'alpha' }],
      ['search-by-title', { query: 'plan' }],
      ['list-notes', {}],
      ['read-note', { path: 'Plan.md' }],
      ['search-by-tags', { tags: ['shared'] }],
      ['get-note-metadata', { path: 'Plan.md' }],
      ['discover-mocs', {}],
      ['write-note', { path: 'Out/Written.md', content: '# Written\n' }],
      ['append-note', { path: 'Out/Written.md', content: 'more' }],
      ['delete-note', { path: 'Out/Written.md' }],
    ];

    it.each(CALLS)('%s text is exactly JSON.stringify(structuredContent)', async (name, args) => {
      const result = await call(name, args);
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toBeDefined();
      expect(result.content).toHaveLength(1);
      expect(result.content[0].text).toBe(JSON.stringify(result.structuredContent));
    });

    it('read-note returns the content as a field', async () => {
      const result = await call('read-note', { path: 'Plan.md' });
      expect(result.structuredContent.content).toContain('alpha line');
      expect(result.structuredContent.truncated).toBe(false);
    });
  });

  describe('paging hints live in structuredContent', () => {
    it('list-notes reports the next offset', async () => {
      const { structuredContent } = await call('list-notes', { limit: 2 });
      expect(structuredContent.pagination.hasMore).toBe(true);
      expect(structuredContent.pagination.nextOffset).toBe(2);
      expect(structuredContent.pagination.total).toBeGreaterThan(2);
    });

    it('reports a null next offset on the last page', async () => {
      const { structuredContent } = await call('list-notes', { limit: 500 });
      expect(structuredContent.pagination.hasMore).toBe(false);
      expect(structuredContent.pagination.nextOffset).toBeNull();
    });

    it('search-by-tags pages with limit and offset', async () => {
      const first = (await call('search-by-tags', { tags: ['bulk'], limit: 2 })).structuredContent;
      expect(first.notes).toHaveLength(2);
      expect(first.pagination).toMatchObject({ total: 5, returned: 2, limit: 2, offset: 0, hasMore: true, nextOffset: 2 });
      const rest = (await call('search-by-tags', { tags: ['bulk'], limit: 2, offset: first.pagination.nextOffset })).structuredContent;
      expect(rest.notes[0].path).not.toBe(first.notes[0].path);
      expect(rest.pagination.offset).toBe(2);
    });

    it('discover-mocs pages with limit and offset', async () => {
      const first = (await call('discover-mocs', { limit: 2 })).structuredContent;
      expect(first.mocs).toHaveLength(2);
      expect(first.pagination).toMatchObject({ returned: 2, limit: 2, hasMore: true, nextOffset: 2 });
      expect(first.pagination.total).toBeGreaterThanOrEqual(6);
    });

    it('applies a default limit to search-by-tags and discover-mocs', async () => {
      expect((await call('search-by-tags', { tags: ['bulk'] })).structuredContent.pagination.limit).toBe(100);
      expect((await call('discover-mocs', {})).structuredContent.pagination.limit).toBeGreaterThan(0);
    });
  });

  describe('bounds', () => {
    it('caps read-note below 45,000 characters and marks the truncation', async () => {
      const result = await call('read-note', { path: 'Big.md' });
      const data = result.structuredContent;
      expect(result.content[0].text.length).toBeLessThan(45000);
      expect(data.truncated).toBe(true);
      expect(data.total).toBe(130000);
      expect(data.nextOffset).toBe(data.content.length);
      expect(data.notice).toMatch(/offset=\d+/);
    });

    it('keeps the serialized text under the cap for escape-heavy content', async () => {
      const result = await call('read-note', { path: 'Quotes.md' });
      expect(result.content[0].text.length).toBeLessThan(45000);
      expect(result.structuredContent.truncated).toBe(true);
    });

    it('reads the rest of a note by following nextOffset', async () => {
      const original = await readFile(join(root, 'Big.md'), 'utf-8');
      let offset = 0;
      let rebuilt = '';
      for (let i = 0; i < 20; i++) {
        const { structuredContent } = await call('read-note', { path: 'Big.md', offset });
        rebuilt += structuredContent.content;
        if (!structuredContent.truncated) break;
        offset = structuredContent.nextOffset;
      }
      expect(rebuilt).toBe(original);
    });

    it('does not truncate a small note', async () => {
      const { structuredContent } = await call('read-note', { path: 'Plan.md' });
      expect(structuredContent.truncated).toBe(false);
      expect(structuredContent.nextOffset).toBeNull();
    });

    it('clamps limit to 1..max and offset to >= 0, as integers', async () => {
      expect((await call('list-notes', { limit: 0 })).structuredContent.pagination.limit).toBe(1);
      expect((await call('list-notes', { limit: -7 })).structuredContent.pagination.limit).toBe(1);
      expect((await call('list-notes', { limit: 99999 })).structuredContent.pagination.limit).toBe(1000);
      expect((await call('list-notes', { limit: 2.9 })).structuredContent.pagination.limit).toBe(2);
      expect((await call('list-notes', { offset: -3 })).structuredContent.pagination.offset).toBe(0);
      expect((await call('list-notes', { offset: 1.5 })).structuredContent.pagination.offset).toBe(1);
      expect((await call('search-vault', { query: 'alpha', limit: 99999 })).structuredContent.pagination.limit).toBe(500);
      expect((await call('search-by-tags', { tags: ['bulk'], limit: 99999 })).structuredContent.pagination.limit).toBe(500);
      expect((await call('search-by-tags', { tags: ['bulk'], offset: -1 })).structuredContent.pagination.offset).toBe(0);
      expect((await call('get-note-metadata', { batch: true, limit: 99999 })).structuredContent.pagination.limit).toBe(500);
    });

    it('clamps read-note offset into the note', async () => {
      const low = (await call('read-note', { path: 'Plan.md', offset: -5 })).structuredContent;
      expect(low.offset).toBe(0);
      const high = (await call('read-note', { path: 'Plan.md', offset: 10 ** 9 })).structuredContent;
      expect(high.content).toBe('');
      expect(high.truncated).toBe(false);
    });
  });

  describe('errors', () => {
    it('reports a missing note as isError with a recovery message', async () => {
      const result = await call('read-note', { path: 'Nope.md' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/not found/i);
      expect(result.content[0].text).toMatch(/list-notes|search-by-title/);
    });

    it('reports a path outside the vault as isError', async () => {
      const result = await call('read-note', { path: '../outside.md' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/vault-relative|inside the vault/i);
    });

    it('reports a non-markdown path as isError', async () => {
      const result = await call('write-note', { path: 'x.txt', content: 'a' });
      expect(result.isError).toBe(true);
    });

    it('reports a missing required argument as isError', async () => {
      const result = await call('read-note', {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/path/);
    });

    it('reports a wrongly typed argument as isError', async () => {
      const a = await call('search-vault', { query: 123 });
      expect(a.isError).toBe(true);
      const b = await call('list-notes', { limit: 'lots' });
      expect(b.isError).toBe(true);
      expect(b.content[0].text).toMatch(/limit/);
      const c = await call('search-by-tags', { tags: 'shared' });
      expect(c.isError).toBe(true);
    });

    it('reports a missing section as isError', async () => {
      const result = await call('append-note', { path: 'Plan.md', content: 'x', section: 'No such heading' });
      expect(result.isError).toBe(true);
    });

    it('answers a call without arguments with isError, not a crash', async () => {
      const result = await client.callTool({ name: 'read-note' });
      expect(result.isError).toBe(true);
    });

    it('keeps an unknown tool a JSON-RPC protocol error', async () => {
      await expect(call('no-such-tool')).rejects.toMatchObject({ code: -32602 });
    });
  });
});

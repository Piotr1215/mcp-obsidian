import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';

/**
 * An SDK client checks structuredContent against the tool's outputSchema once
 * it has listed the tools, and rejects a result that does not match. Every
 * search-vault result failed that check: the server strips context.lines to
 * save tokens while the schema still required it. Tests that call the
 * handler directly never list the tools, so they never saw it.
 */

const CALLS = [
  ['search-vault', { query: 'alpha' }],
  ['search-vault', { query: 'alpha OR beta' }],
  ['search-vault', { query: 'title:Plan' }],
  ['search-vault', { query: 'alpha', includeContext: false }],
  ['search-by-title', { query: 'plan' }],
  ['list-notes', {}],
  ['search-by-tags', { tags: ['shared'] }],
  ['get-note-metadata', { path: 'Plan.md' }],
  ['get-note-metadata', { batch: true }],
  ['discover-mocs', {}]
];

describe('structured results an SDK client validates', () => {
  let root;
  let client;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'obsidian-schema-'));
    const files = {
      'Plan.md': '---\ntags: [shared]\n---\n# Plan\n\nalpha line\nbeta line\n',
      'Notes/Other.md': '# Other\n\nbeta #shared\n',
      'Index.md': '---\ntags: moc\n---\n# Index\n\n- [[Plan]]\n- [[Other]]\n'
    };
    for (const [file, content] of Object.entries(files)) {
      await mkdir(dirname(join(root, file)), { recursive: true });
      await writeFile(join(root, file), content);
    }

    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(root).connect(serverSide);
    client = new Client({ name: 'schema-test', version: '1.0.0' });
    await client.connect(clientSide);
    await client.listTools();
  });

  afterAll(async () => {
    await client?.close();
    await rm(root, { recursive: true, force: true });
  });

  it.each(CALLS)('%s %j matches its output schema', async (name, args) => {
    const result = await client.callTool({ name, arguments: args });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toBeDefined();
  });

  it('keeps the highlighted snippet in search-vault context', async () => {
    const { structuredContent } = await client.callTool({ name: 'search-vault', arguments: { query: 'alpha' } });

    expect(structuredContent.files[0].matches[0].context).toEqual({ highlighted: '**alpha** line' });
  });
});

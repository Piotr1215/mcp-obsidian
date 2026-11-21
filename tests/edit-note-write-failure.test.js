import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

// A disk that fails every write, on a real temporary vault: the failure must
// come back as an isError result and the note must keep its text.
vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, writeFile: vi.fn(async (...args) => {
    if (globalThis.__failWrites) {
      throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' });
    }
    return actual.writeFile(...args);
  }) };
});

const { createServer } = await import('../src/server.js');

describe('edit-note when the disk write fails', () => {
  let root;
  let client;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'obsidian-wfail-'));
    await writeFile(join(root, 'N.md'), 'keep this');
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(root).connect(serverSide);
    client = new Client({ name: 'wfail-test', version: '1.0.0' });
    await client.connect(clientSide);
    globalThis.__failWrites = true;
  });

  afterEach(async () => {
    globalThis.__failWrites = false;
    await client.close();
    await rm(root, { recursive: true, force: true });
  });

  it('returns isError and leaves the note as it was', async () => {
    const result = await client.callTool({ name: 'edit-note', arguments: { path: 'N.md', oldText: 'keep', newText: 'lose' } });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/Failed to edit note/);
    expect(await readFile(join(root, 'N.md'), 'utf-8')).toBe('keep this');
  });
});

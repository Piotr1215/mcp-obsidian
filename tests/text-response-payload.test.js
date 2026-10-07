import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createServer } from '../src/server.js';

/**
 * What a client without `structuredContent` support actually sees.
 *
 * This is the gap that let #18 sit for months. The suite had five files
 * touching list-notes and none of them read the text payload: server-e2e
 * falls back to a dummy handler when it cannot reach the real one, and
 * mcp-integration registers its own mock and asserts against that, so both
 * stayed green while the real handler returned a bare count.
 *
 * So this drives the real tools/call handler over a real vault on disk. No
 * mocked fs, no mocked tools, no substitute handler. If the notes stop
 * reaching content[].text, this fails.
 */

const callTool = (server, name, args) =>
  server._requestHandlers.get('tools/call')(
    { method: 'tools/call', params: { name, arguments: args } },
    { signal: new AbortController().signal }
  );

const textOf = (response) =>
  response.content.filter(c => c.type === 'text').map(c => c.text).join('\n');

describe('the text payload clients without structuredContent read', () => {
  let vault;

  beforeAll(async () => {
    vault = await mkdtemp(join(tmpdir(), 'obsidian-text-payload-'));
    await mkdir(join(vault, 'AI', 'Memory'), { recursive: true });
    await writeFile(join(vault, 'AI', 'Memory', 'Alpha.md'), '# Alpha\n');
    await writeFile(join(vault, 'AI', 'Memory', 'Beta.md'), '# Beta\n');
    await writeFile(join(vault, 'Gamma.md'), '# Gamma\n');
  });

  afterAll(async () => {
    await rm(vault, { recursive: true, force: true });
  });

  it('names every note in the text, not just how many there are', async () => {
    const response = await callTool(createServer(vault), 'list-notes', {});
    const text = textOf(response);

    expect(text).toContain('AI/Memory/Alpha.md');
    expect(text).toContain('AI/Memory/Beta.md');
    expect(text).toContain('Gamma.md');
  });

  it('still carries the count, so the list did not replace the summary', async () => {
    const text = textOf(await callTool(createServer(vault), 'list-notes', {}));
    expect(text).toMatch(/Showing 3 of 3 notes/);
  });

  it('scopes to a directory without dropping the paths', async () => {
    const text = textOf(await callTool(createServer(vault), 'list-notes', { directory: 'AI/Memory' }));

    expect(text).toContain('AI/Memory/Alpha.md');
    expect(text).not.toContain('Gamma.md');
  });

  // The pagination hint is appended after the note list. It has to survive
  // that, or a paging client is told the total and never told how to get
  // the rest.
  it('keeps the paging hint reachable when the list is truncated', async () => {
    const text = textOf(await callTool(createServer(vault), 'list-notes', { limit: 2, offset: 0 }));

    expect(text).toMatch(/Showing 2 of 3 notes/);
    expect(text).toContain('offset=2');
    expect(text).toContain('AI/Memory/Alpha.md');
  });

  it('says so plainly when the vault has nothing to list', async () => {
    const empty = await mkdtemp(join(tmpdir(), 'obsidian-empty-'));
    try {
      const text = textOf(await callTool(createServer(empty), 'list-notes', {}));
      expect(text).toMatch(/No notes found/);
    } finally {
      await rm(empty, { recursive: true, force: true });
    }
  });

  // discover-mocs is the precedent list-notes was brought in line with. If it
  // ever regresses the same way, the fix above stops being the pattern.
  it('holds for discover-mocs too, which already did this', async () => {
    const response = await callTool(createServer(vault), 'discover-mocs', {});
    expect(textOf(response).length).toBeGreaterThan(0);
  });
});

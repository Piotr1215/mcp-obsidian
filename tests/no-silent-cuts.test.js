import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm, mkdir, chmod } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { editNote } from '../src/tools.js';

/**
 * A long note must never lose text its writer did not see. read-note pages
 * long notes and hosts cut results too, so write-note only creates and
 * edit-note changes exactly one quoted span. Temporary vault only.
 */

describe('notes cannot be cut', () => {
  let root;
  let client;
  const call = (name, args) => client.callTool({ name, arguments: args });
  const big = () => Array.from({ length: 5000 }, (_, i) => `line ${String(i).padStart(5, '0')} of the note`).join('\n') + '\nTHE END\n';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'obsidian-nocut-'));
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await createServer(root).connect(serverSide);
    client = new Client({ name: 'nocut-test', version: '1.0.0' });
    await client.connect(clientSide);
  });

  afterEach(async () => {
    await client.close();
    await rm(root, { recursive: true, force: true });
  });

  describe('write-note', () => {
    it('creates a new note', async () => {
      const result = await call('write-note', { path: 'Fresh.md', content: '# Fresh\n' });
      expect(result.isError).toBeFalsy();
      expect(await readFile(join(root, 'Fresh.md'), 'utf-8')).toBe('# Fresh\n');
    });

    it('refuses an existing note, names the recovery tools and leaves the bytes alone', async () => {
      const original = 'original body\n';
      await writeFile(join(root, 'Keep.md'), original);
      const result = await call('write-note', { path: 'Keep.md', content: 'replacement' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain(`Keep.md already exists (${original.length} characters)`);
      expect(result.content[0].text).toMatch(/edit-note/);
      expect(result.content[0].text).toMatch(/append-note/);
      expect(await readFile(join(root, 'Keep.md'), 'utf-8')).toBe(original);
    });

    it('cannot write back a first page of a 100,000 character note', async () => {
      const text = 'x'.repeat(99) + '\n';
      const original = text.repeat(1000);
      expect(original.length).toBe(100000);
      await writeFile(join(root, 'Long.md'), original);
      const page = (await call('read-note', { path: 'Long.md' })).structuredContent;
      expect(page.truncated).toBe(true);
      expect(page.content.length).toBeLessThan(original.length);

      const result = await call('write-note', { path: 'Long.md', content: page.content });
      expect(result.isError).toBe(true);
      expect(await readFile(join(root, 'Long.md'), 'utf-8')).toBe(original);
    });
  });

  describe('edit-note', () => {
    beforeEach(() => writeFile(join(root, 'E.md'), 'alpha\nbeta\nbeta two\n'));

    it('replaces text that occurs exactly once', async () => {
      const result = await call('edit-note', { path: 'E.md', oldText: 'alpha', newText: 'ALPHA!' });
      expect(result.isError).toBeFalsy();
      expect(result.structuredContent).toEqual({ path: 'E.md', previousLength: 20, newLength: 21 });
      expect(result.content[0].text).toBe(JSON.stringify(result.structuredContent));
      expect(await readFile(join(root, 'E.md'), 'utf-8')).toBe('ALPHA!\nbeta\nbeta two\n');
    });

    it('treats $ patterns in newText literally', async () => {
      await call('edit-note', { path: 'E.md', oldText: 'alpha', newText: "$& $1 $'" });
      expect(await readFile(join(root, 'E.md'), 'utf-8')).toBe("$& $1 $'\nbeta\nbeta two\n");
    });

    it('errors on zero matches and writes nothing', async () => {
      const result = await call('edit-note', { path: 'E.md', oldText: 'alpha ', newText: 'x' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/read-note/);
      expect(result.content[0].text).toMatch(/whitespace/);
      expect(await readFile(join(root, 'E.md'), 'utf-8')).toBe('alpha\nbeta\nbeta two\n');
    });

    it('errors on two matches, gives the count and writes nothing', async () => {
      const result = await call('edit-note', { path: 'E.md', oldText: 'beta', newText: 'x' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/2 times/);
      expect(result.content[0].text).toMatch(/surrounding text/);
      expect(await readFile(join(root, 'E.md'), 'utf-8')).toBe('alpha\nbeta\nbeta two\n');
    });

    it('counts overlapping matches as ambiguous', async () => {
      await writeFile(join(root, 'O.md'), 'aaa');
      const result = await call('edit-note', { path: 'O.md', oldText: 'aa', newText: 'b' });
      expect(result.isError).toBe(true);
      expect(await readFile(join(root, 'O.md'), 'utf-8')).toBe('aaa');
    });

    it('rejects empty oldText', async () => {
      const result = await call('edit-note', { path: 'E.md', oldText: '', newText: 'x' });
      expect(result.isError).toBe(true);
      expect(await readFile(join(root, 'E.md'), 'utf-8')).toBe('alpha\nbeta\nbeta two\n');
    });

    it('names write-note for a missing note and creates nothing', async () => {
      const result = await call('edit-note', { path: 'Nope.md', oldText: 'a', newText: 'b' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/write-note/);
      const listed = await call('list-notes', {});
      expect(listed.structuredContent.notes).not.toContain('Nope.md');
    });

    it('stays inside the vault and on markdown paths', async () => {
      const outside = await call('edit-note', { path: '../outside.md', oldText: 'a', newText: 'b' });
      expect(outside.isError).toBe(true);
      const wrongExt = await call('edit-note', { path: 'E.txt', oldText: 'a', newText: 'b' });
      expect(wrongExt.isError).toBe(true);
    });

    it('changes only the quoted span of a 100,000 character note', async () => {
      const body = 'y'.repeat(99) + '\n';
      const original = body.repeat(500) + 'MARKER-ONE\n' + body.repeat(499) + 'THE TAIL\n';
      await writeFile(join(root, 'Big.md'), original);
      const oldText = 'MARKER-ONE';
      const newText = 'MARKER-ONE edited with more words';

      const result = await call('edit-note', { path: 'Big.md', oldText, newText });
      expect(result.isError).toBeFalsy();
      const after = await readFile(join(root, 'Big.md'), 'utf-8');
      expect(after).toBe(original.replace(oldText, () => newText));
      expect(after.endsWith('THE TAIL\n')).toBe(true);
      expect(result.structuredContent.previousLength).toBe(original.length);
      expect(result.structuredContent.newLength).toBe(original.length - oldText.length + newText.length);
      expect(result.structuredContent.newLength).toBe(after.length);
    });
  });

  describe('edit-note failure paths', () => {
    it('reports more than 1000 matches without counting them all', async () => {
      await writeFile(join(root, 'Many.md'), 'a'.repeat(1500));
      const result = await call('edit-note', { path: 'Many.md', oldText: 'a', newText: 'b' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/more than 1000 times/);
      expect(await readFile(join(root, 'Many.md'), 'utf-8')).toBe('a'.repeat(1500));
    });

    it('refuses a note over the size limit', async () => {
      await writeFile(join(root, 'Huge.md'), 'z'.repeat(10 * 1024 * 1024 + 1));
      const result = await call('edit-note', { path: 'Huge.md', oldText: 'z', newText: 'y' });
      expect(result.isError).toBe(true);
      expect((await readFile(join(root, 'Huge.md'), 'utf-8')).startsWith('zzz')).toBe(true);
    });

    it('reports a path that is not a readable file', async () => {
      await mkdir(join(root, 'Dir.md'));
      const result = await call('edit-note', { path: 'Dir.md', oldText: 'a', newText: 'b' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Failed to read note/);
    });

    it.skipIf(process.getuid?.() === 0)('reports a read-only note as permission denied and keeps it', async () => {
      await writeFile(join(root, 'Locked.md'), 'locked text');
      await chmod(join(root, 'Locked.md'), 0o444);
      const result = await call('edit-note', { path: 'Locked.md', oldText: 'locked', newText: 'open' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/Permission denied/);
      expect(await readFile(join(root, 'Locked.md'), 'utf-8')).toBe('locked text');
    });

    it('rejects empty or missing arguments before touching the note', async () => {
      await writeFile(join(root, 'Arg.md'), 'text');
      await expect(editNote(root, 'Arg.md', '', 'x')).rejects.toThrow(/non-empty/);
      await expect(editNote(root, 'Arg.md', 'text', null)).rejects.toThrow(/newText/);
      expect(await readFile(join(root, 'Arg.md'), 'utf-8')).toBe('text');
    });

    it('still answers the next call after a failed edit', async () => {
      await writeFile(join(root, 'Next.md'), 'one');
      expect((await call('edit-note', { path: 'Next.md', oldText: 'two', newText: 'x' })).isError).toBe(true);
      expect((await call('edit-note', { path: 'Next.md', oldText: 'one', newText: 'two' })).isError).toBeFalsy();
    });
  });

  it('prepending a section to a long note keeps every byte', async () => {
    const original = big();
    await writeFile(join(root, 'Releases.md'), original);
    const first = original.split('\n')[0];
    const result = await call('edit-note', { path: 'Releases.md', oldText: first, newText: `## new\n\n${first}` });
    expect(result.isError).toBeFalsy();
    expect(await readFile(join(root, 'Releases.md'), 'utf-8')).toBe(`## new\n\n${original}`);
  });
});

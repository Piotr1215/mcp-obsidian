import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { createServer } from '../src/server.js';
import { makeRelativePath } from '../src/validation.js';

/**
 * Issue #6: search found nothing on Windows. The server built glob patterns
 * by joining the vault path with "**\/*.md", and glob reads every backslash
 * in a pattern as an escape, so C:\Users\me\Vault\**\*.md matched nothing.
 * The same mistake broke any folder whose name glob reads as syntax: a vault
 * called "Notes [Work]" listed no notes on every OS. Folders now reach glob
 * as its working directory, never as part of the pattern.
 *
 * The Windows CI job runs this file on a real Windows file system.
 */

const callTool = (server, name, args) =>
  server._requestHandlers.get('tools/call')(
    { method: 'tools/call', params: { name, arguments: args } },
    { signal: new AbortController().signal }
  );

const structured = async (vault, name, args = {}) =>
  (await callTool(createServer(vault), name, args)).structuredContent;

// Paths come back with the platform's separator.
const native = (relative) => join(...relative.split('/'));

describe('a vault whose folder names look like glob syntax', () => {
  let root;
  let vault;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'obsidian-glob-'));
    vault = join(root, 'Notes [Work] {2026} (a+b)');
    const files = {
      'Plain.md': '# Plain\n\nalpha #shared\n',
      'Projects [A]/Plan.md': '# Plan\n\nalpha #shared\n',
      'Meetings/Standup [2026-10-07].md': '# Standup\n\nalpha\n',
      'Index.md': '---\ntags: moc\n---\n# Index\n\n- [[Plan]]\n'
    };
    for (const [file, content] of Object.entries(files)) {
      await mkdir(dirname(join(vault, file)), { recursive: true });
      await writeFile(join(vault, file), content);
    }
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('lists every note', async () => {
    const { notes } = await structured(vault, 'list-notes');

    expect(notes).toEqual([
      'Index.md',
      native('Meetings/Standup [2026-10-07].md'),
      'Plain.md',
      native('Projects [A]/Plan.md')
    ].sort());
  });

  it('lists a subfolder whose name looks like a character class', async () => {
    const { notes } = await structured(vault, 'list-notes', { directory: 'Projects [A]' });

    expect(notes).toEqual([native('Projects [A]/Plan.md')]);
  });

  it('returns search results relative to the vault', async () => {
    const { files } = await structured(vault, 'search-vault', { query: 'alpha' });

    expect(files.map(f => f.path).sort()).toEqual([
      native('Meetings/Standup [2026-10-07].md'),
      'Plain.md',
      native('Projects [A]/Plan.md')
    ].sort());
  });

  it('returns title matches relative to the vault', async () => {
    const { results } = await structured(vault, 'search-by-title', { query: 'plan' });

    expect(results).toEqual([{ file: native('Projects [A]/Plan.md'), title: 'Plan', line: 1 }]);
  });

  it('finds notes by tag', async () => {
    const { notes } = await structured(vault, 'search-by-tags', { tags: ['shared'] });

    expect(notes.map(n => n.path)).toEqual(['Plain.md', native('Projects [A]/Plan.md')]);
  });

  it('returns batch metadata paths relative to the vault', async () => {
    const { notes } = await structured(vault, 'get-note-metadata', { batch: true, path: 'Projects [A]' });

    expect(notes.map(n => n.path)).toEqual([native('Projects [A]/Plan.md')]);
  });

  it('discovers MOCs', async () => {
    const { mocs } = await structured(vault, 'discover-mocs');

    expect(mocs.map(m => m.path)).toEqual(['Index.md']);
  });

  it('reads a note by its bare name when the name looks like glob syntax', async () => {
    const response = await callTool(createServer(vault), 'read-note', { path: 'Standup [2026-10-07].md' });

    expect(response.isError).toBeFalsy();
    expect(response.content[0].text).toContain('# Standup');
  });
});

describe('makeRelativePath on Windows', () => {
  it.runIf(process.platform === 'win32')('makes a backslash path relative to its vault', () => {
    expect(makeRelativePath('C:\\Users\\me\\Vault\\sub\\a.md', 'C:\\Users\\me\\Vault')).toBe('sub\\a.md');
  });

  // path.relative returns an absolute path across drives; that is not inside the vault.
  it.runIf(process.platform === 'win32')('leaves a path on another drive unchanged', () => {
    expect(makeRelativePath('D:\\other\\a.md', 'C:\\Vault')).toBe('D:\\other\\a.md');
  });
});

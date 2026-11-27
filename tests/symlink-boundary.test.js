import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink, access } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createServer } from '../src/server.js';

/**
 * A symlink inside the vault must not lead the tools outside it. The path
 * check was lexical, so key.md -> ~/.ssh/id_rsa read the key, setup.md ->
 * ~/.bashrc appended to or edited it, and a linked or dangling folder let notes be
 * written and deleted anywhere the server could reach. Links that stay inside
 * the vault, and a vault opened through a link, keep working.
 */

const callTool = (server, name, args) =>
  server._requestHandlers.get('tools/call')(
    { method: 'tools/call', params: { name, arguments: args } },
    { signal: new AbortController().signal }
  );

const exists = (p) => access(p).then(() => true, () => false);

const OUTSIDE = 'Path resolves outside vault directory';

// Windows needs Developer Mode or admin rights to create symlinks.
describe.skipIf(process.platform === 'win32')('symlinks at the vault boundary', () => {
  let root, vault, outside, server;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'obsidian-symlink-'));
    vault = join(root, 'vault');
    outside = join(root, 'outside');
    await mkdir(join(vault, 'shared'), { recursive: true });
    await mkdir(outside);

    await writeFile(join(outside, 'id_rsa'), 'SECRET_KEY\n');
    await writeFile(join(outside, 'bashrc'), '# shell rc\n');
    await writeFile(join(outside, 'victim.md'), 'KEEP_ME\n');
    await writeFile(join(outside, 'private.md'), '# Private\nSECRET_NOTE #private\n');
    await writeFile(join(vault, 'welcome.md'), '# Welcome\n');
    await writeFile(join(vault, 'real.md'), '# Real\nIN_VAULT\n');

    await symlink(join(vault, 'real.md'), join(vault, 'alias.md'));
    await symlink(join(outside, 'id_rsa'), join(vault, 'shared', 'key.md'));
    await symlink(join(outside, 'bashrc'), join(vault, 'shared', 'setup.md'));
    await symlink(outside, join(vault, 'shared', 'archive'));
    await symlink(join(outside, 'created.sh'), join(vault, 'shared', 'new.md'));
    await symlink(join(outside, 'nowhere'), join(vault, 'shared', 'gone'));
    await symlink(vault, join(root, 'linked-vault'));
    await symlink(join(vault, 'loop.md'), join(vault, 'loop.md'));

    server = createServer(vault);
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it.each([
    ['read-note', { path: 'shared/key.md' }],
    ['append-note', { path: 'shared/setup.md', content: 'echo APPENDED' }],
    ['edit-note', { path: 'shared/setup.md', oldText: '# shell rc', newText: 'echo EDITED' }],
    ['edit-note', { path: 'shared/archive/victim.md', oldText: 'KEEP_ME', newText: 'EDITED' }],
    ['write-note', { path: 'shared/archive/planted.md', content: 'PLANTED' }],
    ['write-note', { path: 'shared/new.md', content: 'echo CREATED' }],
    ['write-note', { path: 'shared/gone/deep/note.md', content: 'CREATED' }],
    ['delete-note', { path: 'shared/archive/victim.md' }],
    ['get-note-metadata', { path: 'shared/archive/private.md' }],
    ['search-vault', { query: 'SECRET', path: 'shared/archive' }],
    ['list-notes', { directory: 'shared/archive' }]
  ])('%s refuses %j', async (tool, args) => {
    const result = await callTool(server, tool, args);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(OUTSIDE);
  });

  it('leaves every file outside the vault as it was', async () => {
    expect(await readFile(join(outside, 'bashrc'), 'utf-8')).toBe('# shell rc\n');
    expect(await readFile(join(outside, 'victim.md'), 'utf-8')).toBe('KEEP_ME\n');
    expect(await exists(join(outside, 'planted.md'))).toBe(false);
    expect(await exists(join(outside, 'created.sh'))).toBe(false);
    expect(await exists(join(outside, 'nowhere'))).toBe(false);
  });

  it('keeps notes linked from outside out of search results', async () => {
    const response = await callTool(server, 'search-vault', { query: 'SECRET' });

    expect(response.structuredContent.files).toEqual([]);
  });

  it('keeps notes linked from outside, and a link loop, out of the note list', async () => {
    const response = await callTool(server, 'list-notes', {});

    expect(response.structuredContent.notes).toEqual(['alias.md', 'real.md', 'welcome.md']);
  });

  it('does not find a note linked from outside by its file name', async () => {
    const result = await callTool(server, 'read-note', { path: 'key.md' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Resource not found: key.md');
  });

  it('still reads a link that stays inside the vault', async () => {
    const result = await callTool(server, 'read-note', { path: 'alias.md' });

    expect(result.structuredContent.content).toBe('# Real\nIN_VAULT\n');
  });

  it('still works when the vault itself is opened through a link', async () => {
    const linked = createServer(join(root, 'linked-vault'));

    const read = await callTool(linked, 'read-note', { path: 'welcome.md' });
    const write = await callTool(linked, 'write-note', { path: 'new/folder/note.md', content: 'NEW' });

    expect(read.structuredContent.content).toBe('# Welcome\n');
    expect(write.isError).toBeFalsy();
    expect(await readFile(join(vault, 'new', 'folder', 'note.md'), 'utf-8')).toBe('NEW');
  });
});

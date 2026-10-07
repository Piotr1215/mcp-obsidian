import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, chmod } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createServer } from '../src/server.js';
import { expandHomePath, describeVaultError, assertVaultReadable } from '../src/vault.js';

/**
 * Issue #9: a vault the server cannot read came back as zero notes. glob
 * treats an unreadable directory as an empty one, so a missing path, an
 * unexpanded ~ and a macOS privacy denial (EPERM on iCloud Drive) all looked
 * like an empty vault, with nothing telling the user what to fix.
 */

const callTool = (server, name, args) =>
  server._requestHandlers.get('tools/call')(
    { method: 'tools/call', params: { name, arguments: args } },
    { signal: new AbortController().signal }
  );

const textOf = (response) =>
  response.content.filter(c => c.type === 'text').map(c => c.text).join('\n');

// Every tool that walks the vault goes through the same readability check.
const VAULT_WIDE_TOOLS = [
  ['list-notes', {}],
  ['search-vault', { query: 'anything' }],
  ['search-by-title', { query: 'anything' }],
  ['search-by-tags', { tags: ['anything'] }],
  ['get-note-metadata', { batch: true }],
  ['discover-mocs', {}]
];

describe('expandHomePath', () => {
  it.each([
    ['~', '/home/me'],
    ['~/vault', join('/home/me', 'vault')],
    ['~/Library/Mobile Documents/com~apple~CloudDocs/Vault', join('/home/me', 'Library/Mobile Documents/com~apple~CloudDocs/Vault')],
    ['/abs/vault', '/abs/vault'],
    ['relative/vault', 'relative/vault'],
    ['~other/vault', '~other/vault'],
    ['/path/with/~/inside', '/path/with/~/inside']
  ])('expands %s to %s', (input, expected) => {
    expect(expandHomePath(input, '/home/me')).toBe(expected);
  });
});

describe('describeVaultError', () => {
  const failure = (code) => Object.assign(new Error(`${code}: failed`), { code });

  it('says a missing vault is missing and that the path is taken as written', () => {
    expect(describeVaultError('/v', failure('ENOENT'))).toBe(
      'Vault not found at "/v". Check the vault path the server was started with; ' +
      'MCP clients pass it as written, without expanding environment variables.'
    );
  });

  it('says a file is not a vault folder', () => {
    expect(describeVaultError('/v.md', failure('ENOTDIR'))).toBe(
      'Vault path "/v.md" is a file, not a folder. Start the server with the vault folder.'
    );
  });

  it.each(['EACCES', 'EPERM'])('names the macOS privacy setting for %s', (code) => {
    const message = describeVaultError('/v', failure(code));

    expect(message).toContain(`Cannot read the vault at "/v" (${code}).`);
    expect(message).toContain('System Settings > Privacy & Security > Files and Folders, or Full Disk Access');
  });

  it('passes any other failure through with its own message', () => {
    expect(describeVaultError('/v', failure('EIO'))).toBe('Cannot read the vault at "/v": EIO: failed');
  });
});

describe('assertVaultReadable', () => {
  it('keeps the OS code and the path on the error it throws', async () => {
    const missing = join(tmpdir(), 'obsidian-no-such-vault-' + process.pid);

    await expect(assertVaultReadable(missing)).rejects.toMatchObject({ code: 'ENOENT', path: missing });
  });
});

describe('a vault the server cannot read', () => {
  let root;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'obsidian-unreadable-'));
    await writeFile(join(root, 'not-a-folder.md'), '# A file\n');
    await mkdir(join(root, 'locked'));
    await writeFile(join(root, 'locked', 'Secret.md'), '# Secret\n');
    await chmod(join(root, 'locked'), 0o000);
    await mkdir(join(root, 'empty'));
  });

  afterAll(async () => {
    await chmod(join(root, 'locked'), 0o755);
    await rm(root, { recursive: true, force: true });
  });

  it.each(VAULT_WIDE_TOOLS)('%s reports a missing vault as an error, not as no notes', async (tool, args) => {
    const response = await callTool(createServer(join(root, 'missing')), tool, args);

    expect(response.isError).toBe(true);
    expect(textOf(response)).toContain(`Vault not found at "${join(root, 'missing')}"`);
  });

  it('reports a file passed as the vault', async () => {
    const response = await callTool(createServer(join(root, 'not-a-folder.md')), 'list-notes', {});

    expect(response.isError).toBe(true);
    expect(textOf(response)).toContain('is a file, not a folder');
  });

  // root can read a mode 000 directory, and Windows ignores the mode, so the
  // denial only happens unprivileged on POSIX.
  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)('reports a folder it may not open, with the OS code', async () => {
    const response = await callTool(createServer(join(root, 'locked')), 'list-notes', {});

    expect(response.isError).toBe(true);
    expect(textOf(response)).toContain(`Cannot read the vault at "${join(root, 'locked')}" (EACCES)`);
  });

  it('still reports a readable empty vault as empty, not as an error', async () => {
    const response = await callTool(createServer(join(root, 'empty')), 'list-notes', {});

    expect(response.isError).toBeFalsy();
    expect(response.structuredContent.notes).toEqual([]);
  });
});

describe('the server started with a ~ vault path', () => {
  let home;
  let client;

  beforeAll(async () => {
    home = await mkdtemp(join(tmpdir(), 'obsidian-home-'));
    await mkdir(join(home, 'Vault'));
    await writeFile(join(home, 'Vault', 'Alpha.md'), '# Alpha\n');

    // The client starts the server the way an MCP config does: no shell, so
    // nothing expands the ~ before the server sees it.
    client = new Client({ name: 'vault-test', version: '1.0.0' });
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL('../src/index.js', import.meta.url)), '~/Vault'],
      // os.homedir() reads HOME on POSIX and USERPROFILE on Windows
      env: { ...process.env, HOME: home, USERPROFILE: home }
    }));
  });

  afterAll(async () => {
    await client?.close();
    await rm(home, { recursive: true, force: true });
  });

  it('reads the vault under the home directory', async () => {
    const result = await client.callTool({ name: 'list-notes', arguments: {} });

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent.notes).toEqual(['Alpha.md']);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createServer } from '../src/server.js';

/**
 * Optional features are negotiated when the client connects, and delete-note
 * has to behave correctly for three different kinds of client. These drive the
 * real tools/call and tools/list handlers over a real vault, because the thing
 * being tested is precisely the wiring between the negotiated feature, the tool
 * description and the delete: mocking any of those three tests the mock.
 */

const call = (server, name, args) =>
  server._requestHandlers.get('tools/call')(
    { method: 'tools/call', params: { name, arguments: args } },
    { signal: new AbortController().signal }
  );

const listTools = (server) =>
  server._requestHandlers.get('tools/list')(
    { method: 'tools/list', params: {} },
    { signal: new AbortController().signal }
  );

const deleteNoteDescription = async (server) =>
  (await listTools(server)).tools.find(t => t.name === 'delete-note').description;

/** Stand in for a connected client. `connect` is what fires oninitialized. */
function connect(vault, { capabilities, elicitInput }) {
  const server = createServer(vault);
  server.getClientCapabilities = () => capabilities;
  server.elicitInput = elicitInput;
  server.oninitialized();
  return server;
}

const never = () => { throw new Error('elicitInput must not be called'); };
const instantly = (action) => async () => ({ action });
const afterAWhile = (action) => () =>
  new Promise(resolve => setTimeout(() => resolve({ action }), 550));

describe('optional feature negotiation for delete-note', () => {
  let vault;

  beforeEach(async () => {
    vault = await mkdtemp(join(tmpdir(), 'obsidian-negotiation-'));
    await writeFile(join(vault, 'note.md'), '# A note\n');
  });

  afterEach(async () => {
    await rm(vault, { recursive: true, force: true });
  });

  describe('a client that cannot be asked', () => {
    const client = { capabilities: { roots: {} }, elicitInput: never };

    it('deletes the way it did before the feature existed', async () => {
      const server = connect(vault, client);

      const result = await call(server, 'delete-note', { path: 'note.md' });

      expect(result.content[0].text).toMatch(/deleted successfully/);
      expect(existsSync(join(vault, 'note.md'))).toBe(false);
    });

    it('does not promise a confirmation it cannot deliver', async () => {
      const description = await deleteNoteDescription(connect(vault, client));

      expect(description).not.toMatch(/asked to confirm/);
      expect(description).toMatch(/cannot be undone/);
    });
  });

  describe('a client that advertises elicitation and answers it itself', () => {
    // Codex 0.153.4: advertises {"elicitation":{"form":{},"url":{}}}, then
    // returns decline in milliseconds having rendered nothing. Indistinguishable
    // from a client that never advertised, so it is treated as one.
    const client = {
      capabilities: { elicitation: { form: {}, url: {} } },
      elicitInput: instantly('decline'),
    };

    it('deletes rather than dead-ending forever', async () => {
      const server = connect(vault, client);

      const result = await call(server, 'delete-note', { path: 'note.md' });

      expect(result.content[0].text).toMatch(/deleted successfully/);
      expect(existsSync(join(vault, 'note.md'))).toBe(false);
    });

    it('stops asking on later calls once the client has proved it cannot', async () => {
      const server = connect(vault, client);
      await call(server, 'delete-note', { path: 'note.md' });

      await writeFile(join(vault, 'second.md'), '# Second\n');
      server.elicitInput = never;

      const result = await call(server, 'delete-note', { path: 'second.md' });
      expect(result.content[0].text).toMatch(/deleted successfully/);
    });
  });

  describe('a client where a person is actually asked', () => {
    const declining = {
      capabilities: { elicitation: {} },
      elicitInput: afterAWhile('decline'),
    };

    it('keeps the note when the person refuses', async () => {
      const server = connect(vault, declining);

      const result = await call(server, 'delete-note', { path: 'note.md' });

      expect(result.content[0].text).toMatch(/NOT deleted/);
      expect(existsSync(join(vault, 'note.md'))).toBe(true);
    });

    it('says a confirmation is coming, because one is', async () => {
      const description = await deleteNoteDescription(connect(vault, declining));
      expect(description).toMatch(/asked to confirm/);
    });

    it('deletes when the person agrees', async () => {
      const server = connect(vault, {
        capabilities: { elicitation: {} },
        elicitInput: () => new Promise(resolve =>
          setTimeout(() => resolve({ action: 'accept', content: { confirm: true } }), 550)),
      });

      const result = await call(server, 'delete-note', { path: 'note.md' });

      expect(result.content[0].text).toMatch(/deleted successfully/);
      expect(existsSync(join(vault, 'note.md'))).toBe(false);
    });
  });

  // Nothing negotiated yet: a call before initialize must not throw on a null
  // feature, and must not silently skip a confirmation it would have loaded.
  it('does not break when no client has connected', async () => {
    const server = createServer(vault);

    const result = await call(server, 'delete-note', { path: 'note.md' });

    expect(result.content[0].text).toMatch(/deleted successfully/);
  });
});

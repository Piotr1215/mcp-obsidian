import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { createDeleteConfirmer, describeNote } from '../src/confirm.js';

/**
 * The two ways this gate is useless: opening for a client that could have been
 * asked, and closing for one that never could. Both are covered, along with the
 * preview, which is the whole reason to ask a human rather than trust the
 * argument the model supplied.
 */

const elicitingClient = (elicitInput) => ({
  getClientCapabilities: () => ({ elicitation: {} }),
  elicitInput
});

describe('createDeleteConfirmer', () => {
  it('returns no gate when the client cannot be asked', () => {
    const server = { getClientCapabilities: () => ({ roots: {} }), elicitInput: vi.fn() };
    expect(createDeleteConfirmer(server)).toBeNull();
  });

  it('returns no gate when the client advertises nothing at all', () => {
    const server = { getClientCapabilities: () => undefined, elicitInput: vi.fn() };
    expect(createDeleteConfirmer(server)).toBeNull();
  });

  it('returns no gate when confirmation is switched off', () => {
    const server = elicitingClient(vi.fn());
    expect(createDeleteConfirmer(server, { enabled: false })).toBeNull();
  });

  it('confirms when the human accepts and ticks the box', async () => {
    const elicit = vi.fn().mockResolvedValue({ action: 'accept', content: { confirm: true } });
    const confirm = createDeleteConfirmer(elicitingClient(elicit));

    await expect(confirm({ notePath: 'a.md', fullPath: '/nope/a.md' }))
      .resolves.toEqual({ confirmed: true, reason: 'confirmed' });
  });

  it('keeps the note when the human accepts but leaves the box unticked', async () => {
    const elicit = vi.fn().mockResolvedValue({ action: 'accept', content: { confirm: false } });
    const confirm = createDeleteConfirmer(elicitingClient(elicit));

    const result = await confirm({ notePath: 'a.md', fullPath: '/nope/a.md' });
    expect(result.confirmed).toBe(false);
  });

  it.each(['decline', 'cancel'])('keeps the note on %s', async (action) => {
    const elicit = vi.fn().mockResolvedValue({ action });
    const confirm = createDeleteConfirmer(elicitingClient(elicit));

    const result = await confirm({ notePath: 'a.md', fullPath: '/nope/a.md' });
    expect(result.confirmed).toBe(false);
    expect(result.reason).toContain(action);
  });

  // Fails closed on purpose. The client said it could be asked, so a timeout or
  // a dead transport is a failure to reach the human, not a client that never
  // could, and an unanswered prompt must not become a deletion.
  it('keeps the note when the request never gets an answer', async () => {
    const elicit = vi.fn().mockRejectedValue(new Error('Request timed out'));
    const confirm = createDeleteConfirmer(elicitingClient(elicit));

    const result = await confirm({ notePath: 'a.md', fullPath: '/nope/a.md' });
    expect(result.confirmed).toBe(false);
    expect(result.reason).toContain('Request timed out');
  });

  it('asks for a single boolean, which is what the client renders', async () => {
    const elicit = vi.fn().mockResolvedValue({ action: 'accept', content: { confirm: true } });
    const confirm = createDeleteConfirmer(elicitingClient(elicit));

    await confirm({ notePath: 'a.md', fullPath: '/nope/a.md' });

    const [params] = elicit.mock.calls[0];
    expect(params.requestedSchema).toEqual({
      type: 'object',
      properties: {
        confirm: {
          type: 'boolean',
          title: 'Delete it',
          description: 'Permanent, the vault has no trash. Leave unchecked to keep the note.'
        }
      },
      required: ['confirm']
    });
  });
});

describe('the prompt describes the note on disk, not the argument', () => {
  let dir;
  let notePath;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'obsidian-confirm-'));
    notePath = join(dir, 'real.md');
    await writeFile(notePath, '\n\n# The real heading\n\nbody text\n');
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads size and the first non-empty line off disk', async () => {
    const lines = await describeNote(notePath);
    expect(lines[0]).toMatch(/^\d+(\.\d+)? (B|KB), modified \d{4}-\d{2}-\d{2}$/);
    expect(lines[1]).toBe('# The real heading');
  });

  it('says nothing rather than throwing when the note cannot be read', async () => {
    await expect(describeNote(join(dir, 'absent.md'))).resolves.toEqual([]);
  });

  it('puts the path and the on-disk preview in front of the human', async () => {
    const elicit = vi.fn().mockResolvedValue({ action: 'accept', content: { confirm: true } });
    const confirm = createDeleteConfirmer(elicitingClient(elicit));

    await confirm({ notePath: 'notes/real.md', fullPath: notePath });

    const [params] = elicit.mock.calls[0];
    expect(params.message).toContain('notes/real.md');
    expect(params.message).toContain('# The real heading');
  });

  // Claude Code shows roughly three lines of the message and hides the rest
  // behind "(+N more lines)". The identifying detail is the reason to ask a
  // human at all, so it must not be what gets hidden: no blank spacers, and the
  // warning lives in the field description, which renders in full.
  it('keeps the message inside what the client actually renders', async () => {
    const elicit = vi.fn().mockResolvedValue({ action: 'accept', content: { confirm: true } });
    const confirm = createDeleteConfirmer(elicitingClient(elicit));

    await confirm({ notePath: 'notes/real.md', fullPath: notePath });

    const [params] = elicit.mock.calls[0];
    const lines = params.message.split('\n');
    expect(lines.length).toBeLessThanOrEqual(3);
    expect(lines.every(l => l.trim().length > 0)).toBe(true);
    expect(params.requestedSchema.properties.confirm.description).toContain('no trash');
  });
});

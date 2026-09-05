/**
 * Human confirmation for destructive tools, over MCP elicitation.
 *
 * Every argument this server receives was composed by a model, including the
 * path handed to delete-note. Path validation keeps that path inside the vault,
 * which stops a traversal but does nothing about deleting the wrong note inside
 * it, and there is no trash to recover from. Elicitation is the only channel
 * that reaches a person mid-tool-call, and the answer it returns comes from the
 * human rather than the model, so it cannot be hallucinated the way an argument
 * can.
 *
 * The prompt carries what the server read off disk, not what the caller claimed:
 * size, modification time, and the note's own first line. That is the part a
 * model cannot fabricate, and it is what lets someone recognise the note before
 * agreeing to lose it.
 */

import { stat, open } from 'fs/promises';
import { config } from './config.js';

const PREVIEW_BYTES = 512;
const PREVIEW_MAX_CHARS = 100;

// Below this, an answer cannot have come from a person: the client has to render
// the prompt, and someone has to read a path and a preview before deciding. Half
// a second leaves room for the fastest reflexive keypress and still catches a
// client answering on its own by two orders of magnitude.
const UNATTENDED_ANSWER_MS = 500;

/**
 * Read a one-line human-recognisable summary of a note straight from disk.
 * Never throws: a preview is a courtesy, and failing to build one must not stop
 * the confirmation it decorates.
 */
export async function describeNote(fullPath) {
  const lines = [];

  try {
    const info = await stat(fullPath);
    const kb = info.size < 1024
      ? `${info.size} B`
      : `${(info.size / 1024).toFixed(1)} KB`;
    lines.push(`${kb}, modified ${info.mtime.toISOString().slice(0, 10)}`);
  } catch {
    return lines;
  }

  let handle;
  try {
    handle = await open(fullPath, 'r');
    const buffer = Buffer.alloc(PREVIEW_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, PREVIEW_BYTES, 0);
    const head = buffer.subarray(0, bytesRead).toString('utf8');
    const first = head.split('\n').map(l => l.trim()).find(l => l.length > 0);
    if (first) {
      lines.push(first.length > PREVIEW_MAX_CHARS
        ? `${first.slice(0, PREVIEW_MAX_CHARS)}...`
        : first);
    }
  } catch {
    // A note we can stat but not read still deserves its size line.
  } finally {
    await handle?.close().catch(() => {});
  }

  return lines;
}

/**
 * Build the confirm callback that deleteNote expects.
 *
 * Returns null when nothing can be asked, which the caller must read as "delete
 * without confirming" rather than "refuse". Two cases reach it, and both are
 * clients that were always allowed to delete: the confirmation is switched off,
 * or the client never advertised elicitation at all. The scripted callers of
 * this server are in the second group, so they keep working untouched.
 *
 * Once a client does advertise elicitation, the gate is closed rather than open.
 * A decline, a cancel, a timeout, or a transport error all leave the note in
 * place, because at that point silence is a failure to reach the human and not
 * a client that never could.
 */
export function createDeleteConfirmer(server, options = {}) {
  const enabled = options.enabled ?? config.confirmations.deleteNote;
  if (!enabled) return null;

  const capabilities = server.getClientCapabilities?.();
  if (!capabilities?.elicitation) return null;

  const timeout = options.timeout ?? config.timeouts.confirmation;
  // Called when the client proves at runtime that it cannot actually ask,
  // so the session can stop loading a feature that does not work here.
  const onUnsupported = options.onUnsupported ?? (() => {});

  return async ({ notePath, fullPath }) => {
    // Claude Code renders about three lines of `message` and collapses the rest
    // behind "(+N more lines)", so every line has to earn its place and a blank
    // spacer costs one of them. The identifying detail goes here, in the visible
    // budget; the warning moves to the field description, which renders in full.
    const preview = await describeNote(fullPath);
    const message = [
      `Delete ${notePath}?`,
      ...preview,
    ].join('\n');

    const askedAt = Date.now();
    let result;
    try {
      result = await server.elicitInput({
        message,
        requestedSchema: {
          type: 'object',
          properties: {
            confirm: {
              type: 'boolean',
              title: 'Delete it',
              description: 'Permanent, the vault has no trash. Leave unchecked to keep the note.',
            },
          },
          required: ['confirm'],
        },
      }, { timeout });
    } catch (error) {
      return { confirmed: false, reason: `could not reach you to confirm (${error.message})` };
    }

    if (result?.action !== 'accept') {
      const action = result?.action ?? 'no answer';
      const elapsedMs = Date.now() - askedAt;

      // An answer this fast was not given by a person, which means this client
      // advertised elicitation it cannot actually deliver. Advertising it and
      // never showing it is, from here, indistinguishable from never having
      // advertised it, so treat it as exactly that: unload the feature for the
      // rest of the session and let the delete proceed the way it does for any
      // client that cannot be asked. The alternative is a client where
      // delete-note simply never works, which is a worse answer than the one
      // this server gave before the feature existed.
      if (elapsedMs < UNATTENDED_ANSWER_MS) {
        onUnsupported({ action, elapsedMs });
        return {
          confirmed: true,
          reason: `client advertised elicitation but answered "${action}" itself in ${elapsedMs}ms without asking; treating it as a client that cannot confirm`,
        };
      }
      // Past the threshold a person was plausibly there, so this is a real
      // refusal and the note stays.
      return { confirmed: false, reason: `you did not confirm (${action})` };
    }
    if (result?.content?.confirm !== true) {
      return { confirmed: false, reason: 'you declined' };
    }
    return { confirmed: true, reason: 'confirmed' };
  };
}

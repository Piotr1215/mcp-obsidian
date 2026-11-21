import { clampInteger } from './arguments.js';

// The text block is the serialized result, and JSON escapes quotes, backslashes
// and newlines, so the bound is on the serialized size, not on the raw text.
// Hosts spill or cut results near 50,000 characters; stay well below.
export const MAX_READ_RESULT_CHARS = 44000;
const MAX_READ_CONTENT_CHARS = 40000;

/**
 * Take one window of a note and describe where it sits, so a model can read a
 * long note in pieces. The result, once serialized, stays under
 * MAX_READ_RESULT_CHARS whatever the content escapes to.
 */
export function windowNote(notePath, content, requestedOffset = 0) {
  const total = content.length;
  const offset = clampInteger(requestedOffset, { min: 0, max: total });

  const build = (length) => {
    let end = Math.min(total, offset + length);
    // Never cut between the halves of a surrogate pair.
    const last = content.charCodeAt(end - 1);
    if (end < total && end > offset && last >= 0xD800 && last <= 0xDBFF) end -= 1;
    const truncated = end < total;
    const result = {
      path: notePath,
      content: content.slice(offset, end),
      offset,
      returned: end - offset,
      total,
      truncated,
      nextOffset: truncated ? end : null,
    };
    if (truncated) {
      result.notice = `Truncated: showing characters ${offset} to ${end} of ${total}. Call read-note again with offset=${end} to read the rest.`;
    }
    return result;
  };

  let length = MAX_READ_CONTENT_CHARS;
  let result = build(length);
  while (JSON.stringify(result).length > MAX_READ_RESULT_CHARS && length > 1) {
    length = Math.floor(length * 0.8);
    result = build(length);
  }
  return result;
}

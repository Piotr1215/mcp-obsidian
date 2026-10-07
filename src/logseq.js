/**
 * Pure functions for the parts of a file-based Logseq graph that differ from
 * plain markdown. Logseq's database graphs keep pages in a database instead
 * of .md files, so nothing here applies to them.
 */

import path from 'path';

// A page property line: `key:: value`. Logseq lowercases the key.
const PROPERTY_LINE = /^([\p{L}\p{N}_-]+)::\s*(.*)$/u;

// Properties Logseq reads as comma-separated lists of page references.
const LIST_PROPERTIES = new Set(['tags', 'alias']);

/**
 * Splits a list property value into names, unwrapping [[page]] and #tag
 * @param {string} value - Raw value, e.g. "devops, [[service mesh]]"
 * @returns {string[]} Names without brackets or hash
 */
export function parsePropertyList(value) {
  return value
    .split(',')
    .map(item => item.trim().replace(/^#/, '').replace(/^\[\[(.*)\]\]$/, '$1').trim())
    .filter(item => item.length > 0);
}

/**
 * Extracts page properties from the top of a Logseq page (pure function).
 * Logseq writes them as `key:: value` lines before the first block, with no
 * bullet. The block ends at the first line that is not a property.
 * @param {string} content - The markdown content
 * @returns {{properties: object, body: string}} Properties and the rest of the page
 */
export function extractPageProperties(content) {
  if (!content || typeof content !== 'string') {
    return { properties: {}, body: content || '' };
  }

  const lines = content.split('\n');
  const properties = {};
  let count = 0;

  for (const line of lines) {
    const match = line.match(PROPERTY_LINE);
    if (!match) break;

    const key = match[1].toLowerCase();
    const value = match[2].trim();
    properties[key] = LIST_PROPERTIES.has(key) ? parsePropertyList(value) : value;
    count++;
  }

  return { properties, body: lines.slice(count).join('\n') };
}

/**
 * Derives a title from a file name, the way Logseq names a page without a
 * title:: property. Namespaced pages store `a/b` as `a___b.md`.
 * @param {string} filePath - Path to the note
 * @returns {string} Title
 */
export function titleFromFilename(filePath) {
  return path.basename(filePath, '.md').replaceAll('___', '/');
}

/**
 * Finds the 1-based line of a `title:` or `title::` property (pure function)
 * @param {string} content - The markdown content
 * @returns {number|null} Line number, or null when there is none
 */
export function findTitlePropertyLine(content) {
  const index = content.split('\n').findIndex(line => /^title::?/i.test(line));
  return index === -1 ? null : index + 1;
}

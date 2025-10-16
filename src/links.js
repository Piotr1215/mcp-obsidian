/**
 * Pure functions for extracting and processing Obsidian wikilinks
 */

/**
 * Extract wikilinks from markdown content
 * Supports: [[link]], [[link|alias]], [[path/to/note]]
 * @param {string} content - The markdown content to parse
 * @returns {string[]} Array of unique link targets (without aliases), preserving order
 */
export function extractWikilinks(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }

  // Regex to match [[link]] or [[link|alias]]
  // Captures the link target (before | if present)
  const wikilinkRegex = /\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g;

  const links = [];
  const seen = new Set();
  let match;

  while ((match = wikilinkRegex.exec(content)) !== null) {
    const link = match[1].trim();

    // Add only if not already seen (preserve order, remove duplicates)
    if (!seen.has(link)) {
      links.push(link);
      seen.add(link);
    }
  }

  return links;
}

/**
 * Check if a note is a MOC based on its content
 * A note is a MOC if it has the #moc tag in frontmatter or inline
 * @param {string} content - The note content
 * @param {string[]} tags - Extracted tags from the note
 * @returns {boolean} True if the note is a MOC
 */
export function isMoc(content, tags) {
  if (!Array.isArray(tags)) {
    return false;
  }

  // Check if 'moc' tag exists in tags array (case-insensitive)
  return tags.some(tag => tag.toLowerCase() === 'moc');
}

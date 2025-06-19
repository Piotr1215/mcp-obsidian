/**
 * Pure functional utilities for tag operations
 */

/**
 * Extracts tags from markdown content (pure function)
 * @param {string} content - The markdown content
 * @returns {Array<string>} Array of unique tags
 */
export function extractTags(content) {
  if (!content || typeof content !== 'string') {
    return [];
  }
  
  const tags = new Set();
  
  // Extract frontmatter tags
  const frontmatterTags = extractFrontmatterTags(content);
  frontmatterTags.forEach(tag => tags.add(tag));
  
  // Extract inline tags
  const inlineTags = extractInlineTags(content);
  inlineTags.forEach(tag => tags.add(tag));
  
  return Array.from(tags);
}

/**
 * Extracts tags from frontmatter (pure function)
 * @param {string} content - The markdown content
 * @returns {Array<string>} Array of tags from frontmatter
 */
export function extractFrontmatterTags(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return [];
  }
  
  const frontmatter = frontmatterMatch[1];
  const tags = [];
  
  // Match tags in array format: tags: [tag1, tag2]
  const arrayMatch = frontmatter.match(/tags:\s*\[(.*?)\]/);
  if (arrayMatch) {
    const tagList = arrayMatch[1]
      .split(',')
      .map(tag => tag.trim().replace(/['"]/g, ''))
      .filter(tag => tag.length > 0);
    tags.push(...tagList);
  } else {
    // Match tags in YAML list format
    const yamlListMatch = frontmatter.match(/tags:\s*\n((?:\s*-\s*.+\n?)+)/);
    if (yamlListMatch) {
      const tagLines = yamlListMatch[1]
        .split('\n')
        .filter(line => line.trim())
        .map(line => line.replace(/^\s*-\s*/, '').trim())
        .filter(tag => tag.length > 0);
      tags.push(...tagLines);
    } else {
      // Match single tag: tags: tag1
      const singleMatch = frontmatter.match(/tags:\s*(.+)/);
      if (singleMatch) {
        const tag = singleMatch[1].trim();
        if (tag) tags.push(tag);
      }
    }
  }
  
  return tags;
}

/**
 * Extracts inline tags from content (pure function)
 * @param {string} content - The markdown content
 * @returns {Array<string>} Array of inline tags
 */
export function extractInlineTags(content) {
  // Remove code blocks to avoid false positives
  const contentWithoutCode = removeCodeBlocks(content);
  
  const tags = [];
  // Match hashtags that are not part of headings
  // Tag name can contain letters, numbers, underscore, hyphen, plus, dot, and forward slash
  const inlineTagRegex = /(?:^|[^#\w])#([a-zA-Z0-9_\-+.\/]+?)(?=[^a-zA-Z0-9_\-+\/]|$)/gm;
  let match;
  
  while ((match = inlineTagRegex.exec(contentWithoutCode)) !== null) {
    let tag = match[1];
    // Remove trailing dots (but keep dots inside the tag like .net)
    tag = tag.replace(/\.+$/, '');
    if (tag) tags.push(tag);
  }
  
  return tags;
}

/**
 * Removes code blocks from content (pure function)
 * @param {string} content - The markdown content
 * @returns {string} Content without code blocks
 */
export function removeCodeBlocks(content) {
  return content.replace(/```[\s\S]*?```/g, '');
}

/**
 * Checks if a note has all specified tags (pure function)
 * @param {Array<string>} noteTags - Tags in the note
 * @param {Array<string>} searchTags - Tags to search for
 * @param {boolean} caseSensitive - Whether to perform case-sensitive matching
 * @returns {boolean} True if note has all search tags
 */
export function hasAllTags(noteTags, searchTags, caseSensitive = false) {
  if (!searchTags || searchTags.length === 0) {
    return true;
  }
  
  const normalizedNoteTags = noteTags.map(tag => 
    caseSensitive ? tag : tag.toLowerCase()
  );
  
  const normalizedSearchTags = searchTags.map(tag => 
    caseSensitive ? tag : tag.toLowerCase()
  );
  
  // Check if all search tags are present (AND operation)
  return normalizedSearchTags.every(searchTag => 
    normalizedNoteTags.includes(searchTag)
  );
}
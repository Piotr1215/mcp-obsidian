import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { glob } from 'glob';
import path from 'path';

export async function searchVault(vaultPath, query, searchPath, caseSensitive = false) {
  const searchPattern = searchPath 
    ? path.join(vaultPath, searchPath, '**/*.md')
    : path.join(vaultPath, '**/*.md');
  
  const files = await glob(searchPattern);
  const results = [];

  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const searchLine = caseSensitive ? line : line.toLowerCase();
      const searchQuery = caseSensitive ? query : query.toLowerCase();
      
      if (searchLine.includes(searchQuery)) {
        results.push({
          file: path.relative(vaultPath, file),
          line: i + 1,
          content: line.trim()
        });
      }
    }
  }

  return { results, count: results.length };
}

export async function listNotes(vaultPath, directory) {
  const searchPath = directory 
    ? path.join(vaultPath, directory, '**/*.md')
    : path.join(vaultPath, '**/*.md');
  
  const files = await glob(searchPath);
  const notes = files.map(file => path.relative(vaultPath, file));
  
  return {
    notes: notes.sort(),
    count: notes.length
  };
}

export async function readNote(vaultPath, notePath) {
  const fullPath = path.join(vaultPath, notePath);
  const content = await readFile(fullPath, 'utf-8');
  return content;
}

export async function writeNote(vaultPath, notePath, content) {
  const fullPath = path.join(vaultPath, notePath);
  const dir = path.dirname(fullPath);
  
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    // Directory might already exist
  }
  
  await writeFile(fullPath, content, 'utf-8');
  return notePath;
}

export async function deleteNote(vaultPath, notePath) {
  const fullPath = path.join(vaultPath, notePath);
  await unlink(fullPath);
  return notePath;
}

export function extractTags(content) {
  const tags = new Set();
  
  // Extract frontmatter tags
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    
    // Match tags in array format: tags: [tag1, tag2]
    const arrayMatch = frontmatter.match(/tags:\s*\[(.*?)\]/);
    if (arrayMatch) {
      const tagList = arrayMatch[1].split(',').map(tag => tag.trim().replace(/['"]/g, ''));
      tagList.forEach(tag => tags.add(tag));
    } else {
      // Match tags in YAML list format
      const yamlListMatch = frontmatter.match(/tags:\s*\n((?:\s*-\s*.+\n?)+)/);
      if (yamlListMatch) {
        const tagLines = yamlListMatch[1].split('\n').filter(line => line.trim());
        tagLines.forEach(line => {
          const tag = line.replace(/^\s*-\s*/, '').trim();
          if (tag) tags.add(tag);
        });
      } else {
        // Match single tag: tags: tag1
        const singleMatch = frontmatter.match(/tags:\s*(.+)/);
        if (singleMatch) {
          const tag = singleMatch[1].trim();
          if (tag) tags.add(tag);
        }
      }
    }
  }
  
  // Extract inline tags, excluding code blocks
  const codeBlockRegex = /```[\s\S]*?```/g;
  const contentWithoutCodeBlocks = content.replace(codeBlockRegex, '');
  
  // Match hashtags that are not part of headings
  // Tag name can contain letters, numbers, underscore, hyphen, plus, dot, and forward slash
  const inlineTagRegex = /(?:^|[^#\w])#([a-zA-Z0-9_\-+.\/]+?)(?=[^a-zA-Z0-9_\-+\/]|$)/gm;
  let match;
  while ((match = inlineTagRegex.exec(contentWithoutCodeBlocks)) !== null) {
    let tag = match[1];
    // Remove trailing dots (but keep dots inside the tag like .net)
    tag = tag.replace(/\.+$/, '');
    if (tag) tags.add(tag);
  }
  
  return Array.from(tags);
}

export async function searchByTags(vaultPath, searchTags, directory = null, caseSensitive = false) {
  const searchPattern = directory 
    ? path.join(vaultPath, directory, '**/*.md')
    : path.join(vaultPath, '**/*.md');
  
  const files = await glob(searchPattern);
  const results = [];
  
  // Normalize search tags for comparison
  const normalizedSearchTags = searchTags.map(tag => 
    caseSensitive ? tag : tag.toLowerCase()
  );
  
  for (const file of files) {
    const content = await readFile(file, 'utf-8');
    const fileTags = extractTags(content);
    
    // Normalize file tags for comparison
    const normalizedFileTags = fileTags.map(tag => 
      caseSensitive ? tag : tag.toLowerCase()
    );
    
    // Check if all search tags are present in the file (AND operation)
    const hasAllTags = normalizedSearchTags.every(searchTag => 
      normalizedFileTags.includes(searchTag)
    );
    
    if (hasAllTags) {
      results.push({
        path: path.relative(vaultPath, file),
        tags: fileTags
      });
    }
  }
  
  return {
    notes: results,
    count: results.length
  };
}
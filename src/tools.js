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
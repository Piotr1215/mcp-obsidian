/**
 * Pure functions for building and querying the vault link graph.
 *
 * The graph is derived from wikilinks on every call — it is never persisted,
 * so it cannot drift out of sync with the vault. Nodes are note paths
 * (relative to the vault root), edges are resolved wikilinks.
 */

import path from 'path';
import { extractWikilinks } from './links.js';

/**
 * Build an index from link targets to note paths.
 * Wikilinks can reference a note by basename ("Note") or by relative path
 * ("dir/Note"), with or without the .md extension — index all variants.
 * @param {string[]} notePaths - All note paths relative to the vault root
 * @returns {Map<string, string[]>} Map of lowercase link target → matching note paths
 */
export function buildLinkIndex(notePaths) {
  const index = new Map();

  const add = (key, notePath) => {
    const normalized = key.toLowerCase();
    const existing = index.get(normalized);
    if (existing) {
      if (!existing.includes(notePath)) {
        existing.push(notePath);
      }
    } else {
      index.set(normalized, [notePath]);
    }
  };

  for (const notePath of notePaths) {
    const withoutExt = notePath.replace(/\.md$/i, '');
    const basename = path.basename(withoutExt);
    // Full relative path, with and without extension
    add(notePath, notePath);
    add(withoutExt, notePath);
    // Basename, with and without extension ("Note" and "Note.md")
    add(basename, notePath);
    add(`${basename}.md`, notePath);
  }

  return index;
}

/**
 * Resolve a wikilink target against the link index.
 * Strips heading (#) and block (^) references before lookup, matching
 * Obsidian's resolution behavior.
 * @param {string} target - Raw wikilink target (e.g. "Note", "dir/Note#Heading")
 * @param {Map<string, string[]>} index - Index from buildLinkIndex
 * @returns {{resolved: string|null, ambiguous: string[]}} Resolved path, or
 *   null with the list of ambiguous candidates (empty if simply broken)
 */
export function resolveLinkTarget(target, index) {
  // Strip #heading and ^block suffixes
  const base = target.split(/[#^]/)[0].trim();
  if (!base) {
    return { resolved: null, ambiguous: [] };
  }

  const matches = index.get(base.toLowerCase()) || [];
  if (matches.length === 1) {
    return { resolved: matches[0], ambiguous: [] };
  }
  if (matches.length > 1) {
    // Prefer an exact relative-path match over basename collisions
    const exact = matches.find(
      m => m.toLowerCase() === base.toLowerCase() ||
           m.replace(/\.md$/i, '').toLowerCase() === base.toLowerCase()
    );
    if (exact) {
      return { resolved: exact, ambiguous: [] };
    }
    return { resolved: null, ambiguous: matches };
  }
  return { resolved: null, ambiguous: [] };
}

/**
 * Build the vault link graph from note contents.
 * @param {Array<{path: string, content: string}>} notes - Notes with content
 * @returns {{
 *   nodes: string[],
 *   forward: Map<string, string[]>,
 *   backward: Map<string, string[]>,
 *   broken: Array<{source: string, target: string, ambiguous: string[]}>
 * }} Graph with forward links, backlinks, and unresolved links
 */
export function buildGraph(notes) {
  const nodes = notes.map(n => n.path);
  const index = buildLinkIndex(nodes);
  const forward = new Map();
  const backward = new Map();
  const broken = [];

  for (const node of nodes) {
    forward.set(node, []);
    backward.set(node, []);
  }

  for (const note of notes) {
    const targets = extractWikilinks(note.content);
    const outgoing = forward.get(note.path);

    for (const target of targets) {
      const { resolved, ambiguous } = resolveLinkTarget(target, index);
      if (resolved) {
        if (resolved !== note.path && !outgoing.includes(resolved)) {
          outgoing.push(resolved);
          backward.get(resolved).push(note.path);
        }
      } else {
        broken.push({ source: note.path, target, ambiguous });
      }
    }
  }

  return { nodes, forward, backward, broken };
}

/**
 * Get notes that link to the given note.
 * @param {object} graph - Graph from buildGraph
 * @param {string} notePath - Target note path (relative to vault root)
 * @returns {string[]} Sorted paths of notes linking to the target
 */
export function getBacklinks(graph, notePath) {
  return [...(graph.backward.get(notePath) || [])].sort();
}

/**
 * Find notes with no incoming and no outgoing links (orphans).
 * @param {object} graph - Graph from buildGraph
 * @returns {string[]} Sorted paths of orphaned notes
 */
export function findOrphans(graph) {
  return graph.nodes
    .filter(node =>
      graph.forward.get(node).length === 0 &&
      graph.backward.get(node).length === 0
    )
    .sort();
}

/**
 * Get the neighborhood of a note up to a given depth (undirected BFS).
 * @param {object} graph - Graph from buildGraph
 * @param {string} notePath - Center note path
 * @param {number} depth - Maximum distance from the center (>= 1)
 * @returns {Array<{path: string, distance: number}>} Neighbors sorted by
 *   distance, then path; excludes the center note itself
 */
export function getNeighborhood(graph, notePath, depth) {
  const visited = new Map([[notePath, 0]]);
  let frontier = [notePath];

  for (let d = 1; d <= depth && frontier.length > 0; d++) {
    const next = [];
    for (const node of frontier) {
      const neighbors = [
        ...(graph.forward.get(node) || []),
        ...(graph.backward.get(node) || [])
      ];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.set(neighbor, d);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  visited.delete(notePath);
  return [...visited.entries()]
    .map(([p, distance]) => ({ path: p, distance }))
    .sort((a, b) => a.distance - b.distance || a.path.localeCompare(b.path));
}

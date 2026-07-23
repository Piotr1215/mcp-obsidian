import { describe, it, expect } from 'vitest';
import {
  buildLinkIndex,
  resolveLinkTarget,
  buildGraph,
  getBacklinks,
  findOrphans,
  getNeighborhood
} from '../src/graph.js';

describe('buildLinkIndex', () => {
  it('indexes basename and relative path, with and without extension', () => {
    const index = buildLinkIndex(['dir/Note.md']);
    expect(index.get('note')).toEqual(['dir/Note.md']);
    expect(index.get('note.md')).toEqual(['dir/Note.md']);
    expect(index.get('dir/note')).toEqual(['dir/Note.md']);
    expect(index.get('dir/note.md')).toEqual(['dir/Note.md']);
  });

  it('collects basename collisions from different directories', () => {
    const index = buildLinkIndex(['a/Note.md', 'b/Note.md']);
    expect(index.get('note')).toEqual(['a/Note.md', 'b/Note.md']);
    expect(index.get('a/note')).toEqual(['a/Note.md']);
  });

  it('is case-insensitive', () => {
    const index = buildLinkIndex(['Dir/MOC - Main.md']);
    expect(index.get('moc - main')).toEqual(['Dir/MOC - Main.md']);
  });
});

describe('resolveLinkTarget', () => {
  const index = buildLinkIndex(['a/Note.md', 'b/Note.md', 'Solo.md']);

  it('resolves a unique basename', () => {
    expect(resolveLinkTarget('Solo', index)).toEqual({ resolved: 'Solo.md', ambiguous: [] });
  });

  it('strips heading and block references before lookup', () => {
    expect(resolveLinkTarget('Solo#Section', index).resolved).toBe('Solo.md');
    expect(resolveLinkTarget('Solo^block-id', index).resolved).toBe('Solo.md');
  });

  it('reports ambiguity for basename collisions', () => {
    const result = resolveLinkTarget('Note', index);
    expect(result.resolved).toBeNull();
    expect(result.ambiguous).toEqual(['a/Note.md', 'b/Note.md']);
  });

  it('resolves collisions via exact relative path', () => {
    expect(resolveLinkTarget('a/Note', index).resolved).toBe('a/Note.md');
  });

  it('returns broken (no ambiguity) for unknown targets', () => {
    expect(resolveLinkTarget('Missing', index)).toEqual({ resolved: null, ambiguous: [] });
  });
});

describe('buildGraph', () => {
  const notes = [
    { path: 'A.md', content: 'Links to [[B]] and [[C|alias]] and [[Missing]]' },
    { path: 'B.md', content: 'Back to [[A]]' },
    { path: 'C.md', content: 'No links here' },
    { path: 'Orphan.md', content: 'Nothing links me and I link nothing' }
  ];

  it('builds forward and backward edges', () => {
    const graph = buildGraph(notes);
    expect(graph.forward.get('A.md')).toEqual(['B.md', 'C.md']);
    expect(graph.backward.get('A.md')).toEqual(['B.md']);
    expect(graph.backward.get('B.md')).toEqual(['A.md']);
  });

  it('collects broken links with their source', () => {
    const graph = buildGraph(notes);
    expect(graph.broken).toEqual([
      { source: 'A.md', target: 'Missing', ambiguous: [] }
    ]);
  });

  it('ignores self-links and duplicate edges', () => {
    const graph = buildGraph([
      { path: 'Self.md', content: '[[Self]] and [[Other]] and [[Other]] again' },
      { path: 'Other.md', content: '' }
    ]);
    expect(graph.forward.get('Self.md')).toEqual(['Other.md']);
    expect(graph.backward.get('Other.md')).toEqual(['Self.md']);
  });

  it('reports ambiguous links as broken with candidates', () => {
    const graph = buildGraph([
      { path: 'x/Dup.md', content: '' },
      { path: 'y/Dup.md', content: '' },
      { path: 'Linker.md', content: 'See [[Dup]]' }
    ]);
    expect(graph.broken).toEqual([
      { source: 'Linker.md', target: 'Dup', ambiguous: ['x/Dup.md', 'y/Dup.md'] }
    ]);
  });
});

describe('getBacklinks', () => {
  it('returns sorted linking notes', () => {
    const graph = buildGraph([
      { path: 'Z.md', content: '[[Target]]' },
      { path: 'A.md', content: '[[Target]]' },
      { path: 'Target.md', content: '' }
    ]);
    expect(getBacklinks(graph, 'Target.md')).toEqual(['A.md', 'Z.md']);
  });

  it('returns empty array for unknown note', () => {
    const graph = buildGraph([{ path: 'A.md', content: '' }]);
    expect(getBacklinks(graph, 'Nope.md')).toEqual([]);
  });
});

describe('findOrphans', () => {
  it('finds notes with no links in either direction', () => {
    const graph = buildGraph([
      { path: 'A.md', content: '[[B]]' },
      { path: 'B.md', content: '' },
      { path: 'Lonely.md', content: 'just text' }
    ]);
    expect(findOrphans(graph)).toEqual(['Lonely.md']);
  });

  it('does not count a note with only broken links as connected', () => {
    const graph = buildGraph([
      { path: 'OnlyBroken.md', content: '[[DoesNotExist]]' }
    ]);
    expect(findOrphans(graph)).toEqual(['OnlyBroken.md']);
  });
});

describe('getNeighborhood', () => {
  // Chain: A -> B -> C -> D, plus E -> A
  const notes = [
    { path: 'A.md', content: '[[B]]' },
    { path: 'B.md', content: '[[C]]' },
    { path: 'C.md', content: '[[D]]' },
    { path: 'D.md', content: '' },
    { path: 'E.md', content: '[[A]]' }
  ];

  it('traverses undirected edges up to depth', () => {
    const graph = buildGraph(notes);
    expect(getNeighborhood(graph, 'A.md', 1)).toEqual([
      { path: 'B.md', distance: 1 },
      { path: 'E.md', distance: 1 }
    ]);
    expect(getNeighborhood(graph, 'A.md', 2)).toEqual([
      { path: 'B.md', distance: 1 },
      { path: 'E.md', distance: 1 },
      { path: 'C.md', distance: 2 }
    ]);
  });

  it('excludes the center note and dedupes shorter paths', () => {
    const graph = buildGraph(notes);
    const result = getNeighborhood(graph, 'B.md', 3);
    expect(result.find(n => n.path === 'B.md')).toBeUndefined();
    // A is at distance 1 from B (backlink), E at 2 via A
    expect(result).toEqual([
      { path: 'A.md', distance: 1 },
      { path: 'C.md', distance: 1 },
      { path: 'D.md', distance: 2 },
      { path: 'E.md', distance: 2 }
    ]);
  });
});

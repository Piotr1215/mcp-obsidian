import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { createServer } from '../src/server.js';

/**
 * Logseq (file-based graphs) and Foam keep notes as plain markdown on disk,
 * so the server reads them without an API. This drives the real tools/call
 * handlers over a vault laid out the way each tool writes one: no mocked fs,
 * no mocked tools.
 */

const callTool = (server, name, args) =>
  server._requestHandlers.get('tools/call')(
    { method: 'tools/call', params: { name, arguments: args } },
    { signal: new AbortController().signal }
  );

const structured = async (vault, name, args = {}) =>
  (await callTool(createServer(vault), name, args)).structuredContent;

const writeVault = async (prefix, files) => {
  const vault = await mkdtemp(join(tmpdir(), prefix));
  for (const [file, content] of Object.entries(files)) {
    await mkdir(dirname(join(vault, file)), { recursive: true });
    await writeFile(join(vault, file), content);
  }
  return vault;
};

const KUBERNETES_PAGE = [
  'tags:: devops, [[service mesh]]',
  'alias:: k8s',
  '',
  '- Container orchestration #infra',
  '- Related to [[Docker]] and #[[platform engineering]]'
].join('\n');

describe('a file-based Logseq graph', () => {
  let vault;

  beforeAll(async () => {
    vault = await writeVault('logseq-graph-', {
      'logseq/config.edn': '{:meta/version 1}\n',
      'pages/Kubernetes.md': KUBERNETES_PAGE,
      'pages/Docker.md': '- Containers #infra\n',
      'pages/projects___alpha.md': '- Alpha project notes\n',
      'pages/Renamed.md': 'title:: Platform Roadmap\n\n- Q4 goals\n',
      'pages/Index.md': 'tags:: moc\n\n- [[Kubernetes]]\n- [[Docker]]\n',
      'journals/2026_10_07.md': '- Worked on [[Kubernetes]] #devops\n',
      // Copies Logseq writes for itself and skips when it loads the graph
      'logseq/bak/pages/Kubernetes/2026-10-01T10_00_00.000Z.Desktop.md': KUBERNETES_PAGE,
      'logseq/version-files/base/pages/Kubernetes.md': KUBERNETES_PAGE
    });
  });

  afterAll(async () => {
    await rm(vault, { recursive: true, force: true });
  });

  it('lists pages and journals, not the backup and version copies', async () => {
    const { notes } = await structured(vault, 'list-notes');

    expect(notes).toEqual([
      'journals/2026_10_07.md',
      'pages/Docker.md',
      'pages/Index.md',
      'pages/Kubernetes.md',
      'pages/Renamed.md',
      'pages/projects___alpha.md'
    ]);
  });

  it('finds a page by a tag in its tags:: property', async () => {
    const { notes } = await structured(vault, 'search-by-tags', { tags: ['service mesh'] });

    expect(notes.map(n => n.path)).toEqual(['pages/Kubernetes.md']);
  });

  it('combines property and inline tags, so devops finds the page and the journal', async () => {
    const { notes } = await structured(vault, 'search-by-tags', { tags: ['devops'] });

    expect(notes.map(n => n.path)).toEqual(['journals/2026_10_07.md', 'pages/Kubernetes.md']);
  });

  it('finds a page by a multi-word #[[tag]]', async () => {
    const { notes } = await structured(vault, 'search-by-tags', { tags: ['platform engineering'] });

    expect(notes.map(n => n.path)).toEqual(['pages/Kubernetes.md']);
  });

  it('returns each page once from a full-text search', async () => {
    const { files } = await structured(vault, 'search-vault', { query: 'orchestration' });

    expect(files.map(f => f.path)).toEqual(['pages/Kubernetes.md']);
  });

  it('finds a page by its file name, the title Logseq shows', async () => {
    const { results } = await structured(vault, 'search-by-title', { query: 'kubernetes' });

    expect(results).toEqual([{ file: 'pages/Kubernetes.md', title: 'Kubernetes', line: null }]);
  });

  it('finds a namespaced page by its namespace path', async () => {
    const { results } = await structured(vault, 'search-by-title', { query: 'projects/alpha' });

    expect(results).toEqual([{ file: 'pages/projects___alpha.md', title: 'projects/alpha', line: null }]);
  });

  it('lets title:: override the file name', async () => {
    const renamed = await structured(vault, 'search-by-title', { query: 'roadmap' });
    const byFileName = await structured(vault, 'search-by-title', { query: 'renamed' });

    expect(renamed.results).toEqual([{ file: 'pages/Renamed.md', title: 'Platform Roadmap', line: 1 }]);
    expect(byFileName.results).toEqual([]);
  });

  it('matches the title: search operator against the page title', async () => {
    const { files } = await structured(vault, 'search-vault', { query: 'title:roadmap' });

    expect(files).toEqual([
      expect.objectContaining({
        path: 'pages/Renamed.md',
        matches: [expect.objectContaining({ line: 1, content: 'title:: Platform Roadmap' })]
      })
    ]);
  });

  it('discovers a page tagged moc in tags:: as a MOC', async () => {
    const { mocs } = await structured(vault, 'discover-mocs');

    expect(mocs).toEqual([
      expect.objectContaining({ path: 'pages/Index.md', title: 'Index', linkedNotes: ['Kubernetes', 'Docker'] })
    ]);
  });

  it('reports page properties and the page title as metadata', async () => {
    const metadata = await structured(vault, 'get-note-metadata', { path: 'pages/Kubernetes.md' });

    expect(metadata).toMatchObject({
      frontmatter: { tags: ['devops', 'service mesh'], alias: ['k8s'] },
      title: 'Kubernetes',
      titleLine: null,
      inlineTags: ['infra', 'platform engineering']
    });
  });

  it('reads a page by name when the graph has a backup of it too', async () => {
    const response = await callTool(createServer(vault), 'read-note', { path: 'Kubernetes.md' });

    expect(response.isError).toBeFalsy();
    expect(response.content[0].text).toContain('Container orchestration');
  });
});

describe('a Foam workspace', () => {
  let vault;

  beforeAll(async () => {
    vault = await writeVault('foam-workspace-', {
      '.foam/templates/new-note.md': '# ${TM_FILENAME_BASE}\n',
      '.vscode/settings.json': '{}\n',
      'kubernetes.md': '---\ntags: [devops, cloud]\n---\n# Kubernetes\n\nContainer orchestration, see [[docker]] #infra\n\n[docker]: docker.md "Docker"\n',
      'docker.md': '# Docker\n\nContainers #infra\n',
      'index.md': '---\ntags: moc\n---\n# Index\n\n- [[kubernetes]]\n- [[docker]]\n',
      'journal/2026-10-07.md': '# 2026-10-07\n\nWorked on [[kubernetes]] #devops\n'
    });
  });

  afterAll(async () => {
    await rm(vault, { recursive: true, force: true });
  });

  it('lists notes and skips the .foam templates', async () => {
    const { notes } = await structured(vault, 'list-notes');

    expect(notes).toEqual(['docker.md', 'index.md', 'journal/2026-10-07.md', 'kubernetes.md']);
  });

  it('finds notes by YAML frontmatter and inline tags', async () => {
    const { notes } = await structured(vault, 'search-by-tags', { tags: ['devops'] });

    expect(notes.map(n => n.path)).toEqual(['journal/2026-10-07.md', 'kubernetes.md']);
  });

  it('finds a note by its H1 title', async () => {
    const { results } = await structured(vault, 'search-by-title', { query: 'kubernetes' });

    expect(results).toEqual([{ file: 'kubernetes.md', title: 'Kubernetes', line: 4 }]);
  });

  it('discovers a MOC and its wikilinks', async () => {
    const { mocs } = await structured(vault, 'discover-mocs');

    expect(mocs).toEqual([
      expect.objectContaining({ path: 'index.md', title: 'Index', linkedNotes: ['kubernetes', 'docker'] })
    ]);
  });
});

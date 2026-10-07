import { describe, it, expect } from 'vitest';
import {
  extractPageProperties,
  parsePropertyList,
  titleFromFilename,
  findTitlePropertyLine
} from '../src/logseq.js';
import { extractTags, extractFrontmatterTags, extractBracketTags } from '../src/tags.js';
import { extractFrontmatter, extractNoteMetadata } from '../src/metadata.js';
import { resolveTitle } from '../src/title-search.js';
import { isIgnoredPath } from '../src/validation.js';
import { findMatchesWithOperators } from '../src/search.js';

// A page as Logseq writes it: page properties first, no bullet, then blocks.
const PAGE = [
  'title:: Kubernetes Notes',
  'tags:: devops, [[service mesh]], #cloud',
  'alias:: k8s',
  '',
  '- Container orchestration #infra',
  '- status:: draft'
].join('\n');

describe('extractPageProperties', () => {
  it('reads the property lines at the top of the page', () => {
    const { properties } = extractPageProperties(PAGE);

    expect(properties).toEqual({
      title: 'Kubernetes Notes',
      tags: ['devops', 'service mesh', 'cloud'],
      alias: ['k8s']
    });
  });

  it('returns the page without its property block as the body', () => {
    const { body } = extractPageProperties(PAGE);

    expect(body).toBe('\n- Container orchestration #infra\n- status:: draft');
  });

  it('ignores block properties further down the page', () => {
    expect(extractPageProperties(PAGE).properties).not.toHaveProperty('status');
  });

  it('lowercases keys, as Logseq does', () => {
    expect(extractPageProperties('Title:: Shouting\n').properties).toEqual({ title: 'Shouting' });
  });

  it('keeps a property with no value as an empty string', () => {
    expect(extractPageProperties('icon::\n- body').properties).toEqual({ icon: '' });
  });

  it('leaves a page without properties untouched', () => {
    const content = '- just a block\nkey:: not at the top';

    expect(extractPageProperties(content)).toEqual({ properties: {}, body: content });
  });

  it.each([null, undefined, ''])('returns nothing for %s', (content) => {
    expect(extractPageProperties(content)).toEqual({ properties: {}, body: '' });
  });

  // A property line needs the double colon. A YAML-style `key: value` line is
  // ordinary text in a Logseq page, and a URL must not read as a key.
  it.each([
    'title: single colon',
    'https://example.com:: no',
    '- tags:: bulleted first block'
  ])('does not read %j as a page property', (line) => {
    expect(extractPageProperties(line).properties).toEqual({});
  });
});

describe('parsePropertyList', () => {
  it.each([
    ['devops, cloud', ['devops', 'cloud']],
    ['[[service mesh]], devops', ['service mesh', 'devops']],
    ['#devops, #[[service mesh]]', ['devops', 'service mesh']],
    [' spaced ,  out ', ['spaced', 'out']],
    ['a,,b,', ['a', 'b']],
    ['', []]
  ])('splits %j into %j', (value, expected) => {
    expect(parsePropertyList(value)).toEqual(expected);
  });
});

describe('titleFromFilename', () => {
  it.each([
    ['/graph/pages/Kubernetes.md', 'Kubernetes'],
    ['/graph/pages/projects___alpha.md', 'projects/alpha'],
    ['/graph/pages/a___b___c.md', 'a/b/c'],
    ['journals/2026_10_07.md', '2026_10_07']
  ])('names %s as %s', (filePath, expected) => {
    expect(titleFromFilename(filePath)).toBe(expected);
  });
});

describe('findTitlePropertyLine', () => {
  it.each([
    ['tags:: x\ntitle:: Logseq', 2],
    ['---\ntitle: YAML\n---', 2],
    ['Title:: Upper', 1],
    ['subtitle:: not a title', null],
    ['titles:: a longer key', null],
    ['title::NoSpace', 1],
    ['# Heading only', null]
  ])('finds the title line in %j', (content, expected) => {
    expect(findTitlePropertyLine(content)).toBe(expected);
  });
});

describe('tags on a Logseq page', () => {
  it('reads tags:: as the page tags when there is no YAML frontmatter', () => {
    expect(extractFrontmatterTags(PAGE)).toEqual(['devops', 'service mesh', 'cloud']);
  });

  it('prefers YAML frontmatter tags when both forms are present', () => {
    const content = '---\ntags: [yaml]\n---\ntags:: logseq';

    expect(extractFrontmatterTags(content)).toEqual(['yaml']);
  });

  it('combines property, inline and bracket tags without duplicates', () => {
    const content = 'tags:: devops, infra\n\n- note #infra #[[service mesh]] #devops';

    expect(extractTags(content).sort()).toEqual(['devops', 'infra', 'service mesh']);
  });
});

describe('extractBracketTags', () => {
  it('reads multi-word #[[tags]]', () => {
    expect(extractBracketTags('- see #[[service mesh]] and #[[ padded ]]')).toEqual(['service mesh', 'padded']);
  });

  it('does not read a plain [[link]] as a tag', () => {
    expect(extractBracketTags('- see [[service mesh]]')).toEqual([]);
  });

  it('skips tags inside code blocks', () => {
    expect(extractBracketTags('```\n#[[in code]]\n```\n#[[outside]]')).toEqual(['outside']);
  });

  it('feeds extractTags, which search-by-tags uses', () => {
    expect(extractTags('- #[[service mesh]]')).toEqual(['service mesh']);
  });
});

describe('metadata of a Logseq page', () => {
  it('reports page properties as frontmatter', () => {
    const { frontmatter, contentWithoutFrontmatter } = extractFrontmatter(PAGE);

    expect(frontmatter.tags).toEqual(['devops', 'service mesh', 'cloud']);
    expect(contentWithoutFrontmatter).not.toContain('title::');
  });

  it('takes the title from title:: and points at its line', () => {
    const metadata = extractNoteMetadata(PAGE, 'pages/k8s.md');

    expect(metadata.title).toBe('Kubernetes Notes');
    expect(metadata.titleLine).toBe(1);
  });

  it('keeps the property block out of the preview', () => {
    expect(extractNoteMetadata(PAGE, 'pages/k8s.md').contentPreview).toBe(
      '- Container orchestration #infra - status:: draft'
    );
  });

  it('lists #[[bracket]] tags with the inline tags', () => {
    const metadata = extractNoteMetadata('- a #infra and #[[service mesh]]', 'pages/a.md');

    expect(metadata.inlineTags).toEqual(['infra', 'service mesh']);
  });

  it('names a page without title:: after its namespaced file', () => {
    const metadata = extractNoteMetadata('- body', 'pages/projects___alpha.md');

    expect(metadata.title).toBe('projects/alpha');
    expect(metadata.titleLine).toBeNull();
  });
});

describe('resolveTitle', () => {
  it('prefers an H1 over a title property and the file name', () => {
    const content = '---\ntitle: Property\n---\n# Heading';

    expect(resolveTitle(content, '/v/file.md')).toEqual({ title: 'Heading', line: 4 });
  });

  it('uses a YAML title property when there is no H1', () => {
    expect(resolveTitle('---\ntitle: From YAML\n---\nbody', '/v/file.md')).toEqual({ title: 'From YAML', line: 2 });
  });

  it('uses a Logseq title:: property when there is no H1', () => {
    expect(resolveTitle(PAGE, '/v/pages/k8s.md')).toEqual({ title: 'Kubernetes Notes', line: 1 });
  });

  it('accepts a numeric title property', () => {
    expect(resolveTitle('---\ntitle: 2026\n---\n', '/v/file.md')).toEqual({ title: '2026', line: 2 });
  });

  it('skips a blank title property and falls back to the file name', () => {
    expect(resolveTitle('title::\n- body', '/v/pages/Blank.md')).toEqual({ title: 'Blank', line: null });
  });

  it('falls back to the file name, with no line', () => {
    expect(resolveTitle('- just blocks', '/v/pages/Docker.md')).toEqual({ title: 'Docker', line: null });
  });

  it('has no title without an H1, a title property or a path', () => {
    expect(resolveTitle('- just blocks')).toBeNull();
  });
});

describe('isIgnoredPath', () => {
  const ignored = ['logseq/bak', 'logseq/version-files'];

  it.each([
    ['/graph/logseq/bak/pages/Kubernetes/2026.Desktop.md', true],
    ['/graph/logseq/version-files/base/pages/Kubernetes.md', true],
    ['/graph/logseq/bak', true],
    ['/graph/pages/Kubernetes.md', false],
    ['/graph/logseq/custom.md', false],
    ['/graph/logseq/bakery/recipe.md', false],
    ['/graph/notes/logseq/bak/nested.md', false]
  ])('%s is ignored: %s', (file, expected) => {
    expect(isIgnoredPath('/graph', file, ignored)).toBe(expected);
  });

  it('ignores nothing with an empty list', () => {
    expect(isIgnoredPath('/graph', '/graph/logseq/bak/a.md', [])).toBe(false);
  });
});

describe('title: search operator without an H1', () => {
  it('points at the title:: line when the title came from a property', () => {
    const matches = findMatchesWithOperators(PAGE, 'title:kubernetes', { title: 'Kubernetes Notes', titleLine: 1, tags: [] });

    expect(matches).toEqual([{ line: 1, content: 'title:: Kubernetes Notes' }]);
  });

  it('reports a file name match on line 1 when there is no title line', () => {
    const matches = findMatchesWithOperators('- blocks', 'title:docker', { title: 'Docker', titleLine: null, tags: [] });

    expect(matches).toEqual([{ line: 1, content: '[Document matches title: Docker]' }]);
  });
});

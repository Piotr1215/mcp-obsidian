import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'fs/promises';
import path from 'path';
import { extractTags, searchByTags } from '../src/tools.js';

describe('Tag Search', () => {
  const testVault = path.join(process.cwd(), 'test-vault-tags');

  beforeEach(async () => {
    await mkdir(testVault, { recursive: true });
  });

  afterEach(async () => {
    await rm(testVault, { recursive: true, force: true });
  });

  describe('extractTags', () => {
    it('should extract tags from frontmatter (array format)', async () => {
      const content = `---
title: Test Note
tags: [javascript, testing, vitest]
---

# Test Note

This is a test note.`;

      const tags = await extractTags(content);
      expect(tags).toEqual(['javascript', 'testing', 'vitest']);
    });

    it('should extract tags from frontmatter (single tag)', async () => {
      const content = `---
tags: javascript
---

# Test Note`;

      const tags = await extractTags(content);
      expect(tags).toEqual(['javascript']);
    });

    it('should extract tags from frontmatter (YAML list format)', async () => {
      const content = `---
title: Test Note
tags:
  - javascript
  - testing
  - vitest
---

# Test Note`;

      const tags = await extractTags(content);
      expect(tags).toEqual(['javascript', 'testing', 'vitest']);
    });

    it('should extract inline tags from content', async () => {
      const content = `# Test Note

This note is about #javascript and #testing.
We use #vitest for our test framework.

Some code here #code-example`;

      const tags = await extractTags(content);
      expect(tags).toEqual(['javascript', 'testing', 'vitest', 'code-example']);
    });

    it('should extract both frontmatter and inline tags', async () => {
      const content = `---
tags: [javascript, frontend]
---

# Test Note

This note covers #testing and #vitest topics.`;

      const tags = await extractTags(content);
      expect(tags).toEqual(['javascript', 'frontend', 'testing', 'vitest']);
    });

    it('should handle nested tags properly', async () => {
      const content = `# Test Note

Working with #javascript/react and #javascript/vue frameworks.
Also covering #testing/unit and #testing/integration.`;

      const tags = await extractTags(content);
      expect(tags).toEqual([
        'javascript/react',
        'javascript/vue',
        'testing/unit',
        'testing/integration'
      ]);
    });

    it('should deduplicate tags', async () => {
      const content = `---
tags: [javascript, testing]
---

# Test Note

More about #javascript and #testing here.`;

      const tags = await extractTags(content);
      expect(tags).toEqual(['javascript', 'testing']);
    });

    it('should handle notes without tags', async () => {
      const content = `# Test Note

This is a note without any tags.`;

      const tags = await extractTags(content);
      expect(tags).toEqual([]);
    });

    it('should not extract tags from code blocks', async () => {
      const content = `# Test Note

\`\`\`javascript
// This #javascript tag should not be extracted
const tag = '#testing';
\`\`\`

But this #javascript tag should be extracted.`;

      const tags = await extractTags(content);
      expect(tags).toEqual(['javascript']);
    });

    it('should handle tags with special characters', async () => {
      const content = `# Test Note

Working with #c++ and #.net frameworks.
Also #vue-3 and #react-18.`;

      const tags = await extractTags(content);
      expect(tags).toEqual(['c++', '.net', 'vue-3', 'react-18']);
    });
  });

  describe('searchByTags', () => {
    beforeEach(async () => {
      // Create test notes with various tag formats
      await writeFile(
        path.join(testVault, 'note1.md'),
        `---
tags: [javascript, frontend]
---

# JavaScript Basics

Learning about #javascript and #web-development.`
      );

      await writeFile(
        path.join(testVault, 'note2.md'),
        `---
tags: testing
---

# Testing Guide

Best practices for #testing and #vitest.`
      );

      await writeFile(
        path.join(testVault, 'note3.md'),
        `# Backend Development

Working with #javascript on the #backend using #node.`
      );

      await mkdir(path.join(testVault, 'subfolder'), { recursive: true });
      await writeFile(
        path.join(testVault, 'subfolder', 'note4.md'),
        `---
tags:
  - javascript
  - testing
  - backend
---

# Full Stack Testing

Combining #frontend and #backend testing strategies.`
      );
    });

    it('should find notes by single tag', async () => {
      const results = await searchByTags(testVault, ['javascript']);
      expect(results.notes).toHaveLength(3);
      expect(results.notes.map(n => n.path)).toEqual(
        expect.arrayContaining(['note1.md', 'note3.md', 'subfolder/note4.md'])
      );
    });

    it('should find notes by multiple tags (AND operation)', async () => {
      const results = await searchByTags(testVault, ['javascript', 'testing']);
      expect(results.notes).toHaveLength(1);
      expect(results.notes[0].path).toBe('subfolder/note4.md');
    });

    it('should return note details with tags', async () => {
      const results = await searchByTags(testVault, ['testing']);
      const note2 = results.notes.find(n => n.path === 'note2.md');
      expect(note2).toBeDefined();
      expect(note2.tags).toEqual(['testing', 'vitest']);
    });

    it('should search in specific directory', async () => {
      const results = await searchByTags(testVault, ['javascript'], 'subfolder');
      expect(results.notes).toHaveLength(1);
      expect(results.notes[0].path).toBe('subfolder/note4.md');
    });

    it('should handle tag not found', async () => {
      const results = await searchByTags(testVault, ['nonexistent']);
      expect(results.notes).toHaveLength(0);
      expect(results.count).toBe(0);
    });

    it('should handle nested tags', async () => {
      await writeFile(
        path.join(testVault, 'nested-tags.md'),
        `# Nested Tags

Working with #javascript/react and #javascript/vue.`
      );

      const results = await searchByTags(testVault, ['javascript/react']);
      expect(results.notes).toHaveLength(1);
      expect(results.notes[0].path).toBe('nested-tags.md');
    });

    it('should be case-insensitive by default', async () => {
      const results = await searchByTags(testVault, ['JavaScript']);
      expect(results.notes).toHaveLength(3);
    });

    it('should support case-sensitive search when specified', async () => {
      await writeFile(
        path.join(testVault, 'case-test.md'),
        `# Case Test

Using #JavaScript (capitalized) and #javascript (lowercase).`
      );

      const resultsInsensitive = await searchByTags(testVault, ['javascript'], null, false);
      const resultsSensitive = await searchByTags(testVault, ['javascript'], null, true);

      expect(resultsInsensitive.notes.map(n => n.path)).toContain('case-test.md');
      expect(resultsSensitive.notes.map(n => n.path)).toContain('case-test.md');
      
      // Test with capital J
      const resultsCapital = await searchByTags(testVault, ['JavaScript'], null, true);
      expect(resultsCapital.notes).toHaveLength(1);
      expect(resultsCapital.notes[0].path).toBe('case-test.md');
    });
  });
});
import { describe, it, expect } from 'vitest';
import { extractH1Title, titleMatchesQuery, transformTitleResults } from '../src/title-search.js';

describe('Title Search Pure Functions', () => {
  describe('extractH1Title', () => {
    it('should extract H1 title from markdown', () => {
      const content = '# My Title\n\nSome content';
      const result = extractH1Title(content);
      
      expect(result).toEqual({
        title: 'My Title',
        line: 1
      });
    });
    
    it('should extract H1 title with extra spaces', () => {
      const content = '#   My Title   \n\nContent';
      const result = extractH1Title(content);
      
      expect(result).toEqual({
        title: 'My Title',
        line: 1
      });
    });
    
    it('should find H1 title after other content', () => {
      const content = 'Some intro\n\n# Title Here\n\nMore content';
      const result = extractH1Title(content);
      
      expect(result).toEqual({
        title: 'Title Here',
        line: 3
      });
    });
    
    it('should return null for no H1', () => {
      const content = '## H2 Title\n\nContent';
      const result = extractH1Title(content);
      
      expect(result).toBeNull();
    });
    
    it('should return null for empty content', () => {
      expect(extractH1Title('')).toBeNull();
      expect(extractH1Title(null)).toBeNull();
      expect(extractH1Title(undefined)).toBeNull();
    });
    
    it('should not match H1 without space after #', () => {
      const content = '#NoSpace\n\nContent';
      const result = extractH1Title(content);
      
      expect(result).toBeNull();
    });
    
    it('should not match multiple # without space', () => {
      const content = '## H2 Title\n### H3 Title\n#### H4 Title';
      const result = extractH1Title(content);
      
      expect(result).toBeNull();
    });
  });
  
  describe('titleMatchesQuery', () => {
    it('should match exact title', () => {
      expect(titleMatchesQuery('My Title', 'My Title')).toBe(true);
    });
    
    it('should match partial title case-insensitive', () => {
      expect(titleMatchesQuery('Development Guide', 'development')).toBe(true);
      expect(titleMatchesQuery('Development Guide', 'GUIDE')).toBe(true);
    });
    
    it('should match partial title case-sensitive', () => {
      expect(titleMatchesQuery('Development Guide', 'Development', true)).toBe(true);
      expect(titleMatchesQuery('Development Guide', 'development', true)).toBe(false);
    });
    
    it('should return false for non-matching query', () => {
      expect(titleMatchesQuery('My Title', 'Other')).toBe(false);
    });
    
    it('should handle empty inputs', () => {
      expect(titleMatchesQuery('', 'query')).toBe(false);
      expect(titleMatchesQuery('title', '')).toBe(false);
      expect(titleMatchesQuery(null, 'query')).toBe(false);
      expect(titleMatchesQuery('title', null)).toBe(false);
    });
  });
  
  describe('transformTitleResults', () => {
    it('should transform matches with title info', () => {
      const matches = [
        {
          file: '/vault/note1.md',
          titleInfo: { title: 'Note 1', line: 1 }
        },
        {
          file: '/vault/folder/note2.md',
          titleInfo: { title: 'Note 2', line: 3 }
        }
      ];
      
      const result = transformTitleResults(matches, '/vault');
      
      expect(result).toEqual({
        results: [
          { file: 'note1.md', title: 'Note 1', line: 1 },
          { file: 'folder/note2.md', title: 'Note 2', line: 3 }
        ],
        count: 2,
        filesSearched: 2
      });
    });
    
    it('should filter out files without titles', () => {
      const matches = [
        {
          file: '/vault/note1.md',
          titleInfo: { title: 'Note 1', line: 1 }
        },
        {
          file: '/vault/no-title.md',
          titleInfo: null
        }
      ];
      
      const result = transformTitleResults(matches, '/vault');
      
      expect(result).toEqual({
        results: [
          { file: 'note1.md', title: 'Note 1', line: 1 }
        ],
        count: 1,
        filesSearched: 2
      });
    });
    
    it('should handle empty results', () => {
      const result = transformTitleResults([], '/vault');
      
      expect(result).toEqual({
        results: [],
        count: 0,
        filesSearched: 0
      });
    });
  });
});
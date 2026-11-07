/// <reference types="jest" />
import {
  MAX_TAG_LENGTH,
  MAX_TAGS,
  addTag,
  cleanTag,
  hasTag,
  normalizeTags,
  tagsByUse,
} from '../tags';

describe('tags', () => {
  it('cleans typed tags', () => {
    expect(cleanTag('  #teething ')).toBe('teething');
    expect(cleanTag('##day   care')).toBe('day care');
    expect(cleanTag(' # ')).toBe('');
    expect(cleanTag('x'.repeat(40))).toHaveLength(MAX_TAG_LENGTH);
  });

  it('normalizes stored lists', () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags('teething')).toEqual([]);
    expect(normalizeTags(['Teething', 'teething', 3, '', '#Daycare'])).toEqual([
      'Teething',
      'Daycare',
    ]);
    const many = Array.from({ length: 15 }, (_, i) => `t${i}`);
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS);
  });

  it('adds a tag once, ignoring case', () => {
    expect(addTag(['Teething'], ' #new ')).toEqual(['Teething', 'new']);
    expect(addTag(['Teething'], 'TEETHING')).toEqual(['Teething']);
    expect(addTag(['Teething'], '  ')).toEqual(['Teething']);
    expect(hasTag({ tags: ['Teething'] }, 'teething')).toBe(true);
    expect(hasTag({ tags: [] }, 'teething')).toBe(false);
  });

  it('orders tags by use, then by last use', () => {
    expect(
      tagsByUse([
        { start: 1, tags: ['daycare'] },
        { start: 2, tags: ['Grandma'] },
        { start: 3, tags: ['grandma', 'teething'] },
        { start: 4, tags: ['vitamin D'] },
      ]),
    ).toEqual(['grandma', 'vitamin D', 'teething', 'daycare']);
  });
});

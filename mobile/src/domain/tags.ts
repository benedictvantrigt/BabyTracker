import type { Entry } from './types';

/** Longest tag, in characters, and most tags on one entry. */
export const MAX_TAG_LENGTH = 24;
export const MAX_TAGS = 10;

/**
 * Cleans one typed tag: drops a leading "#", trims, collapses spaces and caps the length.
 * Returns '' for nothing usable.
 */
export function cleanTag(tag: string): string {
  return tag
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^#+\s*/, '')
    .slice(0, MAX_TAG_LENGTH)
    .trim();
}

/**
 * A tag list as stored: cleaned, without empty tags or duplicates (ignoring case; the
 * first spelling wins) and at most MAX_TAGS. Accepts anything, e.g. a row from another
 * app version.
 */
export function normalizeTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    const tag = cleanTag(t);
    const key = tag.toLocaleLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

/** Adds a typed tag to a list (no-op when empty, a duplicate, or the list is full). */
export function addTag(tags: string[], tag: string): string[] {
  return normalizeTags([...tags, tag]);
}

export function hasTag(entry: Pick<Entry, 'tags'>, tag: string): boolean {
  const key = tag.toLocaleLowerCase();
  return entry.tags.some((t) => t.toLocaleLowerCase() === key);
}

/**
 * Tags in use, most used first (ties: most recently used first), spelled as last used.
 * `entries` may be in any order.
 */
export function tagsByUse(entries: Pick<Entry, 'tags' | 'start'>[]): string[] {
  const stats = new Map<string, { tag: string; count: number; last: number }>();
  for (const e of entries) {
    for (const tag of e.tags) {
      const key = tag.toLocaleLowerCase();
      const s = stats.get(key);
      if (!s) stats.set(key, { tag, count: 1, last: e.start });
      else {
        s.count += 1;
        if (e.start > s.last) Object.assign(s, { tag, last: e.start });
      }
    }
  }
  return [...stats.values()].sort((a, b) => b.count - a.count || b.last - a.last).map((s) => s.tag);
}

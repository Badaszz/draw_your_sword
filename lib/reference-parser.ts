// Phase 2 — Reference/book detection. Runs entirely client-side before any
// network call. Two outcomes:
//   1. Direct reference ("John 3:16", "Rom 8:28-30") -> instant lookup, no search.
//   2. Bare book mention ("Philippians on joy") -> book_filter="Philippians",
//      stripped from the text that gets sent to search ("joy").

import { BOOK_ALIASES, SORTED_ALIASES } from './books';

export type DirectReference = {
  type: 'direct';
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number | null; // null when it's a single verse
};

export type BookFilteredQuery = {
  type: 'filtered';
  book: string | null;
  searchText: string; // original text with the book mention stripped out
};

export type ParsedQuery = DirectReference | BookFilteredQuery;

// Build an alternation of all aliases, escaped, longest first so greedy
// matching prefers "1 corinthians" over "1".
const ALIAS_PATTERN = SORTED_ALIASES.map((a) =>
  a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
).join('|');

// Matches: <book> <chapter>:<verse>[-<verse>]
// e.g. "John 3:16", "1 Corinthians 13:4-7", "rom 8:28"
const DIRECT_REF_RE = new RegExp(
  `\\b(${ALIAS_PATTERN})\\.?\\s+(\\d{1,3})\\s*:\\s*(\\d{1,3})(?:\\s*-\\s*(\\d{1,3}))?\\b`,
  'i'
);

// Matches a bare book mention with no chapter:verse attached, so it can be
// stripped from free text (e.g. "Philippians on joy" -> book="Philippians").
const BARE_BOOK_RE = new RegExp(`\\b(${ALIAS_PATTERN})\\b\\.?`, 'i');

export function parseQuery(rawInput: string): ParsedQuery {
  const input = rawInput.trim();

  const directMatch = input.match(DIRECT_REF_RE);
  if (directMatch) {
    const [, aliasRaw, chapterRaw, verseStartRaw, verseEndRaw] = directMatch;
    const book = BOOK_ALIASES[aliasRaw.toLowerCase()];
    if (book) {
      return {
        type: 'direct',
        book,
        chapter: parseInt(chapterRaw, 10),
        verseStart: parseInt(verseStartRaw, 10),
        verseEnd: verseEndRaw ? parseInt(verseEndRaw, 10) : null,
      };
    }
  }

  const bareMatch = input.match(BARE_BOOK_RE);
  if (bareMatch) {
    const alias = bareMatch[1].toLowerCase();
    const book = BOOK_ALIASES[alias];
    const searchText = input.replace(bareMatch[0], '').replace(/\s+/g, ' ').trim();
    return { type: 'filtered', book: book ?? null, searchText };
  }

  return { type: 'filtered', book: null, searchText: input };
}

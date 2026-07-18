// Phase 5 — Passage assembly.
// Takes raw verse hits from hybrid_search() and expands each into a ±2-verse
// window, merges overlapping/adjacent windows within the same chapter into a
// single range (e.g. Joshua 1:7-9), and ranks passages by their strongest
// constituent verse's score.

export type VerseHit = {
  id: number;
  book: string;
  chapter: number;
  verse: number;
  text: string;
  score: number;
};

export type VerseRow = {
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

export type Passage = {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
  verses: VerseRow[];
  score: number; // strongest constituent verse's score
  reference: string; // e.g. "Joshua 1:7-9" or "John 3:16"
};

const CONTEXT_RADIUS = 2;

/**
 * fetchWindowVerses should return every verse row needed to fill all windows
 * (book+chapter+verse range lookups). Passed in so this module stays free of
 * any direct Supabase dependency — easier to test and to swap the data source.
 */
export async function assemblePassages(
  hits: VerseHit[],
  fetchWindowVerses: (
    windows: { book: string; chapter: number; verseStart: number; verseEnd: number }[]
  ) => Promise<VerseRow[]>
): Promise<Passage[]> {
  if (hits.length === 0) return [];

  // 1. Build raw ±2 windows per hit, grouped by book+chapter.
  type RawWindow = { book: string; chapter: number; start: number; end: number; score: number };
  const windowsByChapter = new Map<string, RawWindow[]>();

  for (const hit of hits) {
    const key = `${hit.book}::${hit.chapter}`;
    const w: RawWindow = {
      book: hit.book,
      chapter: hit.chapter,
      start: Math.max(1, hit.verse - CONTEXT_RADIUS),
      end: hit.verse + CONTEXT_RADIUS,
      score: hit.score,
    };
    if (!windowsByChapter.has(key)) windowsByChapter.set(key, []);
    windowsByChapter.get(key)!.push(w);
  }

  // 2. Merge overlapping/adjacent windows within each chapter.
  const merged: RawWindow[] = [];
  for (const windows of windowsByChapter.values()) {
    windows.sort((a, b) => a.start - b.start);
    let current: RawWindow | null = null;

    for (const w of windows) {
      if (!current) {
        current = { ...w };
        continue;
      }
      // Adjacent or overlapping (allow a 1-verse gap to still merge, since
      // that gap is inside both windows' context anyway).
      if (w.start <= current.end + 1) {
        current.end = Math.max(current.end, w.end);
        current.score = Math.max(current.score, w.score);
      } else {
        merged.push(current);
        current = { ...w };
      }
    }
    if (current) merged.push(current);
  }

  // 3. Fetch actual verse text for every merged window.
  const rows = await fetchWindowVerses(
    merged.map((m) => ({
      book: m.book,
      chapter: m.chapter,
      verseStart: m.start,
      verseEnd: m.end,
    }))
  );

  // 4. Assemble Passage objects, ranked by score descending.
  const passages: Passage[] = merged.map((m) => {
    const verses = rows
      .filter((r) => r.book === m.book && r.chapter === m.chapter && r.verse >= m.start && r.verse <= m.end)
      .sort((a, b) => a.verse - b.verse);

    const reference =
      m.start === m.end
        ? `${m.book} ${m.chapter}:${m.start}`
        : `${m.book} ${m.chapter}:${m.start}-${m.end}`;

    return {
      book: m.book,
      chapter: m.chapter,
      verseStart: m.start,
      verseEnd: m.end,
      verses,
      score: m.score,
      reference,
    };
  });

  passages.sort((a, b) => b.score - a.score);
  return passages;
}

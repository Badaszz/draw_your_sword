// scripts/fetch-web-bible.mjs
//
// Downloads the WEB (World English Bible) translation from
// https://github.com/TehShrike/world-english-bible — a JSON-per-book mirror
// of the public-domain WEB text — and converts it straight into
// data/verses.json, in the exact shape the rest of the pipeline expects.
//
// USAGE:
//   node scripts/fetch-web-bible.mjs
//
// No API key, no scraping, no rate-limit concerns — this is a static file
// per book hosted on GitHub's raw CDN. Verified against philemon.json,
// psalms.json, john.json, 1corinthians.json, songofsolomon.json,
// revelation.json, and 1samuel.json before writing this script.

import { writeFileSync } from 'node:fs';

const RAW_BASE = 'https://raw.githubusercontent.com/TehShrike/world-english-bible/master/json';

// Canonical book name -> filename slug in that repo (lowercased, spaces removed).
const BOOKS = [
  ['Genesis', 'genesis'], ['Exodus', 'exodus'], ['Leviticus', 'leviticus'],
  ['Numbers', 'numbers'], ['Deuteronomy', 'deuteronomy'], ['Joshua', 'joshua'],
  ['Judges', 'judges'], ['Ruth', 'ruth'], ['1 Samuel', '1samuel'],
  ['2 Samuel', '2samuel'], ['1 Kings', '1kings'], ['2 Kings', '2kings'],
  ['1 Chronicles', '1chronicles'], ['2 Chronicles', '2chronicles'],
  ['Ezra', 'ezra'], ['Nehemiah', 'nehemiah'], ['Esther', 'esther'],
  ['Job', 'job'], ['Psalms', 'psalms'], ['Proverbs', 'proverbs'],
  ['Ecclesiastes', 'ecclesiastes'], ['Song of Solomon', 'songofsolomon'],
  ['Isaiah', 'isaiah'], ['Jeremiah', 'jeremiah'], ['Lamentations', 'lamentations'],
  ['Ezekiel', 'ezekiel'], ['Daniel', 'daniel'], ['Hosea', 'hosea'],
  ['Joel', 'joel'], ['Amos', 'amos'], ['Obadiah', 'obadiah'], ['Jonah', 'jonah'],
  ['Micah', 'micah'], ['Nahum', 'nahum'], ['Habakkuk', 'habakkuk'],
  ['Zephaniah', 'zephaniah'], ['Haggai', 'haggai'], ['Zechariah', 'zechariah'],
  ['Malachi', 'malachi'],
  ['Matthew', 'matthew'], ['Mark', 'mark'], ['Luke', 'luke'], ['John', 'john'],
  ['Acts', 'acts'], ['Romans', 'romans'], ['1 Corinthians', '1corinthians'],
  ['2 Corinthians', '2corinthians'], ['Galatians', 'galatians'],
  ['Ephesians', 'ephesians'], ['Philippians', 'philippians'],
  ['Colossians', 'colossians'], ['1 Thessalonians', '1thessalonians'],
  ['2 Thessalonians', '2thessalonians'], ['1 Timothy', '1timothy'],
  ['2 Timothy', '2timothy'], ['Titus', 'titus'], ['Philemon', 'philemon'],
  ['Hebrews', 'hebrews'], ['James', 'james'], ['1 Peter', '1peter'],
  ['2 Peter', '2peter'], ['1 John', '1john'], ['2 John', '2john'],
  ['3 John', '3john'], ['Jude', 'jude'], ['Revelation', 'revelation'],
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Converts one book's raw entry array into {book, chapter, verse, text} rows.
 *
 * The source format is a flat array of typed entries (paragraph/line/stanza
 * text, breaks, headers, etc). Verse text is spread across one or more
 * entries that share the same chapterNumber+verseNumber (e.g. each line of
 * a Psalm is a separate entry) — headers and structural markers don't carry
 * verseNumber/value at all, so filtering on "has both" cleanly skips them
 * regardless of what type name is used.
 */
function extractVerses(bookName, entries) {
  const order = []; // preserves first-seen order of (chapter, verse) pairs
  const textByKey = new Map();

  for (const entry of entries) {
    if (entry.chapterNumber == null || entry.verseNumber == null || entry.value == null) {
      continue;
    }
    const key = `${entry.chapterNumber}:${entry.verseNumber}`;
    if (!textByKey.has(key)) {
      textByKey.set(key, []);
      order.push({ chapter: entry.chapterNumber, verse: entry.verseNumber, key });
    }
    textByKey.get(key).push(entry.value);
  }

  return order.map(({ chapter, verse, key }) => ({
    book: bookName,
    chapter,
    verse,
    text: textByKey.get(key).join('').replace(/\s+/g, ' ').trim(),
  }));
}

async function main() {
  const allVerses = [];

  for (const [bookName, slug] of BOOKS) {
    const url = `${RAW_BASE}/${slug}.json`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch ${bookName} (${url}): HTTP ${res.status}`);
    }
    const entries = await res.json();
    const verses = extractVerses(bookName, entries);
    allVerses.push(...verses);
    console.log(`${bookName}: ${verses.length} verses`);

    await sleep(50); // be polite to the CDN, not strictly required
  }

  writeFileSync('data/verses.json', JSON.stringify(allVerses, null, 2));
  console.log(`\nWrote ${allVerses.length} verses to data/verses.json`);
  console.log('Expected total is ~31,086 verses — compare to catch any missing book.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

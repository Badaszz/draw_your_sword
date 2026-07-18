// scripts/build-verses-json.mjs
//
// Converts a raw source file into data/verses.json.
//
// USAGE:
//   node scripts/build-verses-json.mjs data/source.csv
//
// Supports two common CSV shapes (auto-detected from the header row):
//   A) book,chapter,verse,text                 <- book already a name
//   B) book_id,chapter,verse,text               <- numeric book id, needs BOOK_ID_MAP
//
// If your source is JSON instead, skip the CSV parsing below and adapt
// `rows` to come from `JSON.parse(readFileSync(...))` — the normalization
// and validation logic (canonicalizeBook, the write step) stays the same.

import { readFileSync, writeFileSync } from 'node:fs';

// Same aliases as lib/books.ts, kept in sync manually since this is a plain
// Node script (no TS loader). If you add aliases in lib/books.ts, mirror
// them here too.
const BOOK_ALIASES = {
  genesis: 'Genesis', gen: 'Genesis',
  exodus: 'Exodus', exod: 'Exodus', ex: 'Exodus',
  leviticus: 'Leviticus', lev: 'Leviticus',
  numbers: 'Numbers', num: 'Numbers',
  deuteronomy: 'Deuteronomy', deut: 'Deuteronomy', dt: 'Deuteronomy',
  joshua: 'Joshua', josh: 'Joshua',
  judges: 'Judges', judg: 'Judges',
  ruth: 'Ruth',
  '1 samuel': '1 Samuel', '1samuel': '1 Samuel', 'i samuel': '1 Samuel',
  '2 samuel': '2 Samuel', '2samuel': '2 Samuel', 'ii samuel': '2 Samuel',
  '1 kings': '1 Kings', 'i kings': '1 Kings',
  '2 kings': '2 Kings', 'ii kings': '2 Kings',
  '1 chronicles': '1 Chronicles', '1 chron': '1 Chronicles',
  '2 chronicles': '2 Chronicles', '2 chron': '2 Chronicles',
  ezra: 'Ezra', nehemiah: 'Nehemiah', neh: 'Nehemiah',
  esther: 'Esther', job: 'Job',
  psalms: 'Psalms', psalm: 'Psalms', ps: 'Psalms',
  proverbs: 'Proverbs', prov: 'Proverbs',
  ecclesiastes: 'Ecclesiastes', eccl: 'Ecclesiastes',
  'song of solomon': 'Song of Solomon', 'song of songs': 'Song of Solomon',
  isaiah: 'Isaiah', isa: 'Isaiah',
  jeremiah: 'Jeremiah', jer: 'Jeremiah',
  lamentations: 'Lamentations', lam: 'Lamentations',
  ezekiel: 'Ezekiel', ezek: 'Ezekiel',
  daniel: 'Daniel', dan: 'Daniel',
  hosea: 'Hosea', joel: 'Joel', amos: 'Amos',
  obadiah: 'Obadiah', jonah: 'Jonah',
  micah: 'Micah', nahum: 'Nahum', habakkuk: 'Habakkuk',
  zephaniah: 'Zephaniah', haggai: 'Haggai',
  zechariah: 'Zechariah', malachi: 'Malachi',
  matthew: 'Matthew', matt: 'Matthew',
  mark: 'Mark', luke: 'Luke', john: 'John', acts: 'Acts',
  romans: 'Romans', rom: 'Romans',
  '1 corinthians': '1 Corinthians', '1 cor': '1 Corinthians',
  '2 corinthians': '2 Corinthians', '2 cor': '2 Corinthians',
  galatians: 'Galatians', gal: 'Galatians',
  ephesians: 'Ephesians', eph: 'Ephesians',
  philippians: 'Philippians', phil: 'Philippians',
  colossians: 'Colossians', col: 'Colossians',
  '1 thessalonians': '1 Thessalonians', '1 thess': '1 Thessalonians',
  '2 thessalonians': '2 Thessalonians', '2 thess': '2 Thessalonians',
  '1 timothy': '1 Timothy', '1 tim': '1 Timothy',
  '2 timothy': '2 Timothy', '2 tim': '2 Timothy',
  titus: 'Titus', philemon: 'Philemon',
  hebrews: 'Hebrews', heb: 'Hebrews',
  james: 'James', jas: 'James',
  '1 peter': '1 Peter', '1 pet': '1 Peter',
  '2 peter': '2 Peter', '2 pet': '2 Peter',
  '1 john': '1 John', '2 john': '2 John', '3 john': '3 John',
  jude: 'Jude',
  revelation: 'Revelation', rev: 'Revelation',
};

// Fill this in ONLY if your source uses numeric book IDs (shape B above).
// scrollmapper/bible_databases' key_english.csv gives you this mapping —
// copy book_id -> book_name pairs from there.
const BOOK_ID_MAP = {
  // 1: 'Genesis', 2: 'Exodus', ... fill from your source's book-key file
};

function canonicalizeBook(raw) {
  if (typeof raw === 'number' || /^\d+$/.test(raw)) {
    const name = BOOK_ID_MAP[Number(raw)];
    if (!name) throw new Error(`No BOOK_ID_MAP entry for id ${raw} — fill it in.`);
    return name;
  }
  const key = String(raw).trim().toLowerCase();
  const canonical = BOOK_ALIASES[key];
  if (!canonical) {
    throw new Error(`Unrecognized book name "${raw}" — add it to BOOK_ALIASES.`);
  }
  return canonical;
}

function parseCsv(content) {
  const [headerLine, ...lines] = content.trim().split('\n');
  const headers = headerLine.split(',').map((h) => h.trim().toLowerCase());

  return lines
    .filter((l) => l.trim().length > 0)
    .map((line) => {
      // Naive CSV split — fine for most Bible exports since verse text
      // rarely contains commas inside quotes. If yours does, swap in a
      // proper CSV parser (e.g. `papaparse` in Node).
      const cells = line.split(',');
      const row = {};
      headers.forEach((h, i) => (row[h] = cells[i]));
      return row;
    });
}

function main() {
  const sourcePath = process.argv[2];
  if (!sourcePath) {
    console.error('Usage: node scripts/build-verses-json.mjs <path-to-source.csv>');
    process.exit(1);
  }

  const raw = readFileSync(sourcePath, 'utf-8');
  const rows = parseCsv(raw);

  const bookKey = rows[0].book ? 'book' : rows[0].book_id ? 'book_id' : rows[0].b ? 'b' : null;
  const chapterKey = rows[0].chapter ? 'chapter' : 'c';
  const verseKey = rows[0].verse ? 'verse' : 'v';
  const textKey = rows[0].text ? 'text' : 't';

  if (!bookKey) {
    throw new Error(
      `Couldn't find a book column. Header was: ${Object.keys(rows[0]).join(', ')}`
    );
  }

  const verses = rows.map((r) => ({
    book: canonicalizeBook(r[bookKey]),
    chapter: parseInt(r[chapterKey], 10),
    verse: parseInt(r[verseKey], 10),
    text: r[textKey].trim(),
  }));

  writeFileSync('data/verses.json', JSON.stringify(verses, null, 2));
  console.log(`Wrote ${verses.length} verses to data/verses.json`);

  // Quick sanity check
  const missing = verses.filter((v) => !v.book || !v.chapter || !v.verse || !v.text);
  if (missing.length > 0) {
    console.warn(`Warning: ${missing.length} rows have missing fields — inspect before running the embedding script.`);
  }
}

main();

// Phase 1 — Data pipeline (build-time, one-time script)
//
// Reads a verse-by-verse JSON file, embeds every verse with all-MiniLM-L6-v2
// (same model used client-side, so query vectors and verse vectors live in
// the same space), and bulk-inserts into Supabase.
//
// USAGE:
//   node scripts/generate-embeddings.mjs
//
// INPUT FORMAT (data/verses.json):
//   [
//     { "book": "Genesis", "chapter": 1, "verse": 1, "text": "In the beginning..." },
//     ...
//   ]
//
// WHERE TO GET THE DATA:
//   - KJV (public domain): e.g. https://github.com/scrollmapper/bible_databases
//     or https://github.com/aruljohn/Bible-kjv (verify license terms yourself).
//   - NKJV (COPYRIGHTED — Thomas Nelson/HarperCollins): you must have your own
//     licensed source. Common options: the API.Bible service (requires an
//     API key + license acceptance) or a dataset you've licensed directly.
//     DO NOT bulk-scrape NKJV text from a site that doesn't grant that right —
//     Thomas Nelson enforces this. Normalize whatever source you use into the
//     JSON shape above before running this script.

import { pipeline } from '@xenova/transformers';
import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import 'dotenv/config';

const BATCH_SIZE = 200; // rows per Supabase insert call
const EMBED_BATCH_SIZE = 32; // verses embedded per model.forward call

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local'
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function loadVerses() {
  const raw = await readFile(new URL('../data/verses.json', import.meta.url), 'utf-8');
  const verses = JSON.parse(raw);
  console.log(`Loaded ${verses.length} verses from data/verses.json`);
  return verses;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const verses = await loadVerses();

  console.log('Loading all-MiniLM-L6-v2 (quantized ONNX)...');
  const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    quantized: true,
  });

  const batches = chunk(verses, EMBED_BATCH_SIZE);
  let processed = 0;
  const embedded = [];

  for (const batch of batches) {
    const texts = batch.map((v) => v.text);
    const output = await embedder(texts, { pooling: 'mean', normalize: true });

    // output.dims = [batch, 384] when given an array of texts
    const dims = output.dims;
    const data = output.data;
    const vecLen = dims[dims.length - 1];

    for (let i = 0; i < batch.length; i++) {
      const vec = Array.from(data.slice(i * vecLen, (i + 1) * vecLen));
      embedded.push({ ...batch[i], embedding: vec });
    }

    processed += batch.length;
    if (processed % 1000 < EMBED_BATCH_SIZE) {
      console.log(`Embedded ${processed}/${verses.length}`);
    }
  }

  console.log('Embedding complete. Bulk inserting into Supabase...');

  const insertBatches = chunk(embedded, BATCH_SIZE);
  let inserted = 0;

  for (const b of insertBatches) {
    const { error } = await supabase.from('verses').upsert(
      b.map((v) => ({
        book: v.book,
        chapter: v.chapter,
        verse: v.verse,
        text: v.text,
        embedding: v.embedding,
      })),
      { onConflict: 'book,chapter,verse' }
    );

    if (error) {
      console.error('Insert error:', error);
      process.exit(1);
    }

    inserted += b.length;
    console.log(`Inserted ${inserted}/${embedded.length}`);
  }

  console.log('Done. Verify row count and spot-check embeddings in the Supabase SQL editor.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

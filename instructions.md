# Bible Hybrid Search — Build Instructions

Everything below assumes you're starting from this folder as your repo root.
Follow it phase by phase — it matches the phases in the implementation plan.

⚠️ **Read this before Phase 1.** The original plan used KJV (public domain).
You've switched to **NKJV, which is copyrighted** (Thomas Nelson / HarperCollins).
That doesn't block anything here — the schema, indexes, RPC, and app code are
translation-agnostic — but it changes **how you source the text**:

- You cannot bulk-scrape NKJV text from a random GitHub repo or website. Most
  of those either don't have redistribution rights or explicitly forbid it.
- Legitimate options: **API.Bible** (bible-api.com's parent org, requires an
  API key + accepting their terms — check what their terms allow for storing
  verses in your own DB), or a dataset you've separately licensed.
- Whatever source you use, normalize it into the `data/verses.json` shape
  described in Phase 1 before running the embedding script. The rest of the
  pipeline doesn't care where the text came from.
- If licensing NKJV turns out to be a hassle, KJV or WEB (World English Bible,
  also public domain) drop in with zero code changes — just different source
  data.

---

## Phase 0 — Lock decisions (done)

- Translation: NKJV (see licensing note above)
- Stack: Next.js (TypeScript, App Router) + Supabase (Postgres, pgvector,
  full-text search) + Vercel
- Scope: web only, no auth, no sermon notes, no LLM layer

---

## Phase 0.5 — Repo & project init

```bash
# from an empty directory, or copy this scaffold in
git init
npm install
```

Copy `.env.local.example` to `.env.local` and fill in the three Supabase
values (you'll get these in the next step):

```bash
cp .env.local.example .env.local
```

Create a `.gitignore`-respecting first commit once you've verified `npm run
build` doesn't error (it will, until Supabase env vars exist — that's fine at
this stage, just eyeball for syntax errors):

```bash
git add -A
git commit -m "Initial scaffold: Next.js + Supabase hybrid Bible search"
```

---

## Phase 1 — Data pipeline

**1. Create a Supabase project** at supabase.com (free tier is fine for ~31k
rows). Grab three values from Project Settings → API:
- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose
  this to the browser, never commit it)

**2. Run the schema.** In the Supabase SQL editor, run, in order:
1. `sql/001_schema.sql` — creates the `verses` table, tsvector column, GIN
   index, HNSW index
2. `sql/002_hybrid_search_function.sql` — creates the `hybrid_search()` RPC

**3. Source your verse data** (see the NKJV note above) and normalize it into
`data/verses.json`:

```json
[
  { "book": "Genesis", "chapter": 1, "verse": 1, "text": "In the beginning God created the heavens and the earth." }
]
```

Book names must exactly match the canonical names in `lib/books.ts`
(`CANONICAL_BOOKS`) — e.g. `"1 Corinthians"` not `"1Corinthians"` or
`"I Corinthians"` — since that's what `book_filter` boosts against.

**4. Generate embeddings and bulk-insert:**

```bash
npm run generate-embeddings
```

This loads `all-MiniLM-L6-v2` (quantized ONNX, ~90MB, downloads once and
caches locally under `node_modules`/transformers.js cache), embeds every
verse in batches of 32, and upserts into Supabase in batches of 200. For
~31,000 verses expect this to take a while on CPU (order of 20-40 minutes
depending on your machine) — it's a one-time job, so let it run.

**5. Sanity-check in the SQL editor:**

```sql
select count(*) from verses;                          -- should be ~31,000
select * from verses where book = 'John' and chapter = 3 and verse = 16;
select embedding is not null as has_embedding, count(*)
  from verses group by 1;                              -- should all be true
```

---

## Phase 2 — Reference/book detection

Already implemented in `lib/books.ts` and `lib/reference-parser.ts` — no
backend involved. Sanity-check it yourself in a scratch file or the browser
console once the app is running:

```ts
parseQuery('John 3:16')
// -> { type: 'direct', book: 'John', chapter: 3, verseStart: 16, verseEnd: null }

parseQuery('Philippians on joy')
// -> { type: 'filtered', book: 'Philippians', searchText: 'on joy' }

parseQuery('God is faithful')
// -> { type: 'filtered', book: null, searchText: 'God is faithful' }
```

If you add more abbreviations later, they go in `RAW_ALIASES` in
`lib/books.ts`.

---

## Phase 3 — Hybrid search backend

Already created via `sql/002_hybrid_search_function.sql` in Phase 1. Test it
directly before wiring up the app — you'll need a hand-built embedding, which
you can get from the Python or JS console, or just test with `query_text`
only first (vector param can be a zero-vector placeholder):

```sql
select * from hybrid_search(
  query_text := 'faithfulness in hard times',
  query_embedding := (select embedding from verses limit 1), -- placeholder for a smoke test
  book_filter := null,
  match_count := 10
);
```

Once the app is running you can copy a real embedding out of the browser
network tab (the `/api/search` request body) and paste it into a raw SQL
call to debug ranking issues directly in Postgres.

---

## Phase 4 — Client-side embedding generation

Already implemented in `lib/embeddings-client.ts`, called from
`components/SearchBar.tsx` on mount (`preloadEmbedder()`) so the ~90MB model
download starts as soon as the page loads rather than on first keystroke.
transformers.js handles browser caching itself — nothing extra to configure.

Note: `next.config.js` stubs `fs`/`path`/`crypto` in the webpack config
because transformers.js's Node-oriented internals otherwise fail to bundle
for the browser. If you hit a similar bundling error for another dependency,
same fix pattern applies.

---

## Phase 5 — API route + passage assembly

Already implemented:
- `app/api/search/route.ts` — the API route
- `lib/passage-assembly.ts` — the ±2-verse expand/merge/rank logic

Test it directly once Phase 1-4 are wired up:

```bash
curl -X POST http://localhost:3000/api/search \
  -H "Content-Type: application/json" \
  -d '{"directReference": {"book": "John", "chapter": 3, "verseStart": 16, "verseEnd": null}}'
```

---

## Phase 6 — Frontend UI

Already implemented (`app/page.tsx`, `components/SearchBar.tsx`,
`components/ResultsList.tsx`), deliberately bare — no styling framework, just
enough CSS in `app/globals.css` to be readable. Run it locally:

```bash
npm run dev
```

Open `http://localhost:3000` and try:
- `John 3:16` — direct reference, pinned result
- `Philippians on joy` — book-boosted hybrid search
- `God's faithfulness in hard times` — pure semantic query, no exact words
  in most matching verses

---

## Phase 7 — Deploy & QA

**Deploy:**
1. Push the repo to GitHub.
2. Import it into Vercel (vercel.com → New Project → your repo).
3. Add the three env vars from `.env.local` in Vercel's Project Settings →
   Environment Variables. (`SUPABASE_SERVICE_ROLE_KEY` isn't actually needed
   at runtime — only by the offline embedding script — but it's harmless to
   skip adding it to Vercel entirely; just don't expose it as `NEXT_PUBLIC_*`
   anywhere.)
4. Deploy.

**QA — test these tricky cases against the live deployment:**
| Case | Example | What to check |
|---|---|---|
| Exact phrase | `"the Lord is my shepherd"` | Psalm 23:1 ranks first |
| Paraphrase/conceptual | `"trusting God when scared"` | Returns relevant verses with no literal word overlap |
| Book + topic combo | `"Philippians joy"` | Philippians results boosted above equally-relevant verses elsewhere |
| Direct reference | `"Rom 8:28"` | Instant pinned result, no search latency |
| Misspelled book name | `"Filipians on joy"` | Decide: do you want fuzzy matching here? Current implementation requires exact alias match — see Next Steps |
| Passage merging | Any hit-dense passage (e.g. search "love" in 1 Corinthians) | Adjacent verses merge into one range instead of listing duplicates |

---

## Next steps (post-v1, out of this build's scope)

- **Fuzzy book-name matching** — current parser requires an exact alias hit;
  consider a small edit-distance check against `SORTED_ALIASES` for typos.
- **Sermon notes** — add a second table + separate embedding pipeline, decide
  whether it shares the same `hybrid_search()` function or gets its own.
- **Auth** — if you want personalized history/saved searches.
- **LLM layer** — a toggle for conversational/explained results on top of raw
  passage retrieval.
- **Desktop (Tauri) / mobile (Capacitor)** — the core `lib/` modules
  (parsing, embedding, passage assembly) are framework-agnostic enough to
  reuse; only the Supabase calls and UI shell would need adapting.
- **Result caching** — common queries could be cached (Vercel KV or similar)
  since the verse corpus never changes.

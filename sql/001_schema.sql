-- Phase 1: Data pipeline schema
-- Run this in the Supabase SQL editor (or via `supabase db push` if you use the CLI).

-- pgvector extension (Supabase has this available, just needs enabling once per project)
create extension if not exists vector;

create table if not exists verses (
  id            bigint generated always as identity primary key,
  book          text not null,
  chapter       integer not null,
  verse         integer not null,
  text          text not null,
  embedding     vector(384),
  -- generated tsvector column for full-text search (english config is fine for NKJV/KJV)
  text_search   tsvector generated always as (to_tsvector('english', text)) stored,
  unique (book, chapter, verse)
);

-- Full-text search index
create index if not exists verses_text_search_idx
  on verses using gin (text_search);

-- Vector similarity index (HNSW — good recall/speed tradeoff, available in pgvector 0.5+)
-- m=16, ef_construction=64 are reasonable defaults for ~31k rows.
create index if not exists verses_embedding_hnsw_idx
  on verses using hnsw (embedding vector_cosine_ops)
  with (m = 16, ef_construction = 64);

-- Helpful for pure reference lookups (Phase 2 direct-reference path)
create index if not exists verses_book_chapter_verse_idx
  on verses (book, chapter, verse);

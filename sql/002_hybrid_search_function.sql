-- Phase 3: hybrid_search() — full-text CTE + vector CTE, merged via Reciprocal Rank Fusion.
-- book_filter BOOSTS matching-book rows (multiplies score), it does not hard-filter them out.

create or replace function hybrid_search(
  query_text text,               -- raw text sent to websearch_to_tsquery (book mention already stripped client-side)
  query_embedding vector(384),   -- 384-dim query embedding from transformers.js
  book_filter text default null, -- e.g. 'Philippians', or null if no book was detected
  match_count int default 40,    -- how many fused rows to return (before passage assembly)
  rrf_k int default 50,          -- Reciprocal Rank Fusion constant
  book_boost float default 1.5   -- multiplier applied to fused score when book matches
)
returns table (
  id bigint,
  book text,
  chapter int,
  verse int,
  text text,
  score float
)
language sql
stable
as $$
  with fts as (
    select
      v.id,
      row_number() over (
        order by ts_rank_cd(v.text_search, websearch_to_tsquery('english', query_text)) desc
      ) as rank_ix
    from verses v
    where query_text is not null
      and query_text <> ''
      and v.text_search @@ websearch_to_tsquery('english', query_text)
    limit 200
  ),
  vec as (
    select
      v.id,
      row_number() over (
        order by v.embedding <=> query_embedding
      ) as rank_ix
    from verses v
    where query_embedding is not null
    order by v.embedding <=> query_embedding
    limit 200
  ),
  fused as (
    select
      coalesce(fts.id, vec.id) as id,
      (
        coalesce(1.0 / (rrf_k + fts.rank_ix), 0.0) +
        coalesce(1.0 / (rrf_k + vec.rank_ix), 0.0)
      ) as rrf_score
    from fts
    full outer join vec on fts.id = vec.id
  )
  select
    v.id,
    v.book,
    v.chapter,
    v.verse,
    v.text,
    (
      fused.rrf_score *
      case
        when book_filter is not null and v.book = book_filter then book_boost
        else 1.0
      end
    ) as score
  from fused
  join verses v on v.id = fused.id
  order by score desc
  limit match_count;
$$;

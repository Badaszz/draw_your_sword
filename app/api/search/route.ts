import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase-client';
import { assemblePassages, type VerseHit, type VerseRow } from '@/lib/passage-assembly';

export const runtime = 'nodejs';

type SearchRequestBody = {
  query?: string; 
  embedding: number[]; 
  bookFilter?: string | null;
};

type DirectReferenceBody = {
  directReference: {
    book: string;
    chapter: number;
    verseStart: number;
    verseEnd: number | null;
  };
};

async function fetchWindowVerses(
  windows: { book: string; chapter: number; verseStart: number; verseEnd: number }[]
): Promise<VerseRow[]> {
  if (windows.length === 0) return [];

  const results = await Promise.all(
    windows.map((w) =>
      supabase
        .from('verses')
        .select('book, chapter, verse, text')
        .eq('book', w.book)
        .eq('chapter', w.chapter)
        .gte('verse', w.verseStart)
        .lte('verse', w.verseEnd)
    )
  );

  const rows: VerseRow[] = [];
  for (const r of results) {
    if (r.error) throw new Error(r.error.message);
    if (r.data) rows.push(...(r.data as VerseRow[]));
  }
  return rows;
}

export async function POST(req: NextRequest) {
  let body: SearchRequestBody | DirectReferenceBody;

  // Safely parse the JSON body
  try {
    body = (await req.json()) as SearchRequestBody | DirectReferenceBody;
  } catch (err) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // --- Direct reference path: instant lookup, no search involved ---
  if ('directReference' in body) {
    const { book, chapter, verseStart, verseEnd } = body.directReference;
    const { data, error } = await supabase
      .from('verses')
      .select('book, chapter, verse, text')
      .eq('book', book)
      .eq('chapter', chapter)
      .gte('verse', verseStart)
      .lte('verse', verseEnd ?? verseStart)
      .order('verse', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // FIX: Check for empty arrays, as Supabase returns [] when no records match
    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'No verses found' }, { status: 404 });
    }

    const reference =
      verseEnd && verseEnd !== verseStart
        ? `${book} ${chapter}:${verseStart}-${verseEnd}`
        : `${book} ${chapter}:${verseStart}`;

    return NextResponse.json({
      mode: 'direct',
      passages: [
        {
          book,
          chapter,
          verseStart,
          verseEnd: verseEnd ?? verseStart,
          verses: data,
          score: 1,
          reference,
        },
      ],
    });
  }

  // --- Hybrid search path ---
  const { query, embedding, bookFilter } = body as SearchRequestBody;

  if (!embedding || embedding.length !== 384) {
    return NextResponse.json({ error: 'A 384-dim embedding is required.' }, { status: 400 });
  }

  const { data, error } = await supabase.rpc('hybrid_search', {
      query_text: query || '',
      query_embedding: embedding,
      book_filter: bookFilter ?? null,
      match_count: 40,
  });

  // console.log('[hybrid_search debug]', {
  //   queryText: query,
  //   embeddingLength: embedding?.length,
  //   error,
  //   dataLength: data?.length,
  // });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const hits = (data ?? []) as VerseHit[];

  if (hits.length === 0) {
    return NextResponse.json({ mode: 'search', passages: [] });
  }

  const passages = await assemblePassages(hits, fetchWindowVerses);

  return NextResponse.json({ mode: 'search', passages });
}
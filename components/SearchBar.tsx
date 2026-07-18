'use client';

import { useState, useEffect, useRef } from 'react';
import { parseQuery } from '@/lib/reference-parser';
import { embedQuery, preloadEmbedder } from '@/lib/embeddings-client';
import type { Passage } from '@/lib/passage-assembly';
import ResultsList from './ResultsList';

type LoadState = 'idle' | 'loading-model' | 'searching' | 'done' | 'error';

export default function SearchBar() {
  const [input, setInput] = useState('');
  const [passages, setPassages] = useState<Passage[]>([]);
  const [mode, setMode] = useState<'direct' | 'search' | null>(null);
  const [state, setState] = useState<LoadState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const modelPreloaded = useRef(false);

  useEffect(() => {
    // Kick off the model download as soon as the page mounts, not on first
    // keystroke, so the first real search doesn't eat the download latency.
    if (!modelPreloaded.current) {
      preloadEmbedder();
      modelPreloaded.current = true;
    }
  }, []);

  async function runSearch(raw: string) {
    if (!raw.trim()) return;
    setErrorMsg(null);

    const parsed = parseQuery(raw);

    try {
      if (parsed.type === 'direct') {
        setState('searching');
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            directReference: {
              book: parsed.book,
              chapter: parsed.chapter,
              verseStart: parsed.verseStart,
              verseEnd: parsed.verseEnd,
            },
          }),
        });
        const json = await res.json();
        if (json.error) throw new Error(json.error);
        setPassages(json.passages);
        setMode('direct');
        setState('done');
        return;
      }

      // Hybrid search path: needs a query embedding first.
      setState('loading-model');
      const embedding = await embedQuery(parsed.searchText || raw);

      setState('searching');
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: parsed.searchText,
          embedding,
          bookFilter: parsed.book,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPassages(json.passages);
      setMode('search');
      setState('done');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong.');
      setState('error');
    }
  }

  return (
    <div>
      <input
        type="text"
        placeholder="Search e.g. 'John 3:16' or 'Philippians on joy' or 'God's faithfulness in hard times'"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') runSearch(input);
        }}
      />

      {state === 'loading-model' && <p className="status">Loading search model (first visit only)...</p>}
      {state === 'searching' && <p className="status">Searching...</p>}
      {state === 'error' && <p className="status">Error: {errorMsg}</p>}

      <ResultsList passages={passages} mode={mode} />
    </div>
  );
}

import type { Passage } from '@/lib/passage-assembly';

export default function ResultsList({
  passages,
  mode,
}: {
  passages: Passage[];
  mode: 'direct' | 'search' | null;
}) {
  if (mode === null) return null;

  if (passages.length === 0) {
    return <p className="status">No results found. Try different wording, or check the book name spelling.</p>;
  }

  return (
    <div>
      {passages.map((p, i) => (
        <div className="passage" key={`${p.book}-${p.chapter}-${p.verseStart}-${i}`}>
          <div className="reference">
            {p.reference}
            {mode === 'direct' && i === 0 ? ' 📌' : ''}
          </div>
          <div>
            {p.verses.map((v) => (
              <span key={v.verse}>
                <span className="verse-num">{v.verse}</span>
                {v.text}{' '}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

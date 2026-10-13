import { useMemo, useState } from 'react';

export interface ProductImageProps {
  /**
   * Candidate image URLs in preference order. The first one that loads is shown.
   * Useful for grouped cards where one super's CDN image may 404 (e.g. a stale
   * Carrefour asset) while a sibling super's image is still valid.
   */
  sources: Array<string | null | undefined>;
  alt: string;
  className?: string;
}

/**
 * Renders the first candidate image that loads. On a load error it advances to
 * the next candidate, and once every candidate has failed it falls back to a
 * neutral cart glyph instead of a broken-image icon.
 */
export default function ProductImage({ sources, alt, className }: ProductImageProps) {
  // Dedupe and drop empties while preserving preference order.
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const s of sources) {
      if (s && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
    return out;
  }, [sources]);

  const [index, setIndex] = useState(0);
  const current = candidates[index];

  if (!current) {
    return <span className="text-5xl text-gray-200">🛒</span>;
  }

  return (
    <img
      key={current}
      src={current}
      alt={alt}
      className={className}
      onError={() => setIndex((i) => i + 1)}
    />
  );
}

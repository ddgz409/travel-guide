import type { PoiSearchResult } from "@travel-guide/shared";
import { QUICK_CARD_BG, QUICK_CARD_FALLBACK } from "./constants";

export function pickBestLandmarkMatch(
  query: string,
  results: PoiSearchResult[],
): PoiSearchResult | null {
  if (!results.length) return null;
  const q = query.replace(/\s+/g, "");
  const scored = results.map((r, i) => {
    const name = r.name.replace(/\s+/g, "");
    let score = 0;
    if (name === q) score += 100;
    if (name.includes(q) || q.includes(name)) score += 50;
    if (name.startsWith(q) || q.startsWith(name)) score += 20;
    score -= i;
    return { r, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].r : results[0];
}

export function quickCardBg(cardId: string, index: number): string {
  return (
    QUICK_CARD_BG[cardId] ||
    QUICK_CARD_FALLBACK[index % QUICK_CARD_FALLBACK.length]
  );
}

export type Pt = { x: number; y: number; z?: number };

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function std(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = avg(values);
  return Math.sqrt(avg(values.map((value) => (value - mean) ** 2)));
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Map a non-negative error onto 1–100. Zero error scores 100. */
export function scoreFromError(error: number, great: number, poor: number): number {
  if (!Number.isFinite(error) || !(poor > great) || !(great > 0)) return 70;
  const e = Math.max(0, error);
  if (e <= great) {
    return clamp(Math.round(100 - (e / great) * 10), 1, 100);
  }
  const t = (e - great) / (poor - great);
  return clamp(Math.round(90 - t * 36), 34, 90);
}

export function roundScore(n: number): number {
  if (!Number.isFinite(n)) return 70;
  return clamp(Math.round(n), 1, 100);
}

export type Span = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
};

export function span(lm: Pt[]): Span {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1, width: 1, height: 1, cx: 0.5, cy: 0.5 };
  }
  const width = Math.max(1e-6, maxX - minX);
  const height = Math.max(1e-6, maxY - minY);
  return { minX, maxX, minY, maxY, width, height, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}

/** Level the eye line so a tilted head is not scored as asymmetry. */
export function alignFrontal(lm: Pt[]): Pt[] {
  const a = lm[33];
  const b = lm[263];
  if (!a || !b) return lm.map((p) => ({ ...p }));
  const roll = Math.atan2(b.y - a.y, b.x - a.x);
  const cx = (a.x + b.x) / 2;
  const cy = (a.y + b.y) / 2;
  const cos = Math.cos(-roll);
  const sin = Math.sin(-roll);
  return lm.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos, z: p.z };
  });
}

export function midlineX(lm: Pt[]): number {
  const box = span(lm);
  const central = lm.filter((p) => Math.abs(p.x - box.cx) < box.width * 0.08).map((p) => p.x);
  return central.length >= 4 ? median(central) : box.cx;
}

export function closest(lm: Pt[], x: number, y: number, maxDist: number): Pt | null {
  let best: Pt | null = null;
  let bestD = maxDist;
  for (const p of lm) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function weighted(parts: { score: number; w: number }[]): number {
  const usable = parts.filter((part) => part.w > 0 && Number.isFinite(part.score));
  const sum = usable.reduce((total, part) => total + part.w, 0);
  if (sum <= 0) return 70;
  return roundScore(usable.reduce((total, part) => total + part.score * part.w, 0) / sum);
}

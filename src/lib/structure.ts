import {
  alignFrontal,
  closest,
  dist,
  midlineX,
  scoreFromError,
  span,
  weighted,
  type Pt,
} from "./geometry";
import type { FaceShape } from "./types";

export type RegionName = "eyes" | "brows" | "mouth" | "jaw";

const PAIRS: { region: RegionName; a: number; b: number }[] = [
  { region: "eyes", a: 33, b: 263 },
  { region: "eyes", a: 133, b: 362 },
  { region: "eyes", a: 159, b: 386 },
  { region: "eyes", a: 145, b: 374 },
  { region: "brows", a: 70, b: 300 },
  { region: "brows", a: 63, b: 293 },
  { region: "brows", a: 105, b: 334 },
  { region: "brows", a: 66, b: 296 },
  { region: "brows", a: 107, b: 336 },
  { region: "mouth", a: 61, b: 291 },
  { region: "jaw", a: 234, b: 454 },
  { region: "jaw", a: 172, b: 397 },
  { region: "jaw", a: 136, b: 365 },
  { region: "jaw", a: 150, b: 379 },
  { region: "jaw", a: 132, b: 361 },
  { region: "jaw", a: 58, b: 288 },
  { region: "jaw", a: 127, b: 356 },
  { region: "jaw", a: 93, b: 323 },
  { region: "jaw", a: 162, b: 389 },
];

export type RegionScore = { error: number; score: number; pairs: number };

export type StructureReport = {
  score: number;
  symmetry: {
    error: number;
    score: number;
    validPairs: number;
    weakest: RegionName | null;
    regions: Record<RegionName, RegionScore>;
  };
  vertical: { ratio: number; score: number; valid: boolean };
  eyes: { ratio: number; score: number; valid: boolean };
  tilt: {
    score: number;
    left: number;
    right: number;
    valid: boolean;
  };
  nose: { ratio: number; score: number; valid: boolean };
  jaw: { ratio: number; valid: boolean; note: string };
  lips: { ratio: number; valid: boolean; note: string };
  shape: FaceShape;
  shapeText: string;
};

function emptyRegions(): Record<RegionName, { errors: number[] }> {
  return { eyes: { errors: [] }, brows: { errors: [] }, mouth: { errors: [] }, jaw: { errors: [] } };
}

function pairError(a: Pt, b: Pt, mid: number, faceW: number): number | null {
  const left = a.x <= b.x ? a : b;
  const right = a.x <= b.x ? b : a;
  const dLeft = mid - left.x;
  const dRight = right.x - mid;
  if (dLeft < faceW * 0.02 || dRight < faceW * 0.02) return null;
  if (left.x > mid || right.x < mid) return null;
  return Math.hypot(Math.abs(dLeft - dRight), Math.abs(left.y - right.y)) / faceW;
}

function tiltDeg(outer: Pt, inner: Pt): number {
  const run = Math.max(1e-6, Math.abs(inner.x - outer.x));
  const rise = inner.y - outer.y;
  return (Math.atan2(rise, run) * 180) / Math.PI;
}

function tiltError(deg: number): number {
  if (deg >= -2 && deg <= 9) return Math.min(2, Math.abs(deg - 4) * 0.15);
  return deg < -2 ? -2 - deg : deg - 9;
}

export function analyzeStructure(raw: Pt[]): StructureReport {
  const lm = alignFrontal(raw);
  const box = span(lm);
  const mid = midlineX(lm);
  const buckets = emptyRegions();

  for (const pair of PAIRS) {
    const a = lm[pair.a];
    const b = lm[pair.b];
    if (!a || !b) continue;
    const error = pairError(a, b, mid, box.width);
    if (error == null) continue;
    buckets[pair.region].errors.push(error);
  }

  const rightW = dist(lm[33], lm[133]);
  const leftW = dist(lm[263], lm[362]);
  const eyeSpan = (rightW + leftW) / 2;
  if (eyeSpan > 1e-4) {
    buckets.eyes.errors.push((Math.abs(rightW - leftW) / eyeSpan) * 0.35);
  }

  const regions = {} as StructureReport["symmetry"]["regions"];
  (Object.keys(buckets) as RegionName[]).forEach((name) => {
    const errors = buckets[name].errors;
    const error = errors.length ? errors.reduce((s, v) => s + v, 0) / errors.length : 0;
    regions[name] = {
      error,
      score: errors.length ? scoreFromError(error, 0.02, 0.09) : 75,
      pairs: errors.length,
    };
  });

  const used = (Object.keys(regions) as RegionName[]).filter((name) => regions[name].pairs > 0);
  const symmetryError = used.length
    ? used.reduce((s, name) => s + regions[name].error, 0) / used.length
    : 0.08;
  let weakest: RegionName | null = null;
  for (const name of used) {
    if (!weakest || regions[name].error > regions[weakest].error + 0.004) weakest = name;
  }
  if (weakest && regions[weakest].error < 0.012) weakest = null;

  const symmetry = {
    error: symmetryError,
    score: used.length >= 4 ? scoreFromError(symmetryError, 0.018, 0.15) : 72,
    validPairs: used.reduce((s, name) => s + regions[name].pairs, 0),
    weakest,
    regions,
  };

  const vertical = measureVertical(lm, box, mid);
  const inter = dist(lm[133], lm[362]);
  const eyesValid = eyeSpan > box.width * 0.04 && inter > box.width * 0.03;
  const eyeRatio = eyesValid ? inter / eyeSpan : 1;
  const eyes = {
    ratio: eyeRatio,
    score: eyesValid ? scoreFromError(Math.abs(eyeRatio - 1), 0.12, 0.5) : 74,
    valid: eyesValid,
  };

  const tilt33 = tiltDeg(lm[33], lm[133]);
  const tilt263 = tiltDeg(lm[263], lm[362]);
  const leftIs33 = lm[33].x <= lm[263].x;
  const tilt = {
    left: leftIs33 ? tilt33 : tilt263,
    right: leftIs33 ? tilt263 : tilt33,
    score: scoreFromError((tiltError(tilt33) + tiltError(tilt263)) / 2, 2, 14),
    valid: eyesValid,
  };

  const nose = measureNose(lm, inter, box);
  const jaw = measureJaw(lm, box);
  const lips = measureLips(lm);
  const turned = symmetry.error > 0.07;
  const shapeRatio = box.height / box.width;
  const shape: FaceShape = turned ? "balanced" : shapeRatio >= 1.48 ? "long" : shapeRatio <= 1.2 ? "wide" : "balanced";
  const shapeText = turned
    ? "Length versus width is unreliable in this frame because the head is not straight on."
    : shape === "long"
      ? "The face reads longer than it is wide."
      : shape === "wide"
        ? "The face reads wider through the cheeks than it is long."
        : "Length and width are in a middle band.";

  const parts = [
    { score: symmetry.score, w: 0.46 },
    { score: vertical.score, w: vertical.valid ? 0.22 : 0 },
    { score: eyes.score, w: eyes.valid ? 0.18 : 0 },
    { score: tilt.score, w: tilt.valid ? 0.08 : 0 },
    { score: nose.score, w: nose.valid ? 0.06 : 0 },
  ];

  return {
    score: weighted(parts),
    symmetry,
    vertical,
    eyes,
    tilt,
    nose,
    jaw,
    lips,
    shape,
    shapeText,
  };
}

function measureVertical(lm: Pt[], box: ReturnType<typeof span>, mid: number) {
  const forehead = lm.reduce((best, p) => (p.y < best.y ? p : best), lm[0]);
  const chin = lm.reduce((best, p) => (p.y > best.y ? p : best), lm[0]);
  const eyeY = (lm[33].y + lm[263].y) / 2;
  const glabellaTarget = eyeY + (forehead.y - eyeY) * 0.35;
  const glabella = closest(lm, mid, glabellaTarget, box.width * 0.14) ?? { x: mid, y: glabellaTarget };
  const tip = lm[1];
  const mouthY = (lm[61].y + lm[291].y) / 2;
  const baseTarget = tip.y + Math.min(box.height * 0.055, Math.max(box.height * 0.02, (mouthY - tip.y) * 0.35));
  const base = closest(lm, tip.x, baseTarget, box.width * 0.12);
  if (!base || mouthY <= tip.y) return { ratio: 1, score: 76, valid: false };
  const middle = base.y - glabella.y;
  const lower = chin.y - base.y;
  if (middle < box.height * 0.08 || lower < box.height * 0.08) {
    return { ratio: 1, score: 76, valid: false };
  }
  const ratio = lower / middle;
  if (ratio < 0.45 || ratio > 2.4) return { ratio, score: 76, valid: false };
  return { ratio, score: scoreFromError(Math.abs(ratio - 1), 0.1, 0.45), valid: true };
}

function measureNose(lm: Pt[], inter: number, box: ReturnType<typeof span>) {
  const tip = lm[1];
  const invalid = { ratio: 1, score: 76, valid: false };
  if (!(inter > box.width * 0.04)) return invalid;
  const reachX = Math.max(inter * 0.78, box.width * 0.07);
  const below = Math.max(inter * 0.85, box.height * 0.05);
  const above = below * 0.4;
  const xs: number[] = [];
  for (const p of lm) {
    const dx = Math.abs(p.x - tip.x);
    const dy = p.y - tip.y;
    if (dx < inter * 0.12 || dx > reachX) continue;
    if (dy < -above || dy > below) continue;
    xs.push(p.x);
  }
  if (xs.length < 4) return invalid;
  const ratio = (Math.max(...xs) - Math.min(...xs)) / inter;
  if (ratio < 0.55 || ratio > 1.45) return invalid;
  return { ratio, score: scoreFromError(Math.abs(ratio - 1), 0.28, 0.65), valid: true };
}

function measureJaw(lm: Pt[], box: ReturnType<typeof span>) {
  const mouthY = (lm[61].y + lm[291].y) / 2;
  const a = lm[172];
  const b = lm[397];
  const cheek = dist(lm[234], lm[454]);
  const invalid = { ratio: 1, valid: false, note: "Jaw width could not be measured cleanly in this frame." };
  if (!a || !b || cheek < box.width * 0.4) return invalid;
  if (a.y < mouthY - box.height * 0.02 || b.y < mouthY - box.height * 0.02) return invalid;
  const ratio = dist(a, b) / cheek;
  if (ratio < 0.45 || ratio > 1.15) return invalid;
  let note: string;
  if (ratio > 0.92) {
    note =
      "The jaw is nearly as wide as the cheeks. Height in the hair keeps that from reading as a block. Facial hair, if you wear it, usually looks better shorter at the sides.";
  } else if (ratio < 0.75) {
    note =
      "The jaw is narrower than the cheeks, a tapered lower face. It does not need a sharpening project. Extra width in the hair can look top-heavy on this shape.";
  } else {
    note = "Jaw width sits in a middle band relative to the cheeks. Light and facial hair will change how sharp it looks more than the bone will.";
  }
  return { ratio, valid: true, note };
}

function measureLips(lm: Pt[]) {
  const top = lm[0];
  const upper = lm[13];
  const lower = lm[14];
  const bottom = lm[17];
  const invalid = {
    ratio: 1,
    valid: false,
    note: "Lip balance was left out. The mouth landmarks were not in a reliable order.",
  };
  if (!top || !upper || !lower || !bottom) return invalid;
  const upperH = upper.y - top.y;
  const lowerH = bottom.y - lower.y;
  if (upperH < 0.002 || lowerH < 0.002) return invalid;
  const ratio = lowerH / upperH;
  if (ratio < 0.35 || ratio > 3.2) return invalid;
  const note =
    ratio > 1.15
      ? `The lower lip reads fuller than the upper (about ${ratio.toFixed(2)}×). That is a common, workable balance.`
      : ratio < 0.85
        ? `The upper lip reads as full as the lower (about ${ratio.toFixed(2)}×). Liner and balm change a photo more than a plumping product.`
        : `Upper and lower lip thickness are close (lower is ${ratio.toFixed(2)}× the upper).`;
  return { ratio, valid: true, note };
}

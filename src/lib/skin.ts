import { avg, scoreFromError, span, std, type Pt } from "./geometry";

export type Raster = { width: number; height: number; data: Uint8ClampedArray };

export type Prepared = {
  width: number;
  height: number;
  gray: Float32Array;
  red: Float32Array;
  rgba: Uint8ClampedArray;
};

export function prepare(raster: Raster): Prepared {
  const { width, height, data } = raster;
  const gray = new Float32Array(width * height);
  const red = new Float32Array(width * height);
  for (let p = 0, i = 0; p < gray.length; p += 1, i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    gray[p] = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    red[p] = (r - (g + b) / 2) / 255;
  }
  return { width, height, gray, red, rgba: data };
}

type Disk = {
  n: number;
  meanL: number;
  stdL: number;
  meanRed: number;
  stdRed: number;
  meanLap: number;
  highlight: number;
};

function disk(prep: Prepared, point: Pt, nr: number): Disk | null {
  const { width, height, gray, red, rgba } = prep;
  const cx = point.x * width;
  const cy = point.y * height;
  const radius = Math.max(4, nr * width);
  const x0 = Math.max(1, Math.floor(cx - radius));
  const x1 = Math.min(width - 2, Math.ceil(cx + radius));
  const y0 = Math.max(1, Math.floor(cy - radius));
  const y1 = Math.min(height - 2, Math.ceil(cy + radius));
  if (x1 <= x0 || y1 <= y0) return null;
  const ls: number[] = [];
  const rs: number[] = [];
  const laps: number[] = [];
  let highlights = 0;
  const r2 = radius * radius;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const p = y * width + x;
      const l = gray[p];
      ls.push(l);
      rs.push(red[p]);
      const lap = Math.abs(4 * gray[p] - gray[p - 1] - gray[p + 1] - gray[p - width] - gray[p + width]);
      laps.push(lap);
      const i = p * 4;
      const chroma = Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) - Math.min(rgba[i], rgba[i + 1], rgba[i + 2]);
      if (l > 232 && chroma < 28) highlights += 1;
    }
  }
  if (ls.length < 20) return null;
  return {
    n: ls.length,
    meanL: avg(ls),
    stdL: std(ls),
    meanRed: avg(rs),
    stdRed: std(rs),
    meanLap: avg(laps),
    highlight: highlights / ls.length,
  };
}

export type Regions = {
  forehead: Pt;
  cheekA: Pt;
  cheekB: Pt;
  underA: Pt;
  underB: Pt;
  crowA: Pt;
  crowB: Pt;
  chin: Pt;
  nose: Pt;
  foldA: Pt;
  foldB: Pt;
  radius: number;
};

export function regions(lm: Pt[]): Regions {
  const box = span(lm);
  const mid = (lm[33].x + lm[263].x) / 2;
  const eyeY = (lm[33].y + lm[263].y) / 2;
  const forehead = { x: mid, y: eyeY + (lm[10].y - eyeY) * 0.55 };
  const mouthY = (lm[61].y + lm[291].y) / 2;
  const cheekY = (lm[1].y + mouthY) / 2;
  const toward = (anchor: Pt) => ({
    x: anchor.x + (lm[1].x - anchor.x) * 0.38,
    y: cheekY,
  });
  const under = (lid: Pt) => ({
    x: lid.x + (mid - lid.x) * 0.08,
    y: lid.y + box.height * 0.04,
  });
  const crow = (outer: Pt) => {
    const edge = outer.x < mid ? box.minX : box.maxX;
    return { x: outer.x + (edge - outer.x) * 0.35, y: outer.y };
  };
  const fold = (corner: Pt) => ({
    x: lm[1].x + (corner.x - lm[1].x) * 0.62,
    y: lm[1].y + (corner.y - lm[1].y) * 0.72,
  });
  return {
    forehead,
    cheekA: toward(lm[234]),
    cheekB: toward(lm[454]),
    underA: under(lm[145]),
    underB: under(lm[374]),
    crowA: crow(lm[33]),
    crowB: crow(lm[263]),
    chin: { x: mid, y: box.maxY - box.height * 0.08 },
    nose: { x: lm[1].x, y: lm[1].y },
    foldA: fold(lm[61]),
    foldB: fold(lm[291]),
    radius: box.width * 0.085,
  };
}

export type SkinMetric = { score: number; detail: string; valid: boolean };

export type SkinReport = {
  score: number;
  ageScore: number;
  evenness: SkinMetric;
  texture: SkinMetric;
  redness: SkinMetric;
  shine: SkinMetric;
  underEye: SkinMetric;
  forehead: SkinMetric;
  crows: SkinMetric;
  folds: SkinMetric;
};

function metric(score: number, detail: string, valid = true): SkinMetric {
  return { score, detail, valid };
}

function usable(sample: Disk | null, refL: number): sample is Disk {
  if (!sample) return false;
  if (refL <= 1) return true;
  return Math.abs(sample.meanL - refL) / refL < 0.55;
}

export function analyzeSkin(raster: Raster, lm: Pt[]): SkinReport {
  const prep = prepare(raster);
  const map = regions(lm);
  const r = map.radius;
  const forehead = disk(prep, map.forehead, r);
  const cheekA = disk(prep, map.cheekA, r);
  const cheekB = disk(prep, map.cheekB, r);
  const chin = disk(prep, map.chin, r * 0.85);
  const nose = disk(prep, map.nose, r * 0.7);
  const refL = avg([cheekA?.meanL, cheekB?.meanL, forehead?.meanL].filter((v): v is number => v != null));
  const underA = usable(disk(prep, map.underA, r * 0.7), refL) ? disk(prep, map.underA, r * 0.7) : null;
  const underB = usable(disk(prep, map.underB, r * 0.7), refL) ? disk(prep, map.underB, r * 0.7) : null;
  const crowA = usable(disk(prep, map.crowA, r * 0.65), refL) ? disk(prep, map.crowA, r * 0.65) : null;
  const crowB = usable(disk(prep, map.crowB, r * 0.65), refL) ? disk(prep, map.crowB, r * 0.65) : null;
  const foldA = usable(disk(prep, map.foldA, r * 0.55), refL) ? disk(prep, map.foldA, r * 0.55) : null;
  const foldB = usable(disk(prep, map.foldB, r * 0.55), refL) ? disk(prep, map.foldB, r * 0.55) : null;

  const rawCheeks = [cheekA, cheekB].filter((zone): zone is Disk => zone != null);
  const anchorL = forehead?.meanL ?? (rawCheeks.length ? avg(rawCheeks.map((cheek) => cheek.meanL)) : 0);
  const cheeks = rawCheeks.filter((cheek) => anchorL <= 1 || Math.abs(cheek.meanL - anchorL) / anchorL < 0.34);
  const droppedCheek = rawCheeks.length - cheeks.length > 0;
  const zones = [forehead, ...(cheeks.length ? cheeks : rawCheeks), chin].filter((zone): zone is Disk => zone != null);
  const kept = (zone: Disk | null): zone is Disk =>
    zone != null && (anchorL <= 1 || Math.abs(zone.meanL - anchorL) / anchorL < 0.34);
  const sampleCheeks = cheeks.length ? cheeks : rawCheeks;
  const evenness = scoreEvenness(zones, droppedCheek);
  const edge = eyeEdge(prep, lm);
  const texture = scoreTexture(sampleCheeks, edge);
  const redness = scoreRedness(sampleCheeks, forehead);
  const shine = scoreShine(forehead, nose);
  const underPairs = [
    kept(cheekA) && kept(underA) ? { cheek: cheekA, under: underA } : null,
    kept(cheekB) && kept(underB) ? { cheek: cheekB, under: underB } : null,
  ].filter((pair): pair is { cheek: Disk; under: Disk } => pair != null);
  const underEye = scoreUnderEye(underPairs);
  const foreheadAge = scoreExcess(forehead, sampleCheeks, edge, "Forehead");
  const crows = scoreExcess(avgDisk([crowA, crowB].filter(kept)), sampleCheeks, edge, "Outer eyes");
  const folds = scoreFolds(sampleCheeks, [foldA, foldB].filter(kept));

  const skinScore = weighted([
    { score: evenness.score, w: evenness.valid ? 0.34 : 0 },
    { score: texture.score, w: texture.valid ? 0.28 : 0 },
    { score: redness.score, w: redness.valid ? 0.2 : 0 },
    { score: shine.score, w: shine.valid ? 0.08 : 0 },
    { score: underEye.score, w: underEye.valid ? 0.1 : 0 },
  ]);
  const ageParts = [
    { score: foreheadAge.score, w: foreheadAge.valid ? 0.3 : 0 },
    { score: crows.score, w: crows.valid ? 0.3 : 0 },
    { score: underEye.score, w: underEye.valid ? 0.25 : 0 },
    { score: folds.score, w: folds.valid ? 0.15 : 0 },
  ];
  const ageSamples = ageParts.filter((part) => part.w > 0).length;
  const ageScore = Math.min(weighted(ageParts), ageSamples >= 3 ? 100 : 88);

  return {
    score: skinScore,
    ageScore,
    evenness,
    texture,
    redness,
    shine,
    underEye,
    forehead: foreheadAge,
    crows,
    folds,
  };
}

function weighted(parts: { score: number; w: number }[]): number {
  const sum = parts.reduce((total, part) => total + part.w, 0);
  if (sum <= 0) return 74;
  const value = parts.reduce((total, part) => total + part.score * part.w, 0) / sum;
  return Math.max(1, Math.min(100, Math.round(value)));
}

function scoreEvenness(zones: Disk[], droppedCheek: boolean): SkinMetric {
  if (zones.length < 3) return metric(74, "Not enough clear skin was visible to grade evenness.", false);
  const within = avg(zones.map((zone) => zone.meanLap / Math.max(zone.meanL, 1)));
  const covered = droppedCheek ? " One side was too dark or covered to sample, so this uses the clearer side." : "";
  const detail =
    (within < 0.1
      ? "Tone on the sampled skin is even. A lighting gradient is not counted as blotchy skin."
      : `The sampled skin shows blotchiness beyond a smooth gradient (ratio ${within.toFixed(2)}).`) + covered;
  return metric(scoreFromError(within, 0.09, 0.22), detail);
}

function scoreTexture(cheeks: Disk[], edge: number): SkinMetric {
  if (cheeks.length === 0) return metric(76, "Cheek texture could not be sampled.", false);
  if (edge < 6) {
    return metric(80, "The photo is too soft to grade texture fairly, so this stays neutral.");
  }
  const ratio = avg(cheeks.map((cheek) => cheek.meanLap)) / edge;
  return metric(
    scoreFromError(Math.max(0, ratio - 0.04), 0.08, 0.32),
    `Cheek texture is ${ratio.toFixed(2)} of the eyelid edge. Lower is smoother. Sharpness of the photo changes this.`,
  );
}

function scoreRedness(cheeks: Disk[], forehead: Disk | null): SkinMetric {
  if (cheeks.length === 0) return metric(76, "Redness could not be sampled.", false);
  const patch = avg(cheeks.map((cheek) => cheek.stdRed));
  const reds = cheeks.map((cheek) => cheek.meanRed);
  const error = patch * 1.2;
  const warm =
    forehead && avg(reds) - forehead.meanRed > 0.06
      ? " The cheeks read warmer than the forehead, which side light often does."
      : "";
  return metric(
    scoreFromError(error, 0.04, 0.14),
    (patch > 0.07
      ? "Redness is patchy within the cheeks, not just an even tone."
      : "Redness is even. An even red is skin tone, and it is not scored as a problem.") + warm,
  );
}

function scoreShine(forehead: Disk | null, nose: Disk | null): SkinMetric {
  const zones = [forehead, nose].filter((zone): zone is Disk => zone != null);
  if (zones.length === 0) return metric(78, "Shine could not be sampled.", false);
  const frac = avg(zones.map((zone) => zone.highlight));
  const error = frac <= 0.1 ? 0 : frac - 0.1;
  const detail =
    frac > 0.1
      ? `About ${Math.round(frac * 100)}% of the T-zone is blown out. Blot before a photo; don't strip the skin.`
      : frac < 0.008
        ? "The T-zone is matte. That is fine unless the skin also feels tight."
        : "Shine on the T-zone is in a moderate band.";
  return metric(scoreFromError(error, 0.03, 0.2), detail);
}

function scoreUnderEye(pairs: { cheek: Disk; under: Disk }[]): SkinMetric {
  if (pairs.length === 0) {
    return metric(76, "Under-eye shadow could not be separated from the light on that side.", false);
  }
  const rel = avg(pairs.map((pair) => (pair.cheek.meanL - pair.under.meanL) / Math.max(pair.cheek.meanL, 1)));
  const error = Math.max(0, rel - 0.05);
  return metric(
    scoreFromError(error, 0.05, 0.22),
    rel > 0.08
      ? `Under-eyes are about ${Math.round(rel * 100)}% darker than the cheek on the same side. Sleep, pigment, a hollow, and a ceiling light all look like this.`
      : "Under-eyes are close to the cheek brightness on the same side.",
  );
}

function scoreExcess(zone: Disk | null, cheeks: Disk[], edge: number, label: string): SkinMetric {
  if (!zone || cheeks.length === 0) return metric(78, `${label} could not be sampled cleanly.`, false);
  if (edge < 6) return metric(80, `${label} texture stays neutral because the photo is soft.`);
  const excess = Math.max(0, zone.meanLap / edge - avg(cheeks.map((cheek) => cheek.meanLap)) / edge);
  const more = excess > 0.05;
  const sentence =
    label === "Outer eyes"
      ? more
        ? "The outer eyes show more texture than the cheeks in this photo."
        : "The outer eyes match the cheeks for texture."
      : more
        ? `The ${label.toLowerCase()} shows more texture than the cheeks in this photo.`
        : `The ${label.toLowerCase()} matches the cheeks for texture.`;
  return metric(scoreFromError(excess, 0.045, 0.22), sentence);
}

function scoreFolds(cheeks: Disk[], folds: Disk[]): SkinMetric {
  if (cheeks.length === 0 || folds.length === 0) {
    return metric(78, "The fold beside the nose could not be sampled.", false);
  }
  const cheekL = avg(cheeks.map((cheek) => cheek.meanL));
  const foldL = avg(folds.map((fold) => fold.meanL));
  const contrast = (cheekL - foldL) / Math.max(cheekL, 1);
  const error = Math.max(0, contrast - 0.03);
  return metric(
    scoreFromError(error, 0.045, 0.18),
    contrast > 0.06
      ? `The fold beside the nose is about ${Math.round(contrast * 100)}% darker than the cheek. Expression and side light do this too.`
      : "The fold beside the nose is shallow in this light.",
  );
}

function avgDisk(zones: Disk[]): Disk | null {
  if (zones.length === 0) return null;
  return {
    n: zones.reduce((sum, zone) => sum + zone.n, 0),
    meanL: avg(zones.map((zone) => zone.meanL)),
    stdL: avg(zones.map((zone) => zone.stdL)),
    meanRed: avg(zones.map((zone) => zone.meanRed)),
    stdRed: avg(zones.map((zone) => zone.stdRed)),
    meanLap: avg(zones.map((zone) => zone.meanLap)),
    highlight: avg(zones.map((zone) => zone.highlight)),
  };
}

function eyeEdge(prep: Prepared, lm: Pt[]): number {
  const box = span(lm);
  const shift = Math.max(2 / prep.height, box.height * 0.012);
  const samples: number[] = [];
  const lines: [Pt, Pt, number][] = [
    [lm[33], lm[133], -1],
    [lm[263], lm[362], -1],
    [lm[33], lm[133], 1],
    [lm[263], lm[362], 1],
  ];
  for (const [outer, inner, direction] of lines) {
    if (!outer || !inner) continue;
    for (let t = 0.25; t <= 0.75; t += 0.25) {
      const x = outer.x + (inner.x - outer.x) * t;
      const y = outer.y + (inner.y - outer.y) * t;
      const a = grayAt(prep, x, y);
      const b = grayAt(prep, x, y + direction * shift);
      if (a == null || b == null) continue;
      samples.push(Math.abs(a - b));
    }
  }
  return samples.length >= 6 ? avg(samples) : 0;
}

function grayAt(prep: Prepared, nx: number, ny: number): number | null {
  const x = Math.round(nx * prep.width);
  const y = Math.round(ny * prep.height);
  if (x < 0 || y < 0 || x >= prep.width || y >= prep.height) return null;
  return prep.gray[y * prep.width + x];
}

export function lightOf(raster: Raster, lm: Pt[]): { mean: number; sideDelta: number; sharpness: number } | null {
  const prep = prepare(raster);
  const map = regions(lm);
  const a = disk(prep, map.cheekA, map.radius);
  const b = disk(prep, map.cheekB, map.radius);
  const f = disk(prep, map.forehead, map.radius);
  if (!a || !b || !f) return null;
  const mean = (a.meanL + b.meanL + f.meanL) / 3;
  const sideDelta = Math.abs(a.meanL - b.meanL) / Math.max((a.meanL + b.meanL) / 2, 1);
  return { mean, sideDelta, sharpness: lapVar(prep, lm) };
}

function lapVar(prep: Prepared, lm: Pt[]): number {
  const box = span(lm);
  const x0 = Math.floor((box.minX + box.width * 0.18) * prep.width);
  const x1 = Math.floor((box.maxX - box.width * 0.18) * prep.width);
  const y0 = Math.floor((box.minY + box.height * 0.18) * prep.height);
  const y1 = Math.floor((box.maxY - box.height * 0.18) * prep.height);
  let sum = 0;
  let sum2 = 0;
  let n = 0;
  const { gray, width, height } = prep;
  for (let y = Math.max(1, y0); y < Math.min(height - 1, y1); y += 2) {
    for (let x = Math.max(1, x0); x < Math.min(width - 1, x1); x += 2) {
      const i = y * width + x;
      const v = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      sum += v;
      sum2 += v * v;
      n += 1;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sum2 / n - mean * mean;
}

import { describe, expect, it } from "vitest";
import { analyze } from "./analyze";
import type { Pt } from "./geometry";
import { suggestionsFor } from "./goals";
import { prepare, regions, type Raster } from "./skin";
import { analyzeStructure } from "./structure";
import type { GoalId } from "./types";

function syntheticFace(tweak?: (lm: Pt[]) => void): Pt[] {
  const lm: Pt[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const put = (index: number, x: number, y: number) => {
    lm[index] = { x, y, z: 0 };
  };
  put(10, 0.5, 0.2);
  put(9, 0.5, 0.34);
  put(1, 0.5, 0.5);
  put(2, 0.5, 0.535);
  put(0, 0.5, 0.58);
  put(13, 0.5, 0.6);
  put(14, 0.5, 0.615);
  put(17, 0.5, 0.645);
  put(152, 0.5, 0.73);
  const pairs: [number, number, number, number][] = [
    [33, 263, 0.18, 0.42],
    [133, 362, 0.06, 0.42],
    [159, 386, 0.12, 0.4],
    [145, 374, 0.12, 0.445],
    [70, 300, 0.15, 0.36],
    [63, 293, 0.12, 0.35],
    [105, 334, 0.09, 0.345],
    [66, 296, 0.07, 0.35],
    [107, 336, 0.045, 0.36],
    [61, 291, 0.08, 0.62],
    [234, 454, 0.26, 0.52],
    [172, 397, 0.16, 0.66],
    [136, 365, 0.12, 0.69],
    [150, 379, 0.08, 0.71],
    [132, 361, 0.2, 0.6],
    [58, 288, 0.18, 0.64],
    [127, 356, 0.22, 0.3],
    [93, 323, 0.22, 0.56],
    [162, 389, 0.2, 0.28],
  ];
  for (const [a, b, dx, y] of pairs) {
    put(a, 0.5 - dx, y);
    put(b, 0.5 + dx, y);
  }
  put(20, 0.44, 0.5);
  put(21, 0.56, 0.5);
  put(22, 0.47, 0.5);
  put(23, 0.53, 0.5);
  tweak?.(lm);
  return lm;
}

function fillDisk(data: Uint8ClampedArray, w: number, h: number, point: Pt, nr: number, rgb: [number, number, number]) {
  const cx = point.x * w;
  const cy = point.y * h;
  const radius = nr * w;
  const r2 = radius * radius;
  const x0 = Math.max(0, Math.floor(cx - radius));
  const x1 = Math.min(w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius));
  const y1 = Math.min(h - 1, Math.ceil(cy + radius));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * w + x) * 4;
      data[i] = rgb[0];
      data[i + 1] = rgb[1];
      data[i + 2] = rgb[2];
      data[i + 3] = 255;
    }
  }
}

function paint(lm: Pt[], mode: "even" | "marked" | "corner"): Raster {
  const width = 480;
  const height = 640;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = x / width;
      const ny = y / height;
      const ex = (nx - 0.5) / 0.34;
      const ey = (ny - 0.46) / 0.38;
      const inside = ex * ex + ey * ey <= 1;
      const i = (y * width + x) * 4;
      data[i] = inside ? 214 : 24;
      data[i + 1] = inside ? 176 : 22;
      data[i + 2] = inside ? 158 : 20;
      data[i + 3] = 255;
    }
  }
  if (mode === "marked") {
    const map = regions(lm);
    fillDisk(data, width, height, { x: map.cheekA.x + 0.02, y: map.cheekA.y }, 0.03, [210, 40, 46]);
    fillDisk(data, width, height, { x: map.cheekB.x - 0.015, y: map.cheekB.y + 0.01 }, 0.028, [200, 50, 48]);
    fillDisk(data, width, height, map.underA, 0.04, [78, 58, 52]);
    fillDisk(data, width, height, map.underB, 0.04, [78, 58, 52]);
  }
  if (mode === "corner") {
    fillDisk(data, width, height, { x: 0.03, y: 0.03 }, 0.06, [230, 20, 20]);
  }
  return { width, height, data };
}

function textOf(reading: ReturnType<typeof analyze>["reading"], extra = ""): string {
  return [
    ...reading.essay,
    ...reading.realistic,
    ...reading.shortTerm,
    ...reading.longTerm,
    ...reading.metrics.map((metric) => metric.detail),
    extra,
  ].join(" ");
}

describe("structure", () => {
  it("scores a balanced mesh high and notices a shifted brow", () => {
    const even = analyzeStructure(syntheticFace());
    const odd = analyzeStructure(
      syntheticFace((lm) => {
        lm[70] = { ...lm[70], y: lm[70].y - 0.05 };
        lm[63] = { ...lm[63], y: lm[63].y - 0.05 };
        lm[105] = { ...lm[105], y: lm[105].y - 0.05 };
      }),
    );
    expect(even.score).toBeGreaterThan(85);
    expect(even.vertical.ratio).toBeGreaterThan(0.95);
    expect(even.vertical.ratio).toBeLessThan(1.05);
    expect(even.eyes.ratio).toBeGreaterThan(0.95);
    expect(even.eyes.ratio).toBeLessThan(1.05);
    expect(odd.symmetry.regions.brows.score).toBeLessThan(even.symmetry.regions.brows.score - 8);
  });
});

describe("skin", () => {
  it("penalizes a cheek blotch and dark under-eyes, not a corner mark", () => {
    const lm = syntheticFace();
    const plain = analyze({ landmarks: lm, raster: paint(lm, "even"), blends: {} }).reading;
    const marked = analyze({ landmarks: lm, raster: paint(lm, "marked"), blends: {} }).reading;
    const corner = analyze({ landmarks: lm, raster: paint(lm, "corner"), blends: {} }).reading;
    const redness = (reading: typeof plain) => reading.metrics.find((metric) => metric.id === "redness")?.score ?? 0;
    const undereye = (reading: typeof plain) => reading.metrics.find((metric) => metric.id === "undereye")?.score ?? 0;
    expect(plain.structure).toBeGreaterThan(85);
    expect(plain.skin).toBeGreaterThan(80);
    expect(redness(marked)).toBeLessThan(redness(plain) - 8);
    expect(undereye(marked)).toBeLessThan(undereye(plain) - 8);
    expect(Math.abs(redness(corner) - redness(plain))).toBeLessThan(5);
    expect(plain.overall).toBeGreaterThanOrEqual(1);
    expect(plain.overall).toBeLessThanOrEqual(100);
    expect(Number.isInteger(plain.overall)).toBe(true);
    expect(prepare(paint(lm, "even")).gray.length).toBe(480 * 640);
  });
});

describe("writing", () => {
  it("writes a specific plan and refuses procedures", () => {
    const lm = syntheticFace();
    const reading = analyze({ landmarks: lm, raster: paint(lm, "marked"), blends: {} }).reading;
    const body = textOf(reading);
    expect(body.length).toBeGreaterThan(400);
    expect(body).toMatch(/\d/);
    expect(body).not.toMatch(/\b(ugly|hideous|deformed|unattractive)\b/i);
    expect(reading.shortTerm.join(" ")).not.toMatch(/\b(botox|filler|rhinoplasty)\b/i);
    expect(reading.shortTerm.join(" ").toLowerCase()).toContain("sunscreen");

    const sleep = suggestionsFor(reading, ["undereye"], "");
    expect(sleep[0]?.shortTerm.toLowerCase()).toContain("sleep");

    const surgery = suggestionsFor(reading, [], "I want surgery to fix my nose");
    expect(surgery).toHaveLength(1);
    expect(surgery[0]?.why.toLowerCase()).toContain("don't plan surgery");
    expect(surgery[0]?.shortTerm.toLowerCase()).not.toMatch(/book a|clinic|how to/);

    const bleach = suggestionsFor(reading, ["skin"], "bleach my skin lighter");
    expect(bleach[0]?.why.toLowerCase()).toContain("won't help");

    const ids: GoalId[] = ["skin", "jaw", "hair", "rested", "posture", "grooming", "symmetry"];
    const all = suggestionsFor(reading, ids, "").map((item) => `${item.why} ${item.realistic} ${item.shortTerm} ${item.longTerm}`).join(" ");
    expect(all).not.toMatch(/\b(ugly|hideous|deformed|unattractive)\b/i);
  });
});

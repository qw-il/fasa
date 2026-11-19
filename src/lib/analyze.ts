import { composeReading } from "./compose";
import type { Pt } from "./geometry";
import { assess, type Issue } from "./quality";
import { analyzeSkin, type Raster } from "./skin";
import { analyzeStructure } from "./structure";
import type { Reading } from "./types";

export type Analysis = {
  reading: Reading;
  landmarks: { x: number; y: number }[];
};

export function analyze(input: {
  landmarks: Pt[];
  raster: Raster;
  blends: Record<string, number>;
  issues?: Issue[];
  capturedAt?: string;
}): Analysis {
  const issues = input.issues ?? assess(input.landmarks, input.raster, input.blends, 1).issues;
  const structure = analyzeStructure(input.landmarks);
  const skin = analyzeSkin(input.raster, input.landmarks);
  const reading = composeReading({
    structure,
    skin,
    issues,
    blends: input.blends,
    capturedAt: input.capturedAt,
  });
  return {
    reading,
    landmarks: input.landmarks.map((point) => ({ x: point.x, y: point.y })),
  };
}

export function rasterFromCanvas(canvas: HTMLCanvasElement): Raster {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not read the photo.");
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width: image.width, height: image.height, data: image.data };
}

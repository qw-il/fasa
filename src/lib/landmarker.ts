import { FaceLandmarker, FilesetResolver, type FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import type { Pt } from "./geometry";

export type DetectedFace = {
  landmarks: Pt[];
  blends: Record<string, number>;
};

let pending: Promise<FaceLandmarker> | null = null;
let mode: "IMAGE" | "VIDEO" = "IMAGE";

function asset(path: string): string {
  const base = import.meta.env.BASE_URL;
  return `${base}${path.replace(/^\//, "")}`;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function create(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(asset("wasm"));
  const model = asset("models/face_landmarker.task");
  const shared = {
    runningMode: "IMAGE" as const,
    numFaces: 2,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  };
  try {
    return await withTimeout(
      FaceLandmarker.createFromOptions(fileset, {
        ...shared,
        baseOptions: { modelAssetPath: model, delegate: "GPU" },
      }),
      8000,
    );
  } catch {
    return FaceLandmarker.createFromOptions(fileset, {
      ...shared,
      baseOptions: { modelAssetPath: model, delegate: "CPU" },
    });
  }
}

export function loadLandmarker(): Promise<FaceLandmarker> {
  pending ??= create();
  return pending;
}

export function resetLandmarker(): void {
  pending = null;
  mode = "IMAGE";
}

async function ensure(next: "IMAGE" | "VIDEO", landmarker: FaceLandmarker): Promise<void> {
  if (mode === next) return;
  await landmarker.setOptions({ runningMode: next });
  mode = next;
}

export async function detectVideo(video: HTMLVideoElement, timestamp: number): Promise<DetectedFace[]> {
  const landmarker = await loadLandmarker();
  await ensure("VIDEO", landmarker);
  return unpack(landmarker.detectForVideo(video, timestamp));
}

export async function detectStill(source: HTMLCanvasElement): Promise<DetectedFace[]> {
  const landmarker = await loadLandmarker();
  await ensure("IMAGE", landmarker);
  return unpack(landmarker.detect(source));
}

function unpack(result: FaceLandmarkerResult): DetectedFace[] {
  return result.faceLandmarks.map((face, index) => ({
    landmarks: face.map((point) => ({ x: point.x, y: point.y, z: point.z })),
    blends: Object.fromEntries(
      (result.faceBlendshapes[index]?.categories ?? []).map((category) => [category.categoryName, category.score]),
    ),
  }));
}

export { FaceLandmarker };

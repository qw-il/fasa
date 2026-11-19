export type GoalId =
  | "skin"
  | "undereye"
  | "jaw"
  | "symmetry"
  | "grooming"
  | "hair"
  | "rested"
  | "posture";

export type Metric = {
  id: string;
  group: "structure" | "skin" | "age";
  label: string;
  score: number;
  detail: string;
};

export type FaceShape = "long" | "balanced" | "wide";

export type Reading = {
  overall: number;
  structure: number;
  skin: number;
  age: number;
  confidence: number;
  confidenceNotes: string[];
  expression: string;
  metrics: Metric[];
  strengths: Metric[];
  focus: Metric[];
  essay: string[];
  realistic: string[];
  shortTerm: string[];
  longTerm: string[];
  capturedAt: string;
  model: string;
  notes: {
    jaw: string;
    lips: string;
    shape: FaceShape;
    shapeText: string;
    weakestSymmetry: "eyes" | "brows" | "mouth" | "jaw" | null;
  };
};

export const DISCLAIMER =
  "This is a reading of one photograph. It is not a medical diagnosis, not a comparison with other people, and not a verdict on you.";

export const MODEL_NAME = "MediaPipe Face Landmarker (float16, 478 points)";

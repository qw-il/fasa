import { clamp, span, type Pt } from "./geometry";
import { lightOf, type Raster } from "./skin";

export type Issue = { id: string; level: "hard" | "soft"; message: string };

export type Quality = {
  issues: Issue[];
  hard: boolean;
  ready: boolean;
  roll: number;
  yaw: number;
};

export function assess(
  landmarks: Pt[] | null,
  raster: Raster | null,
  blends: Record<string, number>,
  faceCount: number,
): Quality {
  const issues: Issue[] = [];
  if (faceCount <= 0 || !landmarks) {
    issues.push({ id: "face", level: "hard", message: "No face in the frame yet." });
    return { issues, hard: true, ready: false, roll: 0, yaw: 0 };
  }
  if (faceCount > 1) {
    issues.push({ id: "face", level: "hard", message: "Only one face. Step in front of the camera alone." });
  }

  const box = span(landmarks);
  if (box.height < 0.34) issues.push({ id: "place", level: "hard", message: "Move closer." });
  else if (box.height > 0.86) issues.push({ id: "place", level: "hard", message: "Move back a little." });
  else if (box.height < 0.42) issues.push({ id: "place", level: "soft", message: "A little closer, so the features are easier to read." });

  const dx = Math.abs(box.cx - 0.5);
  const dy = Math.abs(box.cy - 0.46);
  if (dx > 0.2 || dy > 0.2) issues.push({ id: "place", level: "hard", message: "Put your face in the oval." });
  else if (dx > 0.12 || dy > 0.14) issues.push({ id: "place", level: "soft", message: "Nudge into the center of the oval." });

  const roll = (Math.atan2(landmarks[263].y - landmarks[33].y, landmarks[263].x - landmarks[33].x) * 180) / Math.PI;
  if (Math.abs(roll) > 12) issues.push({ id: "straight", level: "hard", message: "Level your head." });
  else if (Math.abs(roll) > 7) issues.push({ id: "straight", level: "soft", message: "Straighten your head a little." });

  const rightW = Math.hypot(landmarks[33].x - landmarks[133].x, landmarks[33].y - landmarks[133].y);
  const leftW = Math.hypot(landmarks[263].x - landmarks[362].x, landmarks[263].y - landmarks[362].y);
  const yaw = Math.abs(Math.log(rightW / Math.max(leftW, 1e-6)));
  if (yaw > 0.32) issues.push({ id: "straight", level: "hard", message: "Turn to face the camera." });
  else if (yaw > 0.16) issues.push({ id: "straight", level: "soft", message: "Face the camera a bit more squarely." });

  const blinkL = blends.eyeBlinkLeft ?? 0;
  const blinkR = blends.eyeBlinkRight ?? 0;
  if (blinkL > 0.55 && blinkR > 0.55) issues.push({ id: "straight", level: "hard", message: "Open your eyes." });
  else if (blinkL > 0.6 || blinkR > 0.6) issues.push({ id: "straight", level: "soft", message: "Both eyes open." });

  if ((blends.jawOpen ?? 0) > 0.45) {
    issues.push({ id: "straight", level: "soft", message: "Close your mouth for the baseline." });
  }

  if (raster) {
    const light = lightOf(raster, landmarks);
    if (light) {
      if (light.mean < 38) issues.push({ id: "light", level: "hard", message: "It's too dark. Face a window or a lamp." });
      else if (light.mean > 232) issues.push({ id: "light", level: "hard", message: "The light is blown out. Turn away from the glare." });
      else if (light.mean < 62 || light.mean > 214) {
        issues.push({ id: "light", level: "soft", message: "Find softer, brighter light." });
      }
      if (light.sideDelta > 0.42) issues.push({ id: "light", level: "hard", message: "Light both sides of your face." });
      else if (light.sideDelta > 0.22) issues.push({ id: "light", level: "soft", message: "The light is stronger on one side." });
      if (light.sharpness < 0.35) issues.push({ id: "light", level: "soft", message: "This frame is very soft. Hold still." });
    }
  }

  const hard = issues.some((issue) => issue.level === "hard");
  const ready = issues.length === 0;
  return { issues, hard, ready, roll, yaw };
}

export function confidenceFrom(issues: Issue[], blends: Record<string, number>): { value: number; notes: string[] } {
  let value = 1;
  const notes: string[] = [];
  for (const issue of issues) {
    value -= issue.level === "hard" ? 0.22 : 0.1;
    notes.push(issue.message.replace(/\.$/, "") + ".");
  }
  const smile = ((blends.mouthSmileLeft ?? 0) + (blends.mouthSmileRight ?? 0)) / 2;
  if (smile > 0.45) {
    value -= 0.08;
    notes.push("A smile changes the eyes, cheeks, and lips in the reading.");
  }
  return { value: clamp(value, 0.34, 1), notes };
}

export function expressionSentence(blends: Record<string, number>): string {
  const smile = ((blends.mouthSmileLeft ?? 0) + (blends.mouthSmileRight ?? 0)) / 2;
  const jaw = blends.jawOpen ?? 0;
  const brow = ((blends.browDownLeft ?? 0) + (blends.browDownRight ?? 0)) / 2;
  if (smile > 0.55) return "You were smiling. Treat the eye and cheek numbers as a cheerful photo, not a resting face.";
  if (smile > 0.28) return "There is a small smile. It lifts the cheeks a little, and that is expression, not bone.";
  if (jaw > 0.22) return "Your mouth was slightly open, so the lip note is less useful than the rest.";
  if (brow > 0.4) return "Your brows were drawn down. That moves the brow symmetry number, and it is expression.";
  return "The expression looks relaxed, which makes the structure numbers easier to trust.";
}

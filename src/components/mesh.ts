import { FaceLandmarker } from "../lib/landmarker";

const LINKS = [
  ...FaceLandmarker.FACE_LANDMARKS_FACE_OVAL,
  ...FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
  ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
  ...FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
  ...FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
  ...FaceLandmarker.FACE_LANDMARKS_LIPS,
];

export function drawMesh(
  ctx: CanvasRenderingContext2D,
  landmarks: { x: number; y: number }[],
  width: number,
  height: number,
  color: string,
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, width / 480);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  for (const link of LINKS) {
    const a = landmarks[link.start];
    const b = landmarks[link.end];
    if (!a || !b) continue;
    ctx.beginPath();
    ctx.moveTo(a.x * width, a.y * height);
    ctx.lineTo(b.x * width, b.y * height);
    ctx.stroke();
  }
  ctx.restore();
}

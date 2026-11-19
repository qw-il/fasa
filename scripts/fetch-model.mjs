import { createWriteStream, existsSync } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const dest = "public/models/face_landmarker.task";
const url =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

if (existsSync(dest)) {
  const info = await stat(dest);
  if (info.size > 1_000_000) {
    process.exit(0);
  }
}

await mkdir("public/models", { recursive: true });
const response = await fetch(url);
if (!response.ok || !response.body) {
  throw new Error(`Could not download the face model (${response.status})`);
}
await pipeline(Readable.fromWeb(response.body), createWriteStream(dest));

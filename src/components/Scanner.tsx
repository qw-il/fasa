import { useEffect, useRef, useState } from "react";
import { analyze, rasterFromCanvas } from "../lib/analyze";
import type { Pt } from "../lib/geometry";
import { detectStill, detectVideo, loadLandmarker, resetLandmarker, type DetectedFace } from "../lib/landmarker";
import { assess, type Issue, type Quality } from "../lib/quality";
import type { Raster } from "../lib/skin";
import { drawMesh } from "./mesh";

type Payload = {
  reading: ReturnType<typeof analyze>["reading"];
  landmarks: { x: number; y: number }[];
  image: Blob;
};

type Review = {
  canvas: HTMLCanvasElement;
  faces: DetectedFace[];
  quality: Quality;
  url: string;
};

const scratch: { canvas: HTMLCanvasElement | null; ctx: CanvasRenderingContext2D | null } = {
  canvas: null,
  ctx: null,
};

export function Scanner({ onComplete }: { onComplete: (payload: Payload) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const previous = useRef<Pt[] | null>(null);
  const hold = useRef(0);
  const capturing = useRef(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [camError, setCamError] = useState<string | null>(null);
  const [camAttempt, setCamAttempt] = useState(0);
  const [fileError, setFileError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"live" | "review" | "working">("live");
  const [live, setLive] = useState<{ quality: Quality | null; still: boolean }>({ quality: null, still: false });
  const [review, setReview] = useState<Review | null>(null);
  const [status, setStatus] = useState("Loading the face model…");

  useEffect(() => {
    let cancel = false;
    loadLandmarker()
      .then(() => {
        if (!cancel) {
          setModelReady(true);
          setModelError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancel) {
          setModelError(error instanceof Error ? error.message : "The face model failed to load.");
        }
      });
    return () => {
      cancel = true;
    };
  }, [retry]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancel = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamError("This browser has no camera. Upload a straight-on photo. A face is still required.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        if (cancel) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const ratio = video.videoWidth && video.videoHeight ? `${video.videoWidth} / ${video.videoHeight}` : "3 / 4";
        stageRef.current?.style.setProperty("--ratio", ratio);
        setCamError(null);
      } catch {
        if (!cancel) setCamError("Camera is off. Allow it, or upload a straight-on photo. A face is still required.");
      }
    }
    void start();
    return () => {
      cancel = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [camAttempt]);

  useEffect(() => {
    if (!modelReady || phase !== "live") return;
    let frame = 0;
    let stopped = false;
    let busy = false;
    let lastTs = 0;
    let signature = "";

    const loop = () => {
      if (stopped) return;
      frame = requestAnimationFrame(() => {
        void step();
      });
    };

    const step = async () => {
      if (stopped || busy || capturing.current) {
        loop();
        return;
      }
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth) {
        loop();
        return;
      }
      busy = true;
      try {
        const now = performance.now();
        const timestamp = now <= lastTs ? lastTs + 1 : now;
        lastTs = timestamp;
        const faces = await detectVideo(video, timestamp);
        if (stopped) return;
        const primary = faces[0] ?? null;
        const raster = sampleVideo(video);
        const quality = assess(primary?.landmarks ?? null, raster, primary?.blends ?? {}, faces.length);
        const moved = movement(previous.current, primary?.landmarks ?? null);
        previous.current = primary?.landmarks ?? null;
        const still = moved < 0.0035 && Boolean(primary);
        const canAuto = quality.ready && still;
        hold.current = canAuto ? hold.current + 1 : 0;
        paintOverlay(overlayRef.current, video, primary?.landmarks ?? null);
        const nextSignature = `${quality.issues.map((issue) => issue.message).join("|")}|${still}|${hold.current > 0}`;
        if (nextSignature !== signature) {
          signature = nextSignature;
          setLive({ quality, still });
          setStatus(statusLine(quality, still, hold.current));
        }
        if (hold.current >= 8 && primary) {
          hold.current = 0;
          await captureFrom(video);
        }
      } catch (error) {
        if (!stopped) setModelError(error instanceof Error ? error.message : "The scanner stalled.");
      } finally {
        busy = false;
        loop();
      }
    };

    loop();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
    };
  }, [modelReady, phase]);

  async function captureFrom(video: HTMLVideoElement) {
    if (capturing.current) return;
    capturing.current = true;
    try {
      const canvas = fitSource(video, video.videoWidth, video.videoHeight, 1600, true);
      await inspect(canvas);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Could not capture that frame.");
    } finally {
      capturing.current = false;
    }
  }

  async function inspect(canvas: HTMLCanvasElement) {
    setStatus("Checking the frame…");
    const faces = await detectStill(canvas);
    const raster = rasterFromCanvas(canvas);
    const quality = assess(faces[0]?.landmarks ?? null, raster, faces[0]?.blends ?? {}, faces.length);
    if (quality.ready && faces[0]) {
      await finish(canvas, faces[0], []);
      return;
    }
    setReview({ canvas, faces, quality, url: canvas.toDataURL("image/jpeg", 0.86) });
    setPhase("review");
    setStatus(quality.issues[0]?.message ?? "This photo needs a clearer face.");
  }

  async function finish(canvas: HTMLCanvasElement, face: DetectedFace, issues: Issue[]) {
    setPhase("working");
    setReview({
      canvas,
      faces: [face],
      quality: assess(face.landmarks, null, face.blends, 1),
      url: canvas.toDataURL("image/jpeg", 0.86),
    });
    setStatus("Reading 478 landmarks…");
    const started = performance.now();
    const raster = rasterFromCanvas(canvas);
    const analysis = analyze({ landmarks: face.landmarks, raster, blends: face.blends, issues });
    const image = await blobFrom(canvas);
    const wait = Math.max(0, 680 - (performance.now() - started));
    await new Promise((resolve) => setTimeout(resolve, wait));
    onComplete({ reading: analysis.reading, landmarks: analysis.landmarks, image });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = fitSource(bitmap, bitmap.width, bitmap.height, 1600, false);
      bitmap.close();
      await inspect(canvas);
    } catch {
      setFileError("This browser could not read that file. Try a JPG or PNG.");
    }
  }

  const quality = phase === "review" ? review?.quality ?? null : live.quality;
  const checks = checklist(quality, live.still, modelReady, phase === "live");
  const blocking = quality?.issues.find((issue) => issue.level === "hard") ?? quality?.issues[0];
  const canShoot = Boolean(quality && !quality.hard && quality.issues.length === 0);

  return (
    <main className="scan" data-testid="scan-gate">
      <header className="scan-top">
        <div>
          <p className="brand">Fasa</p>
          <h1>Face scan</h1>
        </div>
        <p className="scan-note">Required first. The photo stays on this device and is not uploaded.</p>
      </header>

      <div className="stage-wrap">
        <div className="stage" ref={stageRef}>
          <video
            ref={videoRef}
            className={phase === "live" ? "mirror" : "hidden"}
            playsInline
            muted
            autoPlay
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (video.videoWidth) stageRef.current?.style.setProperty("--ratio", `${video.videoWidth} / ${video.videoHeight}`);
            }}
          />
          <canvas ref={overlayRef} className={phase === "live" ? "overlay mirror" : "hidden"} />
          {phase !== "live" && review ? <img src={review.url} alt="The face about to be read" /> : null}
          <div className={canShoot && phase === "live" ? "oval ready" : "oval"} />
        </div>
      </div>

      <section className="dock">
        <p className="status" role="status" aria-live="polite">
          {modelError ?? camError ?? fileError ?? status}
        </p>
        <ul className="checks">
          {checks.map((check) => (
            <li key={check.label} className={check.ok ? "check ok" : "check"}>
              <i />
              {check.label}
            </li>
          ))}
        </ul>
        <div className="dock-actions">
          {phase === "live" ? (
            <button type="button" className="btn" disabled={!canShoot || !modelReady} onClick={() => {
              const video = videoRef.current;
              if (video) void captureFrom(video);
            }}>
              {canShoot ? "Capture now" : blocking?.message ?? "Finding your face"}
            </button>
          ) : null}
          {phase === "review" && review ? (
            <>
              {review.faces.length === 1 && review.faces[0] ? (
                <button
                  type="button"
                  className="btn"
                  onClick={() => void finish(review.canvas, review.faces[0], review.quality.issues)}
                >
                  Use this photo anyway
                </button>
              ) : null}
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  setReview(null);
                  setPhase("live");
                  setStatus("Look straight into the oval.");
                }}
              >
                Try again
              </button>
            </>
          ) : null}
          {phase === "working" ? <button type="button" className="btn" disabled>Reading the mesh…</button> : null}
          <label className="btn btn-quiet">
            Upload a photo
            <input
              data-testid="upload"
              type="file"
              accept="image/*"
              hidden
              disabled={!modelReady || phase === "working"}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void onFile(file);
              }}
            />
          </label>
          {camError ? (
            <button type="button" className="btn btn-quiet" onClick={() => setCamAttempt((value) => value + 1)}>
              Try the camera
            </button>
          ) : null}
          {modelError ? (
            <button
              type="button"
              className="btn btn-quiet"
              onClick={() => {
                resetLandmarker();
                setModelReady(false);
                setModelError(null);
                setRetry((value) => value + 1);
              }}
            >
              Reload the model
            </button>
          ) : null}
        </div>
        <p className="fine">MediaPipe Face Landmarker · 478 points · runs in the browser</p>
      </section>
    </main>
  );
}

function checklist(quality: Quality | null, still: boolean, modelReady: boolean, live: boolean) {
  const issues = quality?.issues ?? [];
  const faceBlocked = !quality || issues.some((issue) => issue.id === "face");
  return [
    { label: "Model", ok: modelReady },
    { label: "One face", ok: Boolean(quality) && !faceBlocked },
    { label: "In the oval", ok: !faceBlocked && !issues.some((issue) => issue.id === "place") },
    { label: "Straight", ok: !faceBlocked && !issues.some((issue) => issue.id === "straight") },
    { label: "Light", ok: !faceBlocked && !issues.some((issue) => issue.id === "light") },
    { label: "Still", ok: live && still && !faceBlocked },
  ];
}

function statusLine(quality: Quality, still: boolean, held: number): string {
  if (quality.issues[0]) return quality.issues[0].message;
  if (!still) return "Hold still.";
  if (held > 0) return "Stay still — reading the frame.";
  return "Ready.";
}

function movement(previous: Pt[] | null, next: Pt[] | null): number {
  if (!previous || !next) return 1;
  let sum = 0;
  let n = 0;
  const limit = Math.min(previous.length, next.length);
  for (let i = 0; i < limit; i += 5) {
    sum += Math.hypot(previous[i].x - next[i].x, previous[i].y - next[i].y);
    n += 1;
  }
  return n ? sum / n : 1;
}

function sampleVideo(video: HTMLVideoElement): Raster {
  const width = 480;
  const height = Math.max(2, Math.round((video.videoHeight / video.videoWidth) * width));
  if (!scratch.canvas) {
    scratch.canvas = document.createElement("canvas");
    scratch.ctx = scratch.canvas.getContext("2d", { willReadFrequently: true });
  }
  const canvas = scratch.canvas;
  const ctx = scratch.ctx;
  if (!ctx) throw new Error("Canvas is not available.");
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(video, 0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  return { width, height, data: image.data };
}

function fitSource(source: CanvasImageSource, width: number, height: number, max: number, mirror: boolean): HTMLCanvasElement {
  const scale = Math.min(1, max / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.round(width * scale));
  canvas.height = Math.max(2, Math.round(height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is not available.");
  if (mirror) {
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function paintOverlay(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, landmarks: Pt[] | null) {
  if (!canvas) return;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (landmarks) drawMesh(ctx, landmarks, canvas.width, canvas.height, "rgba(246, 241, 234, 0.88)");
}

function blobFrom(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not save the photo."))), "image/jpeg", 0.92);
  });
}

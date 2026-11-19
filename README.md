# Fasa

A private face reading. On a first visit you scan a face — camera or a photo — and the page scores age signals, skin, and structure from 1 to 100, then writes what is working and a realistic, short-term, and long-term plan. You can also say what you want to improve.

The mesh is [MediaPipe Face Landmarker](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task) (float16, 478 points). It runs in the browser. The photo is not uploaded.

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
```

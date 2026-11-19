import type { GoalId, Reading } from "./types";

export type Saved = {
  version: 1;
  reading: Reading;
  landmarks: { x: number; y: number }[];
  goals: GoalId[];
  customGoal: string;
  image: Blob;
};

const memory: { current: Saved | null } = { current: null };

function valid(value: unknown): value is Saved {
  if (!value || typeof value !== "object") return false;
  const saved = value as Saved;
  return (
    saved.version === 1 &&
    saved.image instanceof Blob &&
    typeof saved.reading?.overall === "number" &&
    Array.isArray(saved.landmarks) &&
    Array.isArray(saved.goals)
  );
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("fasa", 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("reading")) db.createObjectStore("reading");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadSaved(): Promise<Saved | null> {
  try {
    const db = await openDb();
    const saved = await new Promise<unknown>((resolve, reject) => {
      const tx = db.transaction("reading", "readonly");
      const request = tx.objectStore("reading").get("current");
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (valid(saved)) {
      memory.current = saved;
      return saved;
    }
    return null;
  } catch {
    return memory.current;
  }
}

export async function saveSaved(saved: Saved): Promise<boolean> {
  memory.current = saved;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("reading", "readwrite");
      tx.objectStore("reading").put(saved, "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function clearSaved(): Promise<void> {
  memory.current = null;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("reading", "readwrite");
      tx.objectStore("reading").delete("current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    memory.current = null;
  }
}

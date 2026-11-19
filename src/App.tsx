import { useEffect, useState } from "react";
import { Results } from "./components/Results";
import { Scanner } from "./components/Scanner";
import { clearSaved, loadSaved, saveSaved, type Saved } from "./lib/storage";

export function App() {
  const [phase, setPhase] = useState<"boot" | "scan" | "results">("boot");
  const [saved, setSaved] = useState<Saved | null>(null);
  const [stored, setStored] = useState(true);

  useEffect(() => {
    let cancel = false;
    loadSaved().then((found) => {
      if (cancel) return;
      if (found) {
        setSaved(found);
        setStored(true);
        setPhase("results");
      } else {
        setPhase("scan");
      }
    });
    return () => {
      cancel = true;
    };
  }, []);

  if (phase === "boot") {
    return (
      <main className="boot">
        <p className="brand">Fasa</p>
        <p>Checking for a saved scan…</p>
      </main>
    );
  }

  if (phase === "scan" || !saved) {
    return (
      <Scanner
        onComplete={(payload) => {
          const next: Saved = {
            version: 1,
            reading: payload.reading,
            landmarks: payload.landmarks,
            goals: [],
            customGoal: "",
            image: payload.image,
          };
          setSaved(next);
          setPhase("results");
          void saveSaved(next).then(setStored);
        }}
      />
    );
  }

  return (
    <Results
      saved={saved}
      stored={stored}
      onChange={(next) => {
        setSaved(next);
        void saveSaved(next).then(setStored);
      }}
      onRescan={() => {
        void clearSaved();
        setSaved(null);
        setStored(true);
        setPhase("scan");
      }}
    />
  );
}

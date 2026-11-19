import { useEffect, useRef, useState } from "react";
import { GOALS, suggestionsFor } from "../lib/goals";
import type { Saved } from "../lib/storage";
import { DISCLAIMER, type GoalId, type Metric } from "../lib/types";
import { drawMesh } from "./mesh";

export function Results({
  saved,
  stored,
  onChange,
  onRescan,
}: {
  saved: Saved;
  stored: boolean;
  onChange: (next: Saved) => void;
  onRescan: () => void;
}) {
  const { reading } = saved;
  const photoRef = useRef<HTMLImageElement>(null);
  const meshRef = useRef<HTMLCanvasElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [draft, setDraft] = useState(saved.customGoal);
  const suggestions = suggestionsFor(reading, saved.goals, saved.customGoal);
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(reading.capturedAt),
  );

  useEffect(() => {
    const next = URL.createObjectURL(saved.image);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [saved.image]);

  useEffect(() => {
    const image = photoRef.current;
    const canvas = meshRef.current;
    if (!image || !canvas) return;
    const draw = () => {
      const width = image.clientWidth;
      const height = image.clientHeight;
      if (!width || !height) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawMesh(ctx, saved.landmarks, canvas.width, canvas.height, "rgba(141, 61, 36, 0.85)");
    };
    if (image.complete) draw();
    image.addEventListener("load", draw);
    window.addEventListener("resize", draw);
    return () => {
      image.removeEventListener("load", draw);
      window.removeEventListener("resize", draw);
    };
  }, [saved.landmarks, url]);

  function toggle(id: GoalId) {
    const goals = saved.goals.includes(id) ? saved.goals.filter((goal) => goal !== id) : [...saved.goals, id];
    onChange({ ...saved, goals });
  }

  function commitNote(value: string) {
    const customGoal = value.replace(/\s+/g, " ").trim().slice(0, 280);
    setDraft(customGoal);
    if (customGoal !== saved.customGoal) onChange({ ...saved, customGoal });
  }

  return (
    <main className="results">
      <header className="top">
        <div>
          <p className="brand">Fasa</p>
          <p className="quiet">Scanned on this device · {when}</p>
        </div>
        <div className="top-actions">
          {confirm ? (
            <>
              <span>Replace this reading?</span>
              <button type="button" className="text-btn" onClick={onRescan}>
                Replace
              </button>
              <button type="button" className="text-btn" onClick={() => setConfirm(false)}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className="text-btn" onClick={() => setConfirm(true)}>
              New scan
            </button>
          )}
        </div>
      </header>

      <div className="layout">
        <figure className="frame">
          <div className="photo">
            {url ? <img ref={photoRef} src={url} alt="Your scanned face with the landmark mesh over it" /> : null}
            <canvas ref={meshRef} />
          </div>
          <figcaption>The mesh is the model’s 478 points, drawn on the photo. It never left the browser.</figcaption>
        </figure>

        <div>
          <p className="kicker">The reading</p>
          <div className="scoreline">
            <p className="overall" data-testid="overall-score" aria-label={`Overall ${reading.overall} out of 100`}>
              {reading.overall}
            </p>
            <div>
              <h1>Overall</h1>
              <p className="quiet">
                Average of age, skin, and structure. Most honest photos land in the 60s to 80s. These numbers are not a
                comparison with other people.
              </p>
              <a className="jump" href="#improve">
                What do you want to improve?
              </a>
            </div>
          </div>

          <div className="trio">
            <Score label="Age" hint="smoother reads higher" value={reading.age} />
            <Score label="Skin" hint="evenness and calm" value={reading.skin} />
            <Score label="Structure" hint="symmetry and proportion" value={reading.structure} />
          </div>

          {reading.confidence < 0.78 ? (
            <p className="banner">
              Confidence {Math.round(reading.confidence * 100)}%. {reading.confidenceNotes.join(" ")}
            </p>
          ) : null}
          <p className="disclaimer">{DISCLAIMER}</p>
          {!stored ? <p className="quiet">Could not store this on the device. It will stay until you refresh.</p> : null}
        </div>
      </div>

      <section className="essay">
        <h2>Detailed analysis</h2>
        {reading.essay.map((paragraph) => (
          <p key={paragraph.slice(0, 48)}>{paragraph}</p>
        ))}
      </section>

      <section className="split">
        <div>
          <h2>What’s working</h2>
          <ol className="points">
            {reading.strengths.map((metric, index) => (
              <li key={metric.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>
                    {metric.label} · {metric.score}
                  </strong>
                  <p>{metric.detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h2>Worth a plan</h2>
          {reading.focus.length === 0 ? (
            <p>Nothing in the measurements is asking for a project. Keep the simple habits and retake the photo before you buy anything.</p>
          ) : (
            <ol className="points">
              {reading.focus.map((metric, index) => (
                <li key={metric.id}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>
                      {metric.label} · {metric.score}
                    </strong>
                    <p>{metric.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      <section className="plans">
        <h2>The plan</h2>
        <Plan title="Realistic" when="What can actually change" items={reading.realistic} />
        <Plan title="Short term" when="The next few weeks" items={reading.shortTerm} />
        <Plan title="Long term" when="The next year" items={reading.longTerm} />
      </section>

      <section className="ask" id="improve">
        <div className="ask-inner">
          <p className="kicker">Your goal</p>
          <h2>What do you want to improve?</h2>
          <p className="lede">
            The plan above comes from the scan. This follows what you care about. Pick any of these, or write your own.
          </p>
          <div className="chips">
            {GOALS.map((goal) => {
              const on = saved.goals.includes(goal.id);
              return (
                <button key={goal.id} type="button" className="chip" aria-pressed={on} onClick={() => toggle(goal.id)}>
                  {goal.label}
                </button>
              );
            })}
          </div>
          <form
            className="note"
            onSubmit={(event) => {
              event.preventDefault();
              commitNote(draft);
            }}
          >
            <label htmlFor="goal-note">Or say it yourself</label>
            <textarea
              id="goal-note"
              maxLength={280}
              rows={3}
              value={draft}
              placeholder="Example: calmer redness, or a haircut that suits a longer face"
              onChange={(event) => setDraft(event.target.value)}
              onBlur={() => commitNote(draft)}
            />
            <button type="submit" className="btn btn-ink">
              Add this to the plan
            </button>
          </form>

          <div data-testid="suggestions">
            {suggestions.length === 0 ? (
              <p className="quiet">Nothing selected yet. The scan plan above still stands.</p>
            ) : (
              suggestions.map((suggestion) => (
                <article key={suggestion.title} className="suggestion">
                  <h3>{suggestion.title}</h3>
                  <p>{suggestion.why}</p>
                  <dl>
                    <div>
                      <dt>Realistic</dt>
                      <dd>{suggestion.realistic}</dd>
                    </div>
                    <div>
                      <dt>Short term</dt>
                      <dd>{suggestion.shortTerm}</dd>
                    </div>
                    <div>
                      <dt>Long term</dt>
                      <dd>{suggestion.longTerm}</dd>
                    </div>
                  </dl>
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="measures">
        <h2>Measurements</h2>
        <table className="metrics">
          <tbody>
            {(["structure", "skin", "age"] as const).map((group) => (
              <Group key={group} name={group} metrics={reading.metrics.filter((metric) => metric.group === group)} />
            ))}
          </tbody>
        </table>
      </section>

      <footer className="colophon">
        <p>
          Model: {reading.model}. It places a mesh on the face. Skin and age scores come from the pixels inside those
          regions — evenness, texture, redness, and shadow — compared within your own face, so a skin tone is not graded.
          The write-up is composed from those measurements. Nothing is sent to a server.
        </p>
      </footer>
    </main>
  );
}

function Score({ label, hint, value }: { label: string; hint: string; value: number }) {
  return (
    <div className="score">
      <p>{value}</p>
      <strong>{label}</strong>
      <span>{hint}</span>
      <i style={{ width: `${value}%` }} />
    </div>
  );
}

function Plan({ title, when, items }: { title: string; when: string; items: string[] }) {
  return (
    <div className="plan">
      <div>
        <h3>{title}</h3>
        <p>{when}</p>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function Group({ name, metrics }: { name: string; metrics: Metric[] }) {
  if (metrics.length === 0) return null;
  const title = name === "structure" ? "Structure" : name === "skin" ? "Skin" : "Age";
  return (
    <>
      <tr>
        <th colSpan={3}>{title}</th>
      </tr>
      {metrics.map((metric) => (
        <tr key={metric.id}>
          <td>{metric.label}</td>
          <td className="num">{metric.score}</td>
          <td>{metric.detail}</td>
        </tr>
      ))}
    </>
  );
}

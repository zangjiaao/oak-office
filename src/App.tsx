import { useCallback, useEffect, useRef, useState } from "react";
import { OfficeStage } from "./office/OfficeStage";
import { DURATION } from "./office/script";
import { activePoses, actorsAt, linesAt } from "./office/scene";
import { rosterActors, type DraftPreview } from "./office/seats";
import { POSE_NAME, type Pose } from "./office/types";
import { listPeople } from "./people/api";
import { RosterPanel } from "./people/RosterPanel";
import type { PersonRow } from "./people/record";

const POSES: Pose[] = [
  "idle",
  "arrive",
  "think",
  "read",
  "type",
  "run",
  "wait",
  "handoff",
  "report",
  "done",
  "error",
];

type Mode = "roster" | "rehearsal";

function format(ms: number) {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function App() {
  const [mode, setMode] = useState<Mode>("roster");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickRequest, setPickRequest] = useState<{ id: string; n: number } | null>(null);
  const [draft, setDraft] = useState<DraftPreview | null>(null);
  const pickN = useRef(0);
  const playingRef = useRef(true);
  const timeRef = useRef(0);
  const modeRef = useRef<Mode>("roster");
  const logRef = useRef<HTMLDivElement>(null);
  const onDraft = useCallback((next: DraftPreview | null) => setDraft(next), []);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    let last = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (modeRef.current === "rehearsal" && playingRef.current && timeRef.current < DURATION) {
        timeRef.current = Math.min(DURATION, timeRef.current + dt);
        setTime(timeRef.current);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const load = useCallback(async () => {
    try {
      setPeople(await listPeople());
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "档案库没连上。");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const lines = mode === "rehearsal" ? linesAt(time) : [];
  const rehearsalActors = mode === "rehearsal" ? actorsAt(time) : [];
  const actors = mode === "rehearsal" ? rehearsalActors : rosterActors(people ?? [], draft, selectedId);
  const poses = activePoses(time);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines.length]);

  function restart() {
    timeRef.current = 0;
    setTime(0);
    setPlaying(true);
  }

  function pick(id: string) {
    pickN.current += 1;
    setSelectedId(id);
    setPickRequest({ id, n: pickN.current });
  }

  return (
    <main className="app">
      <section className="floor">
        <header className="floor-bar">
          <div>
            <strong>Oak Office</strong>
            <span>{mode === "roster" ? "交付组 · 编制" : "交付组 · 排练"}</span>
          </div>
          <div className="modes">
            <button
              type="button"
              className={mode === "roster" ? "on" : ""}
              onClick={() => setMode("roster")}
            >
              编制
            </button>
            <button
              type="button"
              className={mode === "rehearsal" ? "on" : ""}
              onClick={() => setMode("rehearsal")}
            >
              排练
            </button>
          </div>
          {mode === "rehearsal" ? (
            <div className="transport">
              <span>{format(time)}</span>
              <button type="button" onClick={() => setPlaying((value) => !value)}>
                {playing && time < DURATION ? "暂停" : "播放"}
              </button>
              <button type="button" onClick={restart}>
                重来
              </button>
            </div>
          ) : null}
        </header>
        <OfficeStage
          actors={actors}
          clock={mode === "rehearsal" ? time : null}
          onPick={mode === "roster" ? pick : undefined}
        />
        {mode === "rehearsal" ? (
          <footer className="poses">
            {POSES.map((pose) => (
              <span key={pose} className={poses.has(pose) ? "on" : ""}>
                {POSE_NAME[pose]}
              </span>
            ))}
          </footer>
        ) : null}
      </section>
      {mode === "roster" ? (
        <RosterPanel
          people={people}
          loadError={loadError}
          selectedId={selectedId}
          pickRequest={pickRequest}
          onSelect={setSelectedId}
          onPeople={setPeople}
          onRetry={() => void load()}
          onDraft={onDraft}
        />
      ) : (
        <aside className="chat">
          <header>
            <strong>周衡</strong>
            <span>交付组主管</span>
          </header>
          <div className="log" ref={logRef}>
            {lines.length === 0 ? <p className="empty">他还没开口。</p> : null}
            {lines.map((line) => (
              <article key={line.at} className={line.who}>
                <span>{line.who === "lead" ? "周衡" : "你"}</span>
                <p>{line.text}</p>
              </article>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <input disabled value="" placeholder="剧本播放中，还不能插话" readOnly />
          </form>
          <ul className="roster">
            {rehearsalActors.map((actor) => (
              <li key={actor.id}>
                <b>{actor.name}</b>
                <em>{actor.label}</em>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </main>
  );
}

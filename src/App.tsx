import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { rehearsalDesks } from "./office/draw";
import { OfficeStage } from "./office/OfficeStage";
import { ROOM } from "./office/roster";
import { DURATION } from "./office/script";
import { activePoses, actorsAt, linesAt } from "./office/scene";
import { rosterView, type DraftPreview } from "./office/seats";
import { shift, useNow } from "./office/shift";
import { useWalk } from "./office/walk";
import { POSE_NAME, type Pose } from "./office/types";
import { listPeople } from "./people/api";
import { RosterPanel } from "./people/RosterPanel";
import type { PersonRow } from "./people/record";
import { WorkPanel } from "./work/WorkPanel";
import type { DutyHold, FloorMark } from "./work/api";

const CHAT_WIDTH_KEY = "oak-office-chat-width";
const CHAT_MIN = 280;
const CHAT_MAX = 720;

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

type Mode = "work" | "roster" | "rehearsal";

function readChatWidth() {
  const raw = localStorage.getItem(CHAT_WIDTH_KEY);
  const saved = raw === null ? Number.NaN : Number(raw);
  if (!Number.isFinite(saved)) return 340;
  return clampChat(saved, window.innerWidth);
}

function clampChat(width: number, viewport: number) {
  const max = Math.max(CHAT_MIN, Math.min(CHAT_MAX, viewport - 360));
  return Math.min(max, Math.max(CHAT_MIN, Math.round(width)));
}

function format(ms: number) {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function App() {
  const [mode, setMode] = useState<Mode>("work");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [people, setPeople] = useState<PersonRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickRequest, setPickRequest] = useState<{ id: string; n: number } | null>(null);
  const [draft, setDraft] = useState<DraftPreview | null>(null);
  const [floor, setFloor] = useState<Record<string, FloorMark>>({});
  const [holding, setHolding] = useState<DutyHold[]>([]);
  const pickN = useRef(0);
  const playingRef = useRef(true);
  const timeRef = useRef(0);
  const modeRef = useRef<Mode>("work");
  const logRef = useRef<HTMLDivElement>(null);
  const [chatWidth, setChatWidth] = useState(readChatWidth);
  const chatWidthRef = useRef(chatWidth);
  const onDraft = useCallback((next: DraftPreview | null) => setDraft(next), []);
  const onFloor = useCallback((marks: FloorMark[]) => {
    setFloor(Object.fromEntries(marks.map((mark) => [mark.person_id, mark])));
  }, []);
  const onHolding = useCallback((duties: DutyHold[]) => setHolding(duties), []);

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
  const now = useNow(mode !== "rehearsal");
  const shownFloor = Object.fromEntries(
    Object.entries(floor).map(([id, mark]) => {
      const view = shift(mark, now, holding.find((duty) => duty.person_id === id)?.label ?? "");
      return [id, { ...mark, pose: view.pose, label: view.label }];
    }),
  );
  const roster = rosterView(
    people ?? [],
    mode === "roster" ? draft : null,
    mode === "roster" ? selectedId : null,
    shownFloor,
    mode === "work",
  );
  const stood = useWalk(roster.actors, mode === "work");
  const actors = mode === "rehearsal" ? rehearsalActors : stood;
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

  function resizeChat(next: number) {
    const width = clampChat(next, window.innerWidth);
    chatWidthRef.current = width;
    setChatWidth(width);
    localStorage.setItem(CHAT_WIDTH_KEY, String(width));
  }

  function dragChat(event: ReactPointerEvent<HTMLDivElement>) {
    if (window.innerWidth <= 800) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startW = chatWidthRef.current;
    function move(next: PointerEvent) {
      resizeChat(startW - (next.clientX - startX));
    }
    function up() {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
    }
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  }

  return (
    <main className="app" style={{ "--chat-width": `${chatWidth}px` } as CSSProperties}>
      <section className="floor">
        <header className="floor-bar">
          <div>
            <strong>Oak Office</strong>
            <span>
              {mode === "roster" ? "交付组 · 编制" : mode === "rehearsal" ? "交付组 · 排练" : "交付组 · 办公"}
            </span>
          </div>
          <div className="modes">
            <button type="button" className={mode === "work" ? "on" : ""} onClick={() => setMode("work")}>
              办公
            </button>
            <button type="button" className={mode === "roster" ? "on" : ""} onClick={() => setMode("roster")}>
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
          room={mode === "rehearsal" ? ROOM : roster.room}
          desks={mode === "rehearsal" ? rehearsalDesks() : roster.desks}
          onPick={mode === "roster" ? pick : undefined}
        />
        {mode === "rehearsal" || mode === "work" ? (
          <footer className="poses">
            {POSES.map((pose) => (
              <span key={pose} className={(mode === "rehearsal" ? poses : new Set(actors.map((actor) => actor.pose))).has(pose) ? "on" : ""}>
                {POSE_NAME[pose]}
              </span>
            ))}
          </footer>
        ) : null}
      </section>
      <div
        className="split"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整对话框宽度"
        aria-valuemin={CHAT_MIN}
        aria-valuemax={CHAT_MAX}
        aria-valuenow={chatWidth}
        tabIndex={0}
        onPointerDown={dragChat}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          resizeChat(chatWidthRef.current + (event.key === "ArrowLeft" ? 24 : -24));
        }}
      />
      <div className={mode === "work" ? "pane-on" : "pane-off"}>
        <WorkPanel
          people={people}
          loadError={loadError}
          onFloor={onFloor}
          onHolding={onHolding}
          onRetry={() => void load()}
        />
      </div>
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
      ) : mode === "rehearsal" ? (
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
      ) : null}
    </main>
  );
}

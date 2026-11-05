import { useEffect, useRef, useState } from "react";
import { OfficeStage } from "./office/OfficeStage";
import { DURATION } from "./office/script";
import { activePoses, actorsAt, linesAt } from "./office/scene";
import { POSE_NAME, type Pose } from "./office/types";

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

function format(ms: number) {
  const sec = Math.floor(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

export function App() {
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(true);
  const playingRef = useRef(true);
  const timeRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    let last = performance.now();
    let frame = 0;
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (playingRef.current && timeRef.current < DURATION) {
        timeRef.current = Math.min(DURATION, timeRef.current + dt);
        setTime(timeRef.current);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  const lines = linesAt(time);
  const actors = actorsAt(time);
  const poses = activePoses(time);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines.length]);

  function restart() {
    timeRef.current = 0;
    setTime(0);
    setPlaying(true);
  }

  return (
    <main className="app">
      <section className="floor">
        <header className="floor-bar">
          <div>
            <strong>Oak Office</strong>
            <span>交付组 · 剧本</span>
          </div>
          <div className="transport">
            <span>{format(time)}</span>
            <button type="button" onClick={() => setPlaying((value) => !value)}>
              {playing && time < DURATION ? "暂停" : "播放"}
            </button>
            <button type="button" onClick={restart}>
              重来
            </button>
          </div>
        </header>
        <OfficeStage time={time} />
        <footer className="poses">
          {POSES.map((pose) => (
            <span key={pose} className={poses.has(pose) ? "on" : ""}>
              {POSE_NAME[pose]}
            </span>
          ))}
        </footer>
      </section>
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
          {actors.map((actor) => (
            <li key={actor.id}>
              <b>{actor.name}</b>
              <em>{actor.label}</em>
            </li>
          ))}
        </ul>
      </aside>
    </main>
  );
}

import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { rehearsalDesks } from "./office/draw";
import { petIds, type PetId } from "./office/pets";
import { DEFAULT_ROOM, type RoomLook } from "./office/room";
import { OfficeStage } from "./office/OfficeStage";
import { Markdown } from "./work/MarkdownView";
import { ROOM } from "./office/roster";
import { DURATION } from "./office/script";
import { activePoses, actorsAt, linesAt } from "./office/scene";
import { rosterView, type DraftPreview } from "./office/seats";
import { nameLabel, shift, useNow } from "./office/shift";
import { useWalk } from "./office/walk";
import { POSE_NAME, type Pose } from "./office/types";
import { createDepartment, deleteDepartment, listDepartments, listPeople, updateDepartment } from "./people/api";
import type { Department, DepartmentDraft } from "./people/department";
import { RosterPanel } from "./people/RosterPanel";
import type { PersonRow } from "./people/record";
import { WorkPanel } from "./work/WorkPanel";
import type { DutyHold, FloorMark } from "./work/api";

const CHAT_WIDTH_KEY = "oak-office-chat-width";
const DEPARTMENT_KEY = "oak-office-department";
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
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickRequest, setPickRequest] = useState<{ id: string; n: number } | null>(null);
  const [draft, setDraft] = useState<DraftPreview | null>(null);
  const [roomDraft, setRoomDraft] = useState<RoomLook | null>(null);
  const [petDraft, setPetDraft] = useState<PetId[] | null>(null);
  const [floor, setFloor] = useState<Record<string, FloorMark>>({});
  const [screen, setScreen] = useState<{ x: number; y: number; title: string } | null>(null);
  const [boardOpen, setBoardOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [floorDraft, setFloorDraft] = useState<DepartmentDraft | null>(null);
  const [floorLive, setFloorLive] = useState<DepartmentDraft | null>(null);
  const [holding, setHolding] = useState<DutyHold[]>([]);
  const pickN = useRef(0);
  const playingRef = useRef(true);
  const timeRef = useRef(0);
  const modeRef = useRef<Mode>("work");
  const logRef = useRef<HTMLDivElement>(null);
  const [chatWidth, setChatWidth] = useState(readChatWidth);
  const chatWidthRef = useRef(chatWidth);
  const onDraft = useCallback((next: DraftPreview | null) => setDraft(next), []);
  const onLook = useCallback((next: RoomLook | null) => setRoomDraft(next), []);
  const onPets = useCallback((next: PetId[] | null) => setPetDraft(next), []);
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
      const floors = await listDepartments();
      setDepartments(floors);
      const saved = localStorage.getItem(DEPARTMENT_KEY);
      const id = floors.some((item) => item.id === saved) ? saved : (floors[0]?.id ?? null);
      setDepartmentId(id);
      if (id) localStorage.setItem(DEPARTMENT_KEY, id);
      setPeople(id ? await listPeople(id) : []);
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
      const dutyLabel = holding.find((duty) => duty.person_id === id)?.label ?? "";
      const view = shift(mark, now, dutyLabel);
      return [id, { ...mark, pose: view.pose, label: nameLabel(mark.label, view.label, dutyLabel, view.pose) }];
    }),
  );
  const department = departments?.find((item) => item.id === departmentId) ?? null;
  const draftSeats = floorLive && Number.isInteger(floorLive.seats) && floorLive.seats >= 1 && floorLive.seats <= 8 ? floorLive.seats : 4;
  const roster = rosterView(
    floorDraft ? [] : (people ?? []),
    mode === "roster" && !floorDraft ? draft : null,
    mode === "roster" ? selectedId : null,
    shownFloor,
    mode === "work",
    floorDraft ? draftSeats : (department?.seats ?? 8),
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

  function dropDraft() {
    setFloorDraft(null);
    setFloorLive(null);
  }

  async function choose(id: string) {
    setScreen(null);
    setBoardOpen(false);
    setRulesOpen(false);
    dropDraft();
    localStorage.setItem(DEPARTMENT_KEY, id);
    setDepartmentId(id);
    setFloor({});
    setHolding([]);
    setSelectedId(null);
    setDraft(null);
    setRoomDraft(null);
    setPetDraft(null);
    setPeople(null);
    try {
      setPeople(await listPeople(id));
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "档案库没连上。");
    }
  }

  function addFloor() {
    if (floorDraft) return;
    const used = new Set((departments ?? []).map((item) => item.floor));
    let floorNo = 1;
    while (used.has(floorNo) && floorNo < 99) floorNo += 1;
    const next: DepartmentDraft = {
      floor: floorNo,
      name: "",
      rules: "",
      seats: 4,
      pets: "",
      ...DEFAULT_ROOM,
    };
    setFloorDraft(next);
    setFloorLive(next);
    setSelectedId(null);
    setDraft(null);
  }

  async function commitFloor(draftFloor: DepartmentDraft) {
    const created = await createDepartment(draftFloor);
    setDepartments((current) => [...(current ?? []).filter((item) => item.id !== created.id), created].sort((a, b) => a.floor - b.floor));
    await choose(created.id);
  }

  async function removeFloor(id: string) {
    await deleteDepartment(id);
    const rest = (departments ?? []).filter((item) => item.id !== id).sort((a, b) => a.floor - b.floor);
    setDepartments(rest);
    const next = rest[0];
    if (next) await choose(next.id);
  }

  async function saveRules(rules: string) {
    if (!department) return;
    const next = await updateDepartment(department.id, {
      floor: department.floor,
      name: department.name,
      rules,
      seats: department.seats,
      pets: department.pets,
      style: department.style ?? DEFAULT_ROOM.style,
      wall: department.wall ?? DEFAULT_ROOM.wall,
      ground: department.ground ?? DEFAULT_ROOM.ground,
      trim: department.trim ?? DEFAULT_ROOM.trim,
      wood: department.wood ?? DEFAULT_ROOM.wood,
    });
    saveDepartment(next);
    setRulesOpen(false);
  }

  function saveDepartment(next: Department) {
    setDepartments((current) =>
      (current ?? []).map((item) => (item.id === next.id ? next : item)).sort((a, b) => a.floor - b.floor),
    );
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
              {mode === "rehearsal"
                ? "排练"
                : `${
                    floorDraft
                      ? `${floorLive?.floor ?? floorDraft.floor}层 ${floorLive?.name.trim() || "新的一层"}`
                      : department
                        ? `${department.floor}层 ${department.name}`
                        : "部门"
                  } · ${mode === "roster" ? "编制" : "办公"}`}
            </span>
          </div>
          {mode === "rehearsal" ? null : (
            <nav className="floors">
              {(departments ?? []).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={!floorDraft && item.id === departmentId ? "on" : ""}
                  onClick={() => void choose(item.id)}
                >
                  {item.floor} {item.name}
                </button>
              ))}
              {mode === "roster" ? (
                <button type="button" onClick={() => void addFloor()}>
                  加一层
                </button>
              ) : null}
            </nav>
          )}
          <div className="modes">
            <button
              type="button"
              className={mode === "work" ? "on" : ""}
              onClick={() => {
                setScreen(null);
                setBoardOpen(false);
                setRulesOpen(false);
                dropDraft();
                setMode("work");
              }}
            >
              办公
            </button>
            <button
              type="button"
              className={mode === "roster" ? "on" : ""}
              onClick={() => {
                setScreen(null);
                setBoardOpen(false);
                setRulesOpen(false);
                setMode("roster");
              }}
            >
              编制
            </button>
            <button
              type="button"
              className={mode === "rehearsal" ? "on" : ""}
              onClick={() => {
                setScreen(null);
                setBoardOpen(false);
                setRulesOpen(false);
                dropDraft();
                setMode("rehearsal");
              }}
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
          look={
            mode === "rehearsal"
              ? DEFAULT_ROOM
              : (roomDraft ??
                (floorDraft
                  ? {
                      style: floorDraft.style,
                      wall: floorDraft.wall,
                      ground: floorDraft.ground,
                      trim: floorDraft.trim,
                      wood: floorDraft.wood,
                    }
                  : department
                    ? {
                        style: department.style ?? DEFAULT_ROOM.style,
                        wall: department.wall ?? DEFAULT_ROOM.wall,
                        ground: department.ground ?? DEFAULT_ROOM.ground,
                        trim: department.trim ?? DEFAULT_ROOM.trim,
                        wood: department.wood ?? DEFAULT_ROOM.wood,
                      }
                    : DEFAULT_ROOM))
          }
          pets={mode === "rehearsal" ? [] : floorDraft ? (petDraft ?? []) : (petDraft ?? petIds(department?.pets) ?? [])}
          onPick={mode === "roster" ? pick : undefined}
          onScreen={(desk, title) => {
            setBoardOpen(false);
            setRulesOpen(false);
            setScreen({ x: desk.x, y: desk.y, title });
          }}
          onCloseScreen={() => setScreen(null)}
          screen={screen}
          onBoard={mode !== "rehearsal" && !floorDraft && department ? () => {
            setScreen(null);
            setRulesOpen(false);
            setBoardOpen(true);
          } : undefined}
          onCloseBoard={() => setBoardOpen(false)}
          board={boardOpen && !floorDraft && mode !== "rehearsal"}
          onRules={mode !== "rehearsal" && !floorDraft && department ? () => {
            setScreen(null);
            setBoardOpen(false);
            setRulesOpen(true);
          } : undefined}
          onCloseRules={() => setRulesOpen(false)}
          rules={rulesOpen && !floorDraft && mode !== "rehearsal"}
          rulesText={department?.rules ?? ""}
          onSaveRules={saveRules}
          departmentId={department?.id ?? ""}
          people={(people ?? []).map((person) => ({ id: person.id, name: person.name }))}
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
          key={departmentId ?? "none"}
          people={people}
          departmentId={departmentId}
          departmentName={department?.name ?? "部门"}
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
          department={floorDraft ? null : department}
          floorDraft={floorDraft}
          onDepartment={saveDepartment}
          onCreateFloor={commitFloor}
          onDiscardFloor={dropDraft}
          onPreviewFloor={setFloorLive}
          onRemoveFloor={(id) => removeFloor(id)}
          onLook={onLook}
          onPets={onPets}
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
                <div className="bubble">
                  <Markdown text={line.text} />
                </div>
              </article>
            ))}
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
            }}
          >
            <textarea disabled value="" placeholder="剧本播放中，还不能插话" readOnly rows={1} />
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

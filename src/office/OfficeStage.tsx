import { useEffect, useRef, useState } from "react";
import { actorAt, boardAt, boardFace, clockAt, coolerAt, cupAt, drawOffice, monitorAt, roomTransform, rulesAt } from "./draw";
import { BoardDesk } from "./BoardDesk";
import { ClockDesk } from "./ClockDesk";
import { RulesDesk } from "./RulesDesk";
import { ScreenDesk } from "./ScreenDesk";
import { WaterDesk } from "./WaterDesk";
import { readNotices, seeNotices, type Notice } from "./notices";
import { drinkWater, readWater, type WaterReminder } from "./water";
import { type PetId } from "./pets";
import { DEFAULT_ROOM, type RoomLook } from "./room";
import { ROOM } from "./roster";
import type { DeskSpot } from "./seats";
import type { ActorFrame } from "./types";

export function OfficeStage({
  actors,
  clock,
  room = ROOM,
  desks,
  look = DEFAULT_ROOM,
  pets = [],
  onPick,
  onScreen,
  onCloseScreen,
  screen = null,
  onBoard,
  onCloseBoard,
  board = false,
  onClock,
  onCloseClock,
  clockOpen = false,
  onRules,
  onCloseRules,
  rules = false,
  onWater,
  onCloseWater,
  waterOpen = false,
  rulesText = "",
  onSaveRules,
  departmentId = "",
  people = [],
}: {
  actors: ActorFrame[];
  clock: number | null;
  room?: { w: number; h: number };
  desks?: DeskSpot[];
  look?: RoomLook;
  pets?: readonly PetId[];
  onPick?: (id: string) => void;
  onScreen?: (desk: DeskSpot, title: string, personId: string | null) => void;
  onCloseScreen?: () => void;
  screen?: { x: number; y: number; title: string; personId: string | null } | null;
  onBoard?: () => void;
  onCloseBoard?: () => void;
  board?: boolean;
  onClock?: () => void;
  onCloseClock?: () => void;
  clockOpen?: boolean;
  onRules?: () => void;
  onCloseRules?: () => void;
  rules?: boolean;
  onWater?: () => void;
  onCloseWater?: () => void;
  waterOpen?: boolean;
  rulesText?: string;
  onSaveRules?: (rules: string) => Promise<void>;
  departmentId?: string;
  people?: { id: string; name: string }[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actorsRef = useRef(actors);
  const onPickRef = useRef(onPick);
  const onScreenRef = useRef(onScreen);
  const onBoardRef = useRef(onBoard);
  const onClockRef = useRef(onClock);
  const onRulesRef = useRef(onRules);
  const onWaterRef = useRef(onWater);
  const desksRef = useRef(desks);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [ambient, setAmbient] = useState(0);
  const [wall, setWall] = useState(() => Date.now());
  const [reminder, setReminder] = useState<WaterReminder | null>(null);
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [noticeError, setNoticeError] = useState<string | null>(null);
  const [unseen, setUnseen] = useState(false);
  const [noticesFirst, setNoticesFirst] = useState(false);
  const reminderRef = useRef(reminder);
  const unseenRef = useRef(unseen);
  const sawNotice = useRef(false);
  const live = clock === null;

  actorsRef.current = actors;
  onPickRef.current = onPick;
  onScreenRef.current = onScreen;
  onBoardRef.current = onBoard;
  onClockRef.current = onClock;
  onRulesRef.current = onRules;
  onWaterRef.current = onWater;
  desksRef.current = desks;
  reminderRef.current = reminder;
  unseenRef.current = unseen;

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      setSize({ w: rect.width, h: rect.height });
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setWall(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let gone = false;
    void readWater()
      .then((next) => {
        if (!gone) setReminder(next);
      })
      .catch(() => {
        if (!gone) setReminder(null);
      });
    return () => {
      gone = true;
    };
  }, [departmentId]);

  useEffect(() => {
    let gone = false;
    void readNotices()
      .then((board) => {
        if (gone) return;
        setNotices(board.notices);
        if (!sawNotice.current) setUnseen(board.unseen);
        setNoticeError(null);
      })
      .catch((caught) => {
        if (gone) return;
        setNoticeError(caught instanceof Error ? caught.message : "公告没打开。");
      });
    return () => {
      gone = true;
    };
  }, []);

  useEffect(() => {
    if (!live) return;
    let frame = 0;
    let last = 0;
    const loop = (now: number) => {
      if (now - last >= 80) {
        last = now;
        setAmbient((value) => value + 1);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [live]);

  const drawn = clock === null ? ambient : Math.floor(clock / 80);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w < 2 || size.h < 2) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.w * dpr);
    canvas.height = Math.floor(size.h * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const now = Date.now();
    const glass = waterGlass(reminder, now);
    drawOffice(ctx, size.w, size.h, actors, drawn, room, desks, look, pets, now, glass.dripping, glass.cup, unseen);
  }, [size, actors, drawn, room, desks, look, pets, wall, reminder, unseen]);

  function pick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (screen || board || clockOpen || rules || waterOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { scale, ox, oy } = roomTransform(rect.width, rect.height, room);
    const x = (event.clientX - rect.left - ox) / scale;
    const y = (event.clientY - rect.top - oy) / scale;
    if (rulesAt(x, y) && onRulesRef.current) {
      const fresh = unseenRef.current && !sawNotice.current;
      setNoticesFirst(fresh);
      if (!sawNotice.current) {
        sawNotice.current = true;
        setUnseen(false);
        void seeNotices().catch(() => {
          sawNotice.current = false;
          setUnseen(true);
        });
      }
      onRulesRef.current();
      return;
    }
    if (clockAt(x, y) && onClockRef.current) {
      onClockRef.current();
      return;
    }
    const current = reminderRef.current;
    if (current && current.nextAt <= Date.now() && cupAt(x, y)) {
      void drinkWater()
        .then(setReminder)
        .catch(() => {});
      return;
    }
    if (coolerAt(x, y) && onWaterRef.current) {
      onWaterRef.current();
      return;
    }
    if (boardAt(x, y, look.style) && onBoardRef.current) {
      onBoardRef.current();
      return;
    }
    const desk = monitorAt(desksRef.current ?? [], x, y);
    const open = onScreenRef.current;
    if (desk && open) {
      const person = actorsRef.current.find((actor) => Math.hypot(actor.x - desk.x, actor.y - desk.y) < 36);
      const named = person && person.id !== "draft" ? person : null;
      open(desk, named ? `${named.name}的电脑` : desk.lead ? "主管的电脑" : "工位的电脑", named?.id ?? null);
      return;
    }
    const choose = onPickRef.current;
    if (!choose) return;
    const hit = actorAt(actorsRef.current, x, y);
    if (hit && hit.id !== "draft") choose(hit.id);
  }

  const box = officeBox(size.w, size.h, room);

  return (
    <div className={screen || board || clockOpen || rules || waterOpen ? "stage into" : "stage"} ref={wrapRef}>
      <canvas ref={canvasRef} onClick={pick} className={onPick || onScreen || onBoard || onClock || onRules || onWater ? "pick" : ""} />
      {screen && onCloseScreen ? (
        <ScreenDesk title={screen.title} personId={screen.personId} onClose={onCloseScreen} box={paddedOffice(box)} />
      ) : null}
      {board && onCloseBoard && departmentId ? (
        <BoardDesk departmentId={departmentId} people={people} box={boardBox(box)} face={boardFace(look)} onClose={onCloseBoard} />
      ) : null}
      {clockOpen && onCloseClock && departmentId ? (
        <ClockDesk departmentId={departmentId} people={people} box={boardBox(box)} onClose={onCloseClock} />
      ) : null}
      {waterOpen && onCloseWater && departmentId ? (
        <WaterDesk
          departmentId={departmentId}
          box={coolerPlace(box)}
          face={look}
          onClose={onCloseWater}
          onReminder={setReminder}
        />
      ) : null}
      {rules && onCloseRules && onSaveRules ? (
        <RulesDesk
          text={rulesText}
          notices={notices}
          noticeError={noticeError}
          noticesFirst={noticesFirst}
          box={boardBox(box)}
          face={look.wood}
          onClose={onCloseRules}
          onSave={onSaveRules}
        />
      ) : null}
    </div>
  );
}

function officeBox(width: number, height: number, room: { w: number; h: number }) {
  const { scale, ox, oy } = roomTransform(width, height, room);
  return { left: ox, top: oy, width: room.w * scale, height: room.h * scale };
}

function paddedOffice(office: { left: number; top: number; width: number; height: number }) {
  const width = Math.round(office.width * 0.94);
  const height = Math.round(office.height * 0.86);
  return {
    left: Math.round(office.left + (office.width - width) / 2),
    top: Math.round(office.top + (office.height - height) / 2),
    width,
    height,
  };
}

function waterGlass(reminder: WaterReminder | null, now: number) {
  if (!reminder) return { dripping: false, cup: null };
  const every = reminder.everyMinutes * 60_000;
  const due = reminder.nextAt <= now;
  const fill = due ? 1 : Math.min(1, Math.max(0, 1 - (reminder.nextAt - now) / every));
  return { dripping: !due, cup: { fill, due } };
}

function coolerPlace(office: { left: number; top: number; width: number; height: number }) {
  const width = 220;
  const visual = width * 1.5;
  const top = Math.max(8, Math.round(office.top + Math.min(20, office.height * 0.03)));
  const roomBottom = office.top + office.height - 8;
  const zoom = Math.min(1, Math.max(0.62, roomBottom - top) / (width * 1.9), Math.max(168, office.width - 16) / visual);
  return {
    left: Math.max(8, Math.round(office.left + office.width - visual * zoom - 12)),
    top,
    width,
    zoom,
  };
}

function boardBox(office: { left: number; top: number; width: number; height: number }) {
  const frame = paddedOffice(office);
  const aspect = 52 / 36;
  let width = frame.width;
  let height = width / aspect;
  if (height > frame.height) {
    height = frame.height;
    width = height * aspect;
  }
  width = Math.round(width);
  height = Math.round(height);
  return {
    left: Math.round(frame.left + (frame.width - width) / 2),
    top: Math.round(frame.top + (frame.height - height) / 2),
    width,
    height,
  };
}

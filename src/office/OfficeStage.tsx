import { useEffect, useRef, useState } from "react";
import { actorAt, drawOffice, monitorAt, roomTransform } from "./draw";
import { ScreenDesk } from "./ScreenDesk";
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
  sign = "交付组",
  look = DEFAULT_ROOM,
  pets = [],
  onPick,
  onScreen,
  onCloseScreen,
  screen = null,
}: {
  actors: ActorFrame[];
  clock: number | null;
  room?: { w: number; h: number };
  desks?: DeskSpot[];
  sign?: string;
  look?: RoomLook;
  pets?: readonly PetId[];
  onPick?: (id: string) => void;
  onScreen?: (desk: DeskSpot, title: string) => void;
  onCloseScreen?: () => void;
  screen?: { x: number; y: number; title: string } | null;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actorsRef = useRef(actors);
  const onPickRef = useRef(onPick);
  const onScreenRef = useRef(onScreen);
  const desksRef = useRef(desks);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [ambient, setAmbient] = useState(0);
  const live = clock === null;

  actorsRef.current = actors;
  onPickRef.current = onPick;
  onScreenRef.current = onScreen;
  desksRef.current = desks;

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
    drawOffice(ctx, size.w, size.h, actors, drawn, room, desks, sign, look, pets);
  }, [size, actors, drawn, room, desks, sign, look, pets]);

  function pick(event: React.MouseEvent<HTMLCanvasElement>) {
    if (screen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { scale, ox, oy } = roomTransform(rect.width, rect.height, room);
    const x = (event.clientX - rect.left - ox) / scale;
    const y = (event.clientY - rect.top - oy) / scale;
    const desk = monitorAt(desksRef.current ?? [], x, y);
    const open = onScreenRef.current;
    if (desk && open) {
      const person = actorsRef.current.find((actor) => Math.hypot(actor.x - desk.x, actor.y - desk.y) < 36);
      open(desk, person && person.id !== "draft" ? `${person.name}的电脑` : desk.lead ? "主管的电脑" : "工位的电脑");
      return;
    }
    const choose = onPickRef.current;
    if (!choose) return;
    const hit = actorAt(actorsRef.current, x, y);
    if (hit && hit.id !== "draft") choose(hit.id);
  }

  const box = officeBox(size.w, size.h, room);

  return (
    <div className={screen ? "stage into" : "stage"} ref={wrapRef}>
      <canvas ref={canvasRef} onClick={pick} className={onPick || onScreen ? "pick" : ""} />
      {screen && onCloseScreen ? (
        <ScreenDesk title={screen.title} onClose={onCloseScreen} box={box} />
      ) : null}
    </div>
  );
}

function officeBox(width: number, height: number, room: { w: number; h: number }) {
  const { scale, ox, oy } = roomTransform(width, height, room);
  return { left: ox, top: oy, width: room.w * scale, height: room.h * scale };
}

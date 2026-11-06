import { useEffect, useRef, useState } from "react";
import { actorAt, drawOffice, roomTransform } from "./draw";
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
  onPick,
}: {
  actors: ActorFrame[];
  clock: number | null;
  room?: { w: number; h: number };
  desks?: DeskSpot[];
  sign?: string;
  look?: RoomLook;
  onPick?: (id: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const actorsRef = useRef(actors);
  const onPickRef = useRef(onPick);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [ambient, setAmbient] = useState(0);
  const live = clock === null;

  actorsRef.current = actors;
  onPickRef.current = onPick;

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
    drawOffice(ctx, size.w, size.h, actors, drawn, room, desks, sign, look);
  }, [size, actors, drawn, room, desks, sign, look]);

  function pick(event: React.MouseEvent<HTMLCanvasElement>) {
    const choose = onPickRef.current;
    const canvas = canvasRef.current;
    if (!choose || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const { scale, ox, oy } = roomTransform(rect.width, rect.height, room);
    const hit = actorAt(
      actorsRef.current,
      (event.clientX - rect.left - ox) / scale,
      (event.clientY - rect.top - oy) / scale,
    );
    if (hit && hit.id !== "draft") choose(hit.id);
  }

  return (
    <div className="stage" ref={wrapRef}>
      <canvas ref={canvasRef} onClick={pick} className={onPick ? "pick" : ""} />
    </div>
  );
}

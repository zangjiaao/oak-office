import { DESKS, ROOM, SPOTS } from "./roster";
import type { DeskSpot } from "./seats";
import type { ActorFrame, Pose } from "./types";

export function rehearsalDesks(): DeskSpot[] {
  return DESKS.map((id) => ({ x: SPOTS[id].x, y: SPOTS[id].y, lead: id === "lead", id }));
}

type Screen = "off" | "read" | "type" | "run" | "ok" | "error";

const QUIET = new Set(["闲置", "不在", "下班", "主管", "等你一句话"]);

function screenFor(pose: Pose, atDesk: boolean, label = ""): Screen {
  if (!atDesk) return "off";
  if (pose === "read" || pose === "think") return "read";
  if (pose === "type" || pose === "wait") return "type";
  if (pose === "run") return "run";
  if (pose === "done") return "ok";
  if (pose === "error") return "error";
  if (label && !QUIET.has(label)) return "read";
  return "off";
}

function rect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function drawRoom(ctx: CanvasRenderingContext2D, frame: number, room: { w: number; h: number }) {
  rect(ctx, 0, 0, room.w, 78, "#243f36");
  rect(ctx, 0, 0, room.w, 8, "#1b312a");
  rect(ctx, 0, 62, room.w, 8, "#c6a15b");
  rect(ctx, 0, 70, room.w, 8, "#1a1714");
  rect(ctx, 0, 78, room.w, room.h - 78, "#c4a574");
  for (let y = 90; y < room.h; y += 14) {
    rect(ctx, 0, y, room.w, 1, "#b08a58");
  }

  rect(ctx, 18, 18, 46, 40, "#6b4428");
  rect(ctx, 22, 28, 16, 22, "#d7c4a2");
  rect(ctx, 40, 34, 18, 6, "#8c4a3a");
  rect(ctx, 40, 42, 14, 4, "#3d6f8c");

  rect(ctx, 168, 16, 36, 52, "#6b4428");
  rect(ctx, 172, 20, 28, 44, "#120e0c");
  rect(ctx, 196, 36, 4, 8, "#c6a15b");

  rect(ctx, 214, 22, 22, 22, "#efe6d4");
  rect(ctx, 224, 33, 2, 6, "#1a1714");
  rect(ctx, 221, 33, 5, 2, "#a8322a");

  rect(ctx, 300, 16, 52, 36, "#8ec8e6");
  rect(ctx, 306, 22, 14, 8, "#f4f7fb");
  rect(ctx, 324, 30, 18, 6, "#f4f7fb");
  if (frame % 80 < 40) rect(ctx, 336, 18, 2, 2, "#f4f0c8");

  rect(ctx, 364, 70, 16, 28, "#d9e4ea");
  rect(ctx, 368, 74, 8, 10, "#8ec8e6");
  rect(ctx, 360, 96, 24, 4, "#8c5a32");
}

function drawDesk(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  screen: Screen,
  frame: number,
  lead = false,
) {
  rect(ctx, x - 28, y - 6, 56, 6, "#5c4636");
  rect(ctx, x - 30, y - 18, 60, 12, lead ? "#efe0bf" : "#e6d3a8");
  rect(ctx, x - 26, y - 8, 4, 16, "#6b4428");
  rect(ctx, x + 22, y - 8, 4, 16, "#6b4428");
  rect(ctx, x - 16, y - 40, 32, 22, "#1a1714");
  const glow =
    screen === "error"
      ? "#a8322a"
      : screen === "ok"
        ? "#2f6b45"
        : screen === "run"
          ? frame % 20 < 10
            ? "#e0b15a"
            : "#8a6230"
          : screen === "off"
            ? "#243044"
            : "#17382f";
  rect(ctx, x - 14, y - 38, 28, 18, glow);
  if (screen === "read" || screen === "type") {
    const w = 8 + ((frame + x) % 16);
    rect(ctx, x - 11, y - 34, w, 2, "#9ddec0");
    rect(ctx, x - 11, y - 30, Math.max(4, w - 4), 2, "#9ddec0");
  }
  if (screen === "ok") rect(ctx, x - 4, y - 32, 8, 2, "#d7ffe4");
  if (screen === "error" && frame % 30 < 18) rect(ctx, x - 2, y - 34, 2, 6, "#ffe8e4");
  rect(ctx, x - 8, y - 16, 14, 3, "#2c3338");
}

function drawPerson(
  ctx: CanvasRenderingContext2D,
  actor: ActorFrame,
  frame: number,
) {
  const { look } = actor;
  const bob = actor.pose === "error" ? (frame % 24 < 12 ? -2 : 0) : actor.pose === "type" ? (frame % 16 < 8 ? 0 : -1) : 0;
  const step = Math.floor(frame / 8) % 2;
  ctx.save();
  ctx.translate(Math.round(actor.x), Math.round(actor.y + bob));
  if (actor.selected) rect(ctx, -8, -1, 16, 3, "#c6a15b");
  if (actor.face < 0) ctx.scale(-1, 1);

  const leg = actor.walking ? (step ? 2 : -2) : 0;
  rect(ctx, -5, -20, 10, 8, look.shirt);
  rect(ctx, -4, -12, 3, 8 + (actor.walking ? leg : 0), look.pants);
  rect(ctx, 1, -12, 3, 8 + (actor.walking ? -leg : 0), look.pants);
  rect(ctx, -5, -5, 4, 2, "#1a1714");
  rect(ctx, 1, -5, 4, 2, "#1a1714");
  rect(ctx, -4, -26, 8, 7, look.skin);
  if (look.hairStyle === "bun") {
    rect(ctx, -4, -29, 8, 4, look.hair);
    rect(ctx, 2, -32, 4, 4, look.hair);
  } else if (look.hairStyle === "crop") {
    rect(ctx, -4, -28, 8, 3, look.hair);
  } else {
    rect(ctx, -4, -29, 8, 4, look.hair);
    rect(ctx, -5, -26, 2, 4, look.hair);
  }
  rect(ctx, 1, -24, 1, 1, "#1a1714");
  if (actor.walking) rect(ctx, 4, -16, 3, 5, look.skin);
  if (actor.pose === "handoff" || actor.pose === "report") {
    rect(ctx, 6, -15, 5, 6, "#f0d78a");
    rect(ctx, 6, -15, 5, 1, "#c6a15b");
  }
  ctx.restore();

  if (!actor.walking && (actor.pose === "think" || actor.pose === "wait" || actor.pose === "error")) {
    const mark = actor.pose === "think" ? "?" : actor.pose === "error" ? "!" : "…";
    ctx.fillStyle = "#fffaf2";
    ctx.fillRect(actor.x + 8, actor.y - 34, 12, 10);
    ctx.fillStyle = "#1a1714";
    ctx.font = "8px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(mark, actor.x + 14, actor.y - 26);
  }
}

export function roomTransform(width: number, height: number, room = ROOM) {
  const scale = Math.max(1, Math.floor(Math.min(width / room.w, height / room.h)));
  const ox = Math.floor((width - room.w * scale) / 2);
  const oy = Math.floor((height - room.h * scale) / 2);
  return { scale, ox, oy };
}

export function actorAt(actors: ActorFrame[], roomX: number, roomY: number) {
  const ordered = [...actors].sort((a, b) => b.y - a.y);
  return ordered.find((actor) => {
    const dx = Math.abs(roomX - actor.x);
    const dy = actor.y - roomY;
    return dx <= 14 && dy >= -6 && dy <= 34;
  });
}

function occupant(actors: ActorFrame[], desk: DeskSpot) {
  const near = (actor: ActorFrame) => Math.hypot(actor.x - desk.x, actor.y - desk.y) < 8;
  if (desk.id) {
    const named = actors.find((actor) => actor.id === desk.id);
    if (named) return near(named) ? named : undefined;
  }
  return actors.find(near);
}

export function drawOffice(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  actors: ActorFrame[],
  frame: number,
  room = ROOM,
  desks: DeskSpot[] = rehearsalDesks(),
  sign = "交付组",
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#1a1714";
  ctx.fillRect(0, 0, width, height);
  const { scale, ox, oy } = roomTransform(width, height, room);
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);
  ctx.imageSmoothingEnabled = false;
  drawRoom(ctx, frame, room);

  for (const desk of desks) {
    const owner = occupant(actors, desk);
    drawDesk(
      ctx,
      desk.x,
      desk.y - 8,
      screenFor(owner?.pose ?? "idle", Boolean(owner), owner?.label ?? ""),
      frame,
      desk.lead,
    );
  }

  const ordered = [...actors].sort((a, b) => a.y - b.y);
  for (const actor of ordered) drawPerson(ctx, actor, frame);

  const plaque = sign.trim().slice(0, 16) || "部门";
  ctx.fillStyle = "#fffaf2";
  ctx.fillRect(8, 8, Math.max(78, 16 + plaque.length * 8), 28);
  ctx.fillStyle = "#1a1714";
  ctx.font = "8px ui-monospace, monospace";
  ctx.textAlign = "left";
  ctx.fillText("OAK OFFICE", 12, 19);
  ctx.fillText(plaque, 12, 30);
  ctx.restore();

  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.font = `${Math.max(10, scale * 4)}px "Iowan Old Style", Palatino, serif`;
  for (const actor of actors) {
    const sx = ox + actor.x * scale;
    const sy = oy + (actor.y - 30) * scale;
    ctx.fillStyle = "rgba(26,23,20,0.78)";
    const name = `${actor.name} · ${actor.label}`;
    const tw = ctx.measureText(name).width;
    ctx.fillRect(sx - tw / 2 - 4, sy - 16, tw + 8, 16);
    ctx.fillStyle = "#fffaf2";
    ctx.fillText(name, sx, sy - 3);
  }
}

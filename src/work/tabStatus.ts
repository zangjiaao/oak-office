import { useEffect, useRef, useState } from "react";
import type { Pose } from "../office/types";

const TITLE = "Oak Office";
const WORKING = new Set<Pose>(["think", "read", "type", "run", "wait", "handoff", "report"]);

export type TabKind = "idle" | "work" | "done" | "stuck";

const TITLE_FOR: Record<TabKind, string> = {
  idle: TITLE,
  work: "● 在做",
  done: "✓ 完成",
  stuck: "! 卡住",
};

const COLOR_FOR: Record<TabKind, string> = {
  idle: "#c6a15b",
  work: "#e0a23a",
  done: "#3f9a62",
  stuck: "#c4544a",
};

export function tabKind(
  marks: { pose: Pose; label: string }[],
  memory: { working: boolean; holdDone: boolean },
  visible: boolean,
): TabKind {
  const working = marks.some((mark) => WORKING.has(mark.pose));
  const stuck = marks.some((mark) => mark.pose === "error");
  const done = marks.some((mark) => mark.pose === "done" || mark.label === "做完");
  if (working) {
    memory.working = true;
    memory.holdDone = false;
    return "work";
  }
  if (memory.working && !visible) memory.holdDone = true;
  if (visible) {
    memory.holdDone = false;
    memory.working = false;
  }
  if (stuck) return "stuck";
  if (done || memory.holdDone) return "done";
  return "idle";
}

export function useTabStatus(active: boolean, marks: { pose: Pose; label: string }[]) {
  const memory = useRef({ working: false, holdDone: false });
  const [visible, setVisible] = useState(() => document.visibilityState === "visible");
  const painted = useRef<TabKind | null>(null);

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    const kind = active ? tabKind(marks, memory.current, visible) : "idle";
    if (!active) {
      memory.current.working = false;
      memory.current.holdDone = false;
    }
    document.title = kind === "work" && marks.filter((mark) => WORKING.has(mark.pose)).length > 1
      ? `● 在做 ${marks.filter((mark) => WORKING.has(mark.pose)).length}`
      : TITLE_FOR[kind];
    if (painted.current !== kind) {
      painted.current = kind;
      paintIcon(kind);
    }
  }, [active, marks, visible]);

  useEffect(
    () => () => {
      document.title = TITLE;
      paintIcon("idle");
    },
    [],
  );
}

function paintIcon(kind: TabKind) {
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, 32, 32);
  ctx.fillStyle = COLOR_FOR[kind];
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, Math.PI * 2);
  ctx.fill();
  if (kind !== "idle") {
    ctx.fillStyle = "#241c16";
    ctx.font = "bold 18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(kind === "work" ? "…" : kind === "done" ? "✓" : "!", 16, 17);
  }
  let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.type = "image/png";
  link.href = canvas.toDataURL("image/png");
}

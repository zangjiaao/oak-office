import { useEffect, useState } from "react";
import type { Pose } from "./types";

export const DONE_MS = 60_000;
export const IDLE_MS = 60 * 60 * 1000;
export const LEAVE_MS = 2800;

export function shift(mark: { pose: Pose; label: string; updated_at?: number }, now: number, dutyLabel = "") {
  if (mark.label !== "做完" || !mark.updated_at) return { pose: mark.pose, label: mark.label };
  const elapsed = now - mark.updated_at;
  if (elapsed < DONE_MS) return { pose: "done" as const, label: "做完" };
  if (dutyLabel) return { pose: "idle" as const, label: dutyLabel };
  if (elapsed < DONE_MS + IDLE_MS) return { pose: "idle" as const, label: "闲置" };
  if (elapsed < DONE_MS + IDLE_MS + LEAVE_MS) return { pose: "arrive" as const, label: "下班" };
  return { pose: "idle" as const, label: "不在" };
}

const BEAT_LABEL = new Set(["进来了", "在想", "在听", "卡住", "来回报", "做完", "下班", "不在", "闲置", "等人"]);
const LIVE_POSE = new Set<Pose>(["arrive", "think", "read", "type", "run", "wait", "handoff", "report", "error"]);

export function nameLabel(stored: string, view: string, dutyLabel: string, pose: Pose) {
  if (!dutyLabel || BEAT_LABEL.has(stored) || LIVE_POSE.has(pose)) return view;
  return dutyLabel;
}

export function stillWorking(mark: { pose: Pose; label: string; updated_at?: number } | undefined, now: number, held = false) {
  if (!mark) return false;
  const view = shift(mark, now, held ? "守着" : "");
  if (view.label === "做完" || view.label === "闲置") return true;
  const at = mark.updated_at;
  return held && mark.label === "做完" && typeof at === "number" && now - at >= DONE_MS;
}

export function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 400);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

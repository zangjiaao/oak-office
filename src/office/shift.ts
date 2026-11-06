import { useEffect, useState } from "react";
import type { Pose } from "./types";

export const DONE_MS = 60_000;
export const IDLE_MS = 60 * 60 * 1000;
export const LEAVE_MS = 2800;

export function shift(mark: { pose: Pose; label: string; updated_at?: number }, now: number, held = false) {
  if (mark.label !== "做完" || !mark.updated_at) return { pose: mark.pose, label: mark.label };
  const elapsed = now - mark.updated_at;
  if (elapsed < DONE_MS) return { pose: "done" as const, label: "做完" };
  if (held) return { pose: "wait" as const, label: "等人" };
  if (elapsed < DONE_MS + IDLE_MS) return { pose: "idle" as const, label: "闲置" };
  if (elapsed < DONE_MS + IDLE_MS + LEAVE_MS) return { pose: "arrive" as const, label: "下班" };
  return { pose: "idle" as const, label: "不在" };
}

export function stillWorking(mark: { pose: Pose; label: string; updated_at?: number } | undefined, now: number, held = false) {
  if (!mark) return false;
  const view = shift(mark, now, held);
  return view.label === "做完" || view.label === "闲置" || view.label === "等人";
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

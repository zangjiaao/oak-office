import { useLayoutEffect, useRef, useState } from "react";
import type { ActorFrame, Point, Pose } from "./types";

const SPEED = 86;

export function approach(from: Point, to: Point, elapsed: number) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const duration = dist < 1 ? 0 : Math.max(420, (dist / SPEED) * 1000);
  const u = duration === 0 ? 1 : Math.min(1, elapsed / duration);
  const face: 1 | -1 = to.x === from.x ? 1 : to.x > from.x ? 1 : -1;
  return {
    x: from.x + (to.x - from.x) * u,
    y: from.y + (to.y - from.y) * u,
    face,
    walking: u < 1 && dist >= 1,
    done: u >= 1,
  };
}

export function useWalk(actors: ActorFrame[], enabled: boolean) {
  const settled = useRef<Record<string, Point>>({});
  const actorsRef = useRef(actors);
  const [offset, setOffset] = useState<Record<string, ReturnType<typeof approach>>>({});
  actorsRef.current = actors;
  const key = enabled
    ? actors
        .map((actor) => {
          const from = actor.walkFrom;
          const origin = from ? `${Math.round(from.x)},${Math.round(from.y)}` : "";
          return `${actor.id}:${Math.round(actor.x)}:${Math.round(actor.y)}:${origin}`;
        })
        .join("|")
    : "";

  useLayoutEffect(() => {
    if (!enabled) return;
    const current = actorsRef.current;
    const from: Record<string, Point> = {};
    let moving = false;
    for (const actor of current) {
      const start = actor.walkFrom ?? settled.current[actor.id] ?? { x: actor.x, y: actor.y };
      from[actor.id] = start;
      if (Math.hypot(actor.x - start.x, actor.y - start.y) >= 1) moving = true;
    }
    if (!moving) {
      for (const actor of current) settled.current[actor.id] = { x: actor.x, y: actor.y };
      return;
    }
    const paint = (elapsed: number) => {
      const next: Record<string, ReturnType<typeof approach>> = {};
      let still = false;
      for (const actor of current) {
        const frame = approach(from[actor.id], actor, elapsed);
        next[actor.id] = frame;
        if (frame.done) settled.current[actor.id] = { x: actor.x, y: actor.y };
        else still = true;
      }
      setOffset(next);
      return still;
    };
    paint(0);
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      if (paint(now - started)) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [enabled, key]);

  if (!enabled) return actors;
  return actors.map((actor) => {
    const frame = offset[actor.id];
    if (!frame || frame.done) return actor;
    const pose: Pose = frame.walking && actor.pose !== "report" && actor.pose !== "handoff" ? "arrive" : actor.pose;
    return { ...actor, x: frame.x, y: frame.y, face: frame.face, walking: frame.walking, pose };
  });
}

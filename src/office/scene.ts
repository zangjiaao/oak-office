import { PEOPLE, SPOTS } from "./roster";
import { SCRIPT } from "./script";
import type { ActorFrame, ChatLine, Pose } from "./types";

const SPEED = 86;

function travelMs(from: { x: number; y: number }, to: { x: number; y: number }) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.max(420, (dist / SPEED) * 1000);
}

export function linesAt(ms: number): ChatLine[] {
  return SCRIPT.flatMap((cue) =>
    cue.kind === "say" && cue.at <= ms
      ? [{ at: cue.at, who: cue.who, text: cue.text }]
      : [],
  );
}

export function actorsAt(ms: number): ActorFrame[] {
  return PEOPLE.map((person) => {
    const cues = SCRIPT.filter(
      (cue) => cue.kind === "go" && cue.id === person.id && cue.at <= ms,
    );
    let x = SPOTS[person.home].x;
    let y = SPOTS[person.home].y;
    let pose: Pose = "idle";
    let label = "闲置";
    let face: 1 | -1 = 1;
    let walking = false;

    if (person.id === "lin") {
      x = SPOTS.door.x;
      y = SPOTS.door.y;
      label = "在门外";
    }

    for (let i = 0; i < cues.length; i += 1) {
      const cue = cues[i];
      if (cue.kind !== "go") continue;
      const dest = SPOTS[cue.spot];
      const distance = Math.hypot(dest.x - x, dest.y - y);
      const duration = distance < 1 ? 0 : travelMs({ x, y }, dest);
      const nextAt = cues[i + 1]?.at ?? Number.POSITIVE_INFINITY;
      const end = Math.min(cue.at + duration, nextAt, ms);
      const u = duration === 0 ? 1 : Math.min(1, (end - cue.at) / duration);
      const arrived = duration === 0 || ms >= cue.at + duration;
      face = dest.x === x ? face : dest.x > x ? 1 : -1;
      x += (dest.x - x) * u;
      y += (dest.y - y) * u;
      if (!arrived && ms >= cue.at && ms < nextAt) {
        walking = true;
        pose = cue.pose === "handoff" || cue.pose === "report" ? cue.pose : "arrive";
        label = cue.label;
      } else {
        walking = false;
        pose = cue.pose;
        label = cue.label;
      }
    }

    return {
      id: person.id,
      name: person.name,
      look: person.look,
      pose,
      label,
      x,
      y,
      face,
      walking,
    };
  });
}

export function activePoses(ms: number) {
  return new Set(actorsAt(ms).map((actor) => actor.pose));
}

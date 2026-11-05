import { identityOf, lookOf, type PersonRow } from "../people/record";
import { SPOTS } from "./roster";
import type { ActorFrame, Look, Point } from "./types";

const SEATS: Point[] = [SPOTS.lin, SPOTS.chen, SPOTS.song, SPOTS.lead];

const STANDING: Point[] = [
  { x: 40, y: 108 },
  { x: 78, y: 108 },
  { x: 116, y: 108 },
  { x: 258, y: 108 },
  { x: 296, y: 108 },
  { x: 334, y: 108 },
];

export type DraftPreview = {
  kind: "create" | "edit";
  id?: string;
  name: string;
  look: Look;
};

export function seatPoint(index: number): Point {
  if (index < SEATS.length) return SEATS[index];
  const extra = index - SEATS.length;
  const spot = STANDING[extra % STANDING.length];
  const row = Math.floor(extra / STANDING.length);
  return { x: spot.x, y: spot.y + row * 16 };
}

export function rosterActors(
  people: PersonRow[],
  draft: DraftPreview | null,
  selectedId: string | null,
): ActorFrame[] {
  const actors = people.map((person, index) => {
    const editing = draft?.kind === "edit" && draft.id === person.id;
    const name = editing ? draft.name.trim() || person.name : person.name;
    const look = editing ? draft.look : lookOf(person);
    return actor(person.id, name, look, seatPoint(index), selectedId === person.id);
  });
  if (draft?.kind === "create") {
    actors.push(
      actor("draft", draft.name.trim() || "新人", draft.look, seatPoint(actors.length), true),
    );
  }
  return actors;
}

export function rosterNote(people: PersonRow[], draft: DraftPreview | null) {
  const count = people.length + (draft?.kind === "create" ? 1 : 0);
  if (count <= SEATS.length) return null;
  return "工位只有四张，后到的人站在后面。";
}

export function rosterLabel(person: PersonRow) {
  const identity = identityOf(person);
  return identity.generic ? "通用身份" : identity.brief;
}

function actor(id: string, name: string, look: Look, point: Point, selected: boolean): ActorFrame {
  return {
    id,
    name,
    look,
    pose: "idle",
    label: "闲置",
    x: point.x,
    y: point.y,
    face: point.x > 200 ? -1 : 1,
    walking: false,
    selected,
  };
}

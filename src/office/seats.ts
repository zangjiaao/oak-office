import { identityOf, lookOf, type PersonRow } from "../people/record";
import { SPOTS } from "./roster";
import type { ActorFrame, Look, Point } from "./types";

const STAFF_SEATS: Point[] = [SPOTS.lin, SPOTS.chen, SPOTS.song];

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
  isLead: boolean;
};

export function rosterActors(
  people: PersonRow[],
  draft: DraftPreview | null,
  selectedId: string | null,
): ActorFrame[] {
  const seated = layout(people, draft, selectedId);
  return seated.map((person) =>
    actor(person.id, person.name, person.look, person.point, person.selected, person.lead),
  );
}

export function rosterNote(people: PersonRow[], draft: DraftPreview | null) {
  const staff = layout(people, draft, null).filter((person) => !person.lead).length;
  if (staff <= STAFF_SEATS.length) return null;
  return "前排只有三张员工桌，多出来的人站在后面。";
}

export function rosterLabel(person: PersonRow) {
  const identity = identityOf(person);
  const role = person.is_lead === 1 ? "主管" : "员工";
  return `${role} · ${identity.generic ? "通用身份" : identity.brief}`;
}

function layout(people: PersonRow[], draft: DraftPreview | null, selectedId: string | null) {
  const rows = people.map((person) => {
    const editing = draft?.kind === "edit" && draft.id === person.id;
    return {
      id: person.id,
      name: editing ? draft.name.trim() || person.name : person.name,
      look: editing ? draft.look : lookOf(person),
      lead: shownAsLead(person, draft),
      selected: selectedId === person.id,
    };
  });
  if (draft?.kind === "create") {
    rows.push({
      id: "draft",
      name: draft.name.trim() || "新人",
      look: draft.look,
      lead: draft.isLead,
      selected: true,
    });
  }
  const leadIndex = rows.findIndex((person) => person.lead);
  const staff = rows.filter((_, index) => index !== leadIndex);
  const lead = leadIndex === -1 ? undefined : rows[leadIndex];
  const placed = staff.map((person, index) => ({ ...person, point: staffPoint(index) }));
  if (lead) placed.push({ ...lead, point: SPOTS.lead });
  return placed;
}

function shownAsLead(person: PersonRow, draft: DraftPreview | null) {
  if (draft?.kind === "edit" && draft.id === person.id) return draft.isLead;
  if (draft?.isLead) return false;
  return person.is_lead === 1;
}

function staffPoint(index: number): Point {
  if (index < STAFF_SEATS.length) return STAFF_SEATS[index];
  const extra = index - STAFF_SEATS.length;
  const spot = STANDING[extra % STANDING.length];
  const row = Math.floor(extra / STANDING.length);
  return { x: spot.x, y: spot.y + row * 16 };
}

function actor(
  id: string,
  name: string,
  look: Look,
  point: Point,
  selected: boolean,
  lead: boolean,
): ActorFrame {
  return {
    id,
    name,
    look,
    pose: "idle",
    label: lead ? "主管" : "闲置",
    x: point.x,
    y: point.y,
    face: point.x > 200 ? -1 : 1,
    walking: false,
    selected,
  };
}

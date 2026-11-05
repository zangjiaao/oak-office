import { canHire, identityOf, lookOf, staffFits, type PersonRow, type SeatChange } from "../people/record";
import { ROOM, SPOTS } from "./roster";
import type { ActorFrame, Look, Point } from "./types";

const COLS = [52, 148, 244, 340];
const ROW_Y = [188, 250];

export type DraftPreview = {
  kind: "create" | "edit";
  id?: string;
  name: string;
  look: Look;
  isLead: boolean;
};

export type DeskSpot = {
  x: number;
  y: number;
  lead: boolean;
  id?: string;
};

type Placed = {
  id: string;
  name: string;
  look: Look;
  lead: boolean;
  selected: boolean;
  point: Point;
};

export function rosterView(people: PersonRow[], draft: DraftPreview | null, selectedId: string | null) {
  const placed = layout(people, fittingDraft(people, draft), selectedId);
  const staff = placed.filter((person) => !person.lead).length;
  return {
    actors: placed.map((person) => actor(person)),
    desks: placed.map((person) => ({ x: person.point.x, y: person.point.y, lead: person.lead })),
    room: rosterRoom(staff),
  };
}

export function rosterNote(people: PersonRow[]) {
  return canHire(people) ? null : "工位已满。员工最多八个。";
}

export function rosterLabel(person: PersonRow) {
  const identity = identityOf(person);
  const role = person.is_lead === 1 ? "主管" : "员工";
  return `${role} · ${identity.generic ? "通用身份" : identity.brief}`;
}

function fittingDraft(people: PersonRow[], draft: DraftPreview | null): DraftPreview | null {
  if (!draft) return null;
  const change: SeatChange = { kind: draft.kind, id: draft.id, isLead: draft.isLead };
  if (staffFits(people, change)) return draft;
  if (draft.kind === "edit") {
    const current = people.find((person) => person.id === draft.id);
    return { ...draft, isLead: current?.is_lead === 1 };
  }
  return null;
}

function layout(people: PersonRow[], draft: DraftPreview | null, selectedId: string | null): Placed[] {
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
  const placed: Placed[] = staff.map((person, index) => ({ ...person, point: staffPoint(index) }));
  if (lead) placed.push({ ...lead, point: SPOTS.lead });
  return placed;
}

function shownAsLead(person: PersonRow, draft: DraftPreview | null) {
  if (draft?.kind === "edit" && draft.id === person.id) return draft.isLead;
  if (draft?.isLead) return false;
  return person.is_lead === 1;
}

function staffPoint(index: number): Point {
  const row = Math.min(Math.floor(index / COLS.length), ROW_Y.length - 1);
  return { x: COLS[index % COLS.length], y: ROW_Y[row] };
}

function rosterRoom(staff: number) {
  const rows = staff === 0 ? 1 : Math.ceil(staff / COLS.length);
  if (rows <= 1) return { w: ROOM.w, h: ROOM.h };
  return { w: ROOM.w, h: ROW_Y[1] + (ROOM.h - ROW_Y[0]) };
}

function actor(person: Placed): ActorFrame {
  return {
    id: person.id,
    name: person.name,
    look: person.look,
    pose: "idle",
    label: person.lead ? "主管" : "闲置",
    x: person.point.x,
    y: person.point.y,
    face: person.point.x > 200 ? -1 : 1,
    walking: false,
    selected: person.selected,
  };
}

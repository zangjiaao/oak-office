import { STAFF_LIMIT, canHire, identityOf, lookOf, openSeat, staffFits, type PersonRow, type SeatChange } from "../people/record";
import { ROOM, SPOTS } from "./roster";
import type { ActorFrame, Look, Point, Pose } from "./types";

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

export function rosterView(
  people: PersonRow[],
  draft: DraftPreview | null,
  selectedId: string | null,
  floor?: Record<string, { pose: Pose; label: string }>,
  present = false,
) {
  return {
    actors: layout(people, fittingDraft(people, draft), selectedId, present ? floor ?? {} : null).map((person) =>
      actor(person, floor?.[person.id]),
    ),
    desks: fixedDesks(),
    room: { w: ROOM.w, h: ROW_Y[1] + (ROOM.h - ROW_Y[0]) },
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

function layout(
  people: PersonRow[],
  draft: DraftPreview | null,
  selectedId: string | null,
  room: Record<string, { pose: Pose; label: string }> | null,
): Placed[] {
  const placed: Placed[] = [];
  const draftId = draft?.kind === "edit" ? draft.id : undefined;

  for (const person of people) {
    const editing = Boolean(draft?.kind === "edit" && draft.id === person.id);
    const name = editing && draft ? draft.name.trim() || person.name : person.name;
    const look = editing && draft ? draft.look : lookOf(person);
    if (room && person.is_lead !== 1 && !room[person.id] && !(editing && draft?.isLead)) continue;
    if (editing && draft) {
      const point = draft.isLead ? SPOTS.lead : staffSpot(keptSeat(people, person, draft.isLead));
      if (!point) continue;
      placed.push({ id: person.id, name, look, lead: draft.isLead, selected: true, point });
      continue;
    }
    if (draft?.isLead && person.is_lead === 1) {
      const seat = openSeat(people, [person.id, ...(draftId ? [draftId] : [])]);
      if (seat === null) continue;
      placed.push({
        id: person.id,
        name,
        look,
        lead: false,
        selected: selectedId === person.id,
        point: staffPoint(seat),
      });
      continue;
    }
    if (person.is_lead === 1) {
      placed.push({ id: person.id, name, look, lead: true, selected: selectedId === person.id, point: SPOTS.lead });
      continue;
    }
    if (person.seat === null) continue;
    placed.push({
      id: person.id,
      name,
      look,
      lead: false,
      selected: selectedId === person.id,
      point: staffPoint(person.seat),
    });
  }

  if (draft?.kind === "create" && !(room && !draft.isLead)) {
    const seat = draft.isLead ? null : openSeat(people);
    const point = draft.isLead ? SPOTS.lead : seat === null ? null : staffPoint(seat);
    if (point) {
      placed.push({
        id: "draft",
        name: draft.name.trim() || "新人",
        look: draft.look,
        lead: draft.isLead,
        selected: true,
        point,
      });
    }
  }
  return placed;
}

function keptSeat(people: PersonRow[], person: PersonRow, isLead: boolean) {
  if (isLead) return null;
  if (person.is_lead === 0 && person.seat !== null) return person.seat;
  return openSeat(people, [person.id]);
}

function staffSpot(seat: number | null) {
  return seat === null ? null : staffPoint(seat);
}

function fixedDesks(): DeskSpot[] {
  const desks: DeskSpot[] = [];
  for (let seat = 0; seat < STAFF_LIMIT; seat += 1) {
    const point = staffPoint(seat);
    desks.push({ x: point.x, y: point.y, lead: false });
  }
  desks.push({ x: SPOTS.lead.x, y: SPOTS.lead.y, lead: true });
  return desks;
}

function staffPoint(seat: number): Point {
  return { x: COLS[seat % COLS.length], y: ROW_Y[Math.floor(seat / COLS.length)] };
}

function actor(person: Placed, mark?: { pose: Pose; label: string }): ActorFrame {
  const entering = mark?.pose === "arrive" && mark.label === "进来了" && !person.lead;
  const reporting = mark?.pose === "report" && !person.lead;
  const point = reporting ? { x: person.point.x < SPOTS.lead.x ? 168 : 232, y: 168 } : person.point;
  return {
    id: person.id,
    name: person.name,
    look: person.look,
    pose: mark?.pose ?? "idle",
    label: mark?.label ?? (person.lead ? "主管" : "闲置"),
    x: point.x,
    y: point.y,
    face: point.x > SPOTS.lead.x ? -1 : 1,
    walking: false,
    walkFrom: entering ? { x: SPOTS.door.x, y: SPOTS.door.y } : undefined,
    selected: person.selected,
  };
}

import { staffFull } from "../src/people/department";
import {
  openSeat,
  parseDraft,
  staffFits,
  type PersonDraft,
  type PersonRow,
} from "../src/people/record";
import type { D1Database } from "./env";
import { listNotes } from "./memory";

const COLUMNS =
  "id, name, gender, hair, skin, shirt, pants, hair_style, brief, dossier, is_lead, model, thinking, seat, created_at, updated_at, department_id";

export class RosterDbError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function listPeople(db: D1Database, departmentId: string): Promise<PersonRow[]> {
  try {
    const { results } = await db
      .prepare(`SELECT ${COLUMNS} FROM people WHERE department_id = ? ORDER BY created_at ASC, id ASC`)
      .bind(departmentId)
      .all<PersonRow>();
    const notes = await listNotes(db);
    return results.map((person) => ({
      ...person,
      memories: notes
        .filter((note) => note.person_id === person.id)
        .map(({ id, text, created_at }) => ({ id, text, created_at })),
    }));
  } catch (error) {
    throw stored(error);
  }
}

export type PersonWrite =
  | { ok: true; person: PersonRow }
  | { ok: false; error: string; status: number };

export async function hirePerson(
  db: D1Database,
  draft: PersonDraft,
  departmentId: string,
): Promise<PersonWrite> {
  const now = Date.now();
  try {
    const floor = await db
      .prepare("SELECT seats FROM department WHERE id = ?")
      .bind(departmentId)
      .first<{ seats: number }>();
    if (!floor) return { ok: false, error: "没有这一层。", status: 404 };
    const people = await listPeople(db, departmentId);
    const full = staffFull(floor.seats);
    if (!staffFits(people, { kind: "create", isLead: draft.is_lead === 1 }, floor.seats)) {
      return { ok: false, error: full, status: 400 };
    }
    const seat = draft.is_lead === 1 ? null : openSeat(people, [], floor.seats);
    if (draft.is_lead === 0 && seat === null) return { ok: false, error: full, status: 400 };
    const row: PersonRow = {
      id: crypto.randomUUID(),
      ...draft,
      seat,
      created_at: now,
      updated_at: now,
      department_id: departmentId,
    };
    const moved = movePreviousLead(db, people, row, floor.seats);
    if (!moved) return { ok: false, error: full, status: 400 };
    await db.batch([
      ...moved,
      db
        .prepare(
          `INSERT INTO people (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          row.id,
          row.name,
          row.gender,
          row.hair,
          row.skin,
          row.shirt,
          row.pants,
          row.hair_style,
          row.brief,
          row.dossier,
          row.is_lead,
          row.model,
          row.thinking,
          row.seat,
          row.created_at,
          row.updated_at,
          row.department_id,
        ),
    ]);
    return { ok: true, person: row };
  } catch (error) {
    const refusal = refusalFrom(error);
    if (refusal) return refusal;
    throw error;
  }
}

export async function updatePerson(
  db: D1Database,
  id: string,
  draft: PersonDraft,
): Promise<PersonWrite | null> {
  try {
    const existing = await db
      .prepare("SELECT created_at, is_lead, seat, department_id FROM people WHERE id = ?")
      .bind(id)
      .first<{ created_at: number; is_lead: 0 | 1; seat: number | null; department_id: string }>();
    if (!existing) return null;
    const floor = await db
      .prepare("SELECT seats FROM department WHERE id = ?")
      .bind(existing.department_id)
      .first<{ seats: number }>();
    if (!floor) return { ok: false, error: "没有这一层。", status: 404 };
    const people = await listPeople(db, existing.department_id);
    const full = staffFull(floor.seats);
    if (!staffFits(people, { kind: "edit", id, isLead: draft.is_lead === 1 }, floor.seats)) {
      return { ok: false, error: full, status: 400 };
    }
    const seat =
      draft.is_lead === 1
        ? null
        : existing.is_lead === 0 && existing.seat !== null
          ? existing.seat
          : openSeat(people, [id], floor.seats);
    if (draft.is_lead === 0 && seat === null) return { ok: false, error: full, status: 400 };
    const updated_at = Date.now();
    const row: PersonRow = {
      id,
      ...draft,
      seat,
      created_at: existing.created_at,
      updated_at,
      department_id: existing.department_id,
    };
    const moved = movePreviousLead(db, people, row, floor.seats);
    if (!moved) return { ok: false, error: full, status: 400 };
    const writes = [];
    if (draft.is_lead === 1 && existing.is_lead === 0) {
      writes.push(db.prepare("UPDATE people SET seat = NULL, updated_at = ? WHERE id = ?").bind(updated_at, id));
    }
    writes.push(...moved);
    writes.push(
      db
        .prepare(
          `UPDATE people
           SET name = ?, gender = ?, hair = ?, skin = ?, shirt = ?, pants = ?, hair_style = ?,
               brief = ?, dossier = ?, is_lead = ?, model = ?, thinking = ?, seat = ?, updated_at = ?
           WHERE id = ?`,
        )
        .bind(
          row.name,
          row.gender,
          row.hair,
          row.skin,
          row.shirt,
          row.pants,
          row.hair_style,
          row.brief,
          row.dossier,
          row.is_lead,
          row.model,
          row.thinking,
          row.seat,
          row.updated_at,
          row.id,
        ),
    );
    await db.batch(writes);
    return { ok: true, person: row };
  } catch (error) {
    const refusal = refusalFrom(error);
    if (refusal) return refusal;
    throw error;
  }
}

export async function dismissPerson(
  db: D1Database,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number } | null> {
  try {
    const existing = await db.prepare("SELECT id FROM people WHERE id = ?").bind(id).first<{ id: string }>();
    if (!existing) return null;
    await db.batch([
      db.prepare("DELETE FROM duty WHERE person_id = ?").bind(id),
      db.prepare("DELETE FROM person_memory WHERE person_id = ?").bind(id),
      db.prepare("DELETE FROM work_desk WHERE person_id = ?").bind(id),
      db.prepare("DELETE FROM people WHERE id = ?").bind(id),
    ]);
    return { ok: true };
  } catch (error) {
    const refusal = refusalFrom(error);
    if (refusal) return refusal;
    throw error;
  }
}

export function readDraft(input: unknown) {
  return parseDraft(input);
}

function movePreviousLead(db: D1Database, people: PersonRow[], row: PersonRow, seats: number) {
  if (row.is_lead !== 1) return [];
  const previous = people.find((person) => person.is_lead === 1 && person.id !== row.id);
  if (!previous) return [];
  const seat = openSeat(people, [row.id, previous.id], seats);
  if (seat === null) return null;
  return [
    db
      .prepare("UPDATE people SET is_lead = 0, seat = ?, updated_at = ? WHERE id = ?")
      .bind(seat, row.updated_at, previous.id),
  ];
}

function refusalFrom(error: unknown): { ok: false; error: string; status: number } | null {
  const wrapped = error instanceof RosterDbError ? error : stored(error);
  if (!(wrapped instanceof RosterDbError)) return null;
  return { ok: false, error: wrapped.message, status: wrapped.status };
}

function stored(error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("no such table") || message.includes("no such column")) {
    return new RosterDbError("本地库还没跟上。", 503);
  }
  if (message.includes("CHECK constraint") || message.includes("UNIQUE constraint")) {
    return new RosterDbError("这份档案写不进去。", 400);
  }
  return error;
}

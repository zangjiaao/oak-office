import {
  parseDraft,
  type PersonDraft,
  type PersonRow,
} from "../src/people/record";
import type { D1Database } from "./env";

const COLUMNS =
  "id, name, gender, hair, skin, shirt, pants, hair_style, brief, dossier, is_lead, created_at, updated_at";

export class RosterDbError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function listPeople(db: D1Database): Promise<PersonRow[]> {
  try {
    const { results } = await db
      .prepare(`SELECT ${COLUMNS} FROM people ORDER BY created_at ASC, id ASC`)
      .all<PersonRow>();
    return results;
  } catch (error) {
    throw stored(error);
  }
}

export async function hirePerson(db: D1Database, draft: PersonDraft): Promise<PersonRow> {
  const now = Date.now();
  const row: PersonRow = { id: crypto.randomUUID(), ...draft, created_at: now, updated_at: now };
  try {
    await db.batch([
      ...leadRelease(db, row),
      db
        .prepare(
          `INSERT INTO people (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          row.created_at,
          row.updated_at,
        ),
    ]);
  } catch (error) {
    throw stored(error);
  }
  return row;
}

export async function updatePerson(
  db: D1Database,
  id: string,
  draft: PersonDraft,
): Promise<PersonRow | null> {
  try {
    const existing = await db
      .prepare("SELECT created_at FROM people WHERE id = ?")
      .bind(id)
      .first<{ created_at: number }>();
    if (!existing) return null;
    const updated_at = Date.now();
    const row: PersonRow = { id, ...draft, created_at: existing.created_at, updated_at };
    await db.batch([
      ...leadRelease(db, row),
      db
        .prepare(
          `UPDATE people
           SET name = ?, gender = ?, hair = ?, skin = ?, shirt = ?, pants = ?, hair_style = ?,
               brief = ?, dossier = ?, is_lead = ?, updated_at = ?
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
          row.updated_at,
          row.id,
        ),
    ]);
    return row;
  } catch (error) {
    throw stored(error);
  }
}

export function readDraft(input: unknown) {
  return parseDraft(input);
}

function leadRelease(db: D1Database, row: PersonRow) {
  if (row.is_lead !== 1) return [];
  return [
    db
      .prepare("UPDATE people SET is_lead = 0, updated_at = ? WHERE is_lead = 1 AND id != ?")
      .bind(row.updated_at, row.id),
  ];
}

function stored(error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("no such table") || message.includes("no such column")) {
    return new RosterDbError("本地库还没有主管这一栏。", 503);
  }
  if (message.includes("CHECK constraint") || message.includes("UNIQUE constraint")) {
    return new RosterDbError("这份档案写不进去。", 400);
  }
  return error;
}

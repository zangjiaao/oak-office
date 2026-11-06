import type { MemoryNote } from "../src/people/record";
import type { D1Database } from "./env";

export const NOTE_MAX = 200;
export const NOTES_KEPT = 20;
export const NOTES_IN_PROMPT = 8;

type StoredNote = MemoryNote & { person_id: string };

export function jobMemory(task: string, result: string) {
  return clip(`做了：${clip(task, 80)}。结果：${clip(result, 80)}`, NOTE_MAX);
}

export function promptMemory(notes: MemoryNote[] | undefined) {
  const recent = (notes ?? []).slice(-NOTES_IN_PROMPT);
  if (!recent.length) return "";
  return `记得这些：\n${recent.map((note) => `- ${note.text}`).join("\n")}`;
}

export async function listNotes(db: D1Database): Promise<StoredNote[]> {
  const { results } = await db
    .prepare("SELECT id, person_id, text, created_at FROM person_memory ORDER BY created_at ASC, id ASC")
    .all<StoredNote>();
  return results;
}

export async function recentNotes(db: D1Database, personId: string, limit = NOTES_IN_PROMPT) {
  const { results } = await db
    .prepare(
      `SELECT id, text, created_at FROM person_memory WHERE person_id = ? ORDER BY created_at DESC, id DESC LIMIT ${limit}`,
    )
    .bind(personId)
    .all<MemoryNote>();
  return results.reverse();
}

export async function remember(db: D1Database, personId: string, raw: string): Promise<MemoryNote | null> {
  const text = clip(raw, NOTE_MAX);
  if (!text) return null;
  const latest = await db
    .prepare(
      "SELECT id, text, created_at FROM person_memory WHERE person_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    )
    .bind(personId)
    .first<MemoryNote>();
  if (latest?.text === text) return latest;
  const note: MemoryNote = {
    id: crypto.randomUUID(),
    text,
    created_at: Math.max(Date.now(), (latest?.created_at ?? 0) + 1),
  };
  await db.batch([
    db
      .prepare("INSERT INTO person_memory (id, person_id, text, created_at) VALUES (?, ?, ?, ?)")
      .bind(note.id, personId, note.text, note.created_at),
    db
      .prepare(
        `DELETE FROM person_memory WHERE person_id = ? AND id NOT IN (
           SELECT id FROM person_memory WHERE person_id = ? ORDER BY created_at DESC, id DESC LIMIT ${NOTES_KEPT}
         )`,
      )
      .bind(personId, personId),
  ]);
  return note;
}

export async function forget(db: D1Database, personId: string, noteId: string): Promise<boolean | null> {
  const person = await db.prepare("SELECT id FROM people WHERE id = ?").bind(personId).first<{ id: string }>();
  if (!person) return null;
  const note = await db
    .prepare("SELECT id FROM person_memory WHERE id = ? AND person_id = ?")
    .bind(noteId, personId)
    .first<{ id: string }>();
  if (!note) return false;
  await db.prepare("DELETE FROM person_memory WHERE id = ? AND person_id = ?").bind(noteId, personId).run();
  return true;
}

function clip(value: string, max: number) {
  const text = value.trim().replace(/\s+/g, " ");
  if (!text) return "";
  return [...text].slice(0, max).join("");
}

import { listColleagues } from "./colleague";
import type { Env } from "./env";

export const WATER_MINUTES = [1, 30, 45, 60, 90, 120] as const;

/** One shared reminder for the unsigned voice the chat already calls 你. */
export const WATER_YOU = "you";

export type WaterReminder = {
  everyMinutes: number;
  nextAt: number;
  departmentId: string;
};

type Stored = {
  email: string;
  department_id: string;
  every_ms: number;
  next_at: number;
};

function changed(result: unknown) {
  if (!result || typeof result !== "object" || !("meta" in result)) return false;
  const meta = (result as { meta?: { changes?: number } }).meta;
  return (meta?.changes ?? 0) > 0;
}

export function waterEveryMs(minutes: number) {
  return (WATER_MINUTES as readonly number[]).includes(minutes) ? minutes * 60_000 : null;
}

export async function readWater(db: Env["DB"], email: string): Promise<WaterReminder | null> {
  const row = await db
    .prepare("SELECT every_ms, next_at, department_id FROM water_reminder WHERE email = ?")
    .bind(email)
    .first<{ every_ms: number; next_at: number; department_id: string }>();
  if (!row) return null;
  return { everyMinutes: Math.round(row.every_ms / 60_000), nextAt: row.next_at, departmentId: row.department_id };
}

export async function saveWater(db: Env["DB"], email: string, departmentId: string, minutes: number) {
  const every = waterEveryMs(minutes);
  if (!every) return { ok: false as const, error: "间隔用 1、30、45、60、90 或 120 分钟。", status: 400 };
  const floor = await db.prepare("SELECT id FROM department WHERE id = ?").bind(departmentId).first<{ id: string }>();
  if (!floor) return { ok: false as const, error: "没有这一层。", status: 404 };
  const now = Date.now();
  const nextAt = now + every;
  await db
    .prepare(
      `INSERT INTO water_reminder (email, department_id, every_ms, next_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET
         department_id = excluded.department_id,
         every_ms = excluded.every_ms,
         next_at = excluded.next_at,
         updated_at = excluded.updated_at`,
    )
    .bind(email, departmentId, every, nextAt, now)
    .run();
  return { ok: true as const, reminder: { everyMinutes: minutes, nextAt, departmentId } satisfies WaterReminder };
}

export async function clearWater(db: Env["DB"], email: string) {
  const result = await db.prepare("DELETE FROM water_reminder WHERE email = ?").bind(email).run();
  return changed(result);
}

/** Post one drink line per person who is due, then wait a full interval. A late tick does not pile up. */
export async function pourWater(env: Env, departmentId?: string) {
  const now = Date.now();
  const due = departmentId
    ? await env.DB.prepare(
        "SELECT email, department_id, every_ms, next_at FROM water_reminder WHERE department_id = ? AND next_at <= ? ORDER BY next_at ASC LIMIT 20",
      )
        .bind(departmentId, now)
        .all<Stored>()
    : await env.DB.prepare(
        "SELECT email, department_id, every_ms, next_at FROM water_reminder WHERE next_at <= ? ORDER BY next_at ASC LIMIT 20",
      )
        .bind(now)
        .all<Stored>();
  const named = new Map((await listColleagues(env.DB)).map((row) => [row.email, row.name]));
  let poured = 0;
  for (const row of due.results) {
    const floor = await env.DB.prepare("SELECT id FROM department WHERE id = ?").bind(row.department_id).first<{ id: string }>();
    if (!floor) {
      await env.DB.prepare("DELETE FROM water_reminder WHERE email = ?").bind(row.email).run();
      continue;
    }
    const advanced = await env.DB.prepare("UPDATE water_reminder SET next_at = ? WHERE email = ? AND next_at = ?")
      .bind(now + row.every_ms, row.email, row.next_at)
      .run();
    if (!changed(advanced)) continue;
    const shared = row.email === WATER_YOU;
    const name = shared ? undefined : named.get(row.email);
    await env.DB.prepare(
      "INSERT INTO work_line (id, role, person_id, text, raw, created_at, department_id, author_email) VALUES (?, 'water', NULL, ?, NULL, ?, ?, ?)",
    )
      .bind(crypto.randomUUID(), name ? `${name}，喝水。` : "喝水。", now, row.department_id, shared ? null : row.email)
      .run();
    poured += 1;
  }
  return { poured };
}

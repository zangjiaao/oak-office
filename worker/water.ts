import type { Env } from "./env";

export const WATER_MINUTES = [1, 30, 45, 60, 90, 120] as const;

/** One shared reminder for the unsigned voice the chat already calls 你. */
export const WATER_YOU = "you";

export type WaterReminder = {
  everyMinutes: number;
  nextAt: number;
  departmentId: string;
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

/** Empty the full cup and wait another full interval. Until then the cup stays full. */
export async function drinkWater(db: Env["DB"], email: string) {
  const row = await db
    .prepare("SELECT every_ms, next_at, department_id FROM water_reminder WHERE email = ?")
    .bind(email)
    .first<{ every_ms: number; next_at: number; department_id: string }>();
  if (!row) return { ok: false as const, error: "还没有提醒。", status: 404 };
  const now = Date.now();
  if (row.next_at > now) return { ok: false as const, error: "杯子还没满。", status: 400 };
  const nextAt = now + row.every_ms;
  const advanced = await db
    .prepare("UPDATE water_reminder SET next_at = ? WHERE email = ? AND next_at = ?")
    .bind(nextAt, email, row.next_at)
    .run();
  if (!changed(advanced)) return { ok: false as const, error: "已经喝过了。", status: 409 };
  return {
    ok: true as const,
    reminder: { everyMinutes: Math.round(row.every_ms / 60_000), nextAt, departmentId: row.department_id } satisfies WaterReminder,
  };
}

import type { D1Database } from "./env";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LIMIT = 40;

export type Colleague = { email: string; name: string };

export function callerEmail(request: Request) {
  return readEmail(request.headers.get("Cf-Access-Authenticated-User-Email"));
}

export function readEmail(value: unknown) {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) return null;
  return email;
}

export function readColleagueName(value: unknown) {
  if (typeof value !== "string") return null;
  const name = value.trim().replace(/\s+/g, " ");
  if ([...name].length < 1 || [...name].length > 16) return null;
  return name;
}

export async function listColleagues(db: D1Database) {
  const { results } = await db
    .prepare("SELECT email, name FROM colleague ORDER BY name COLLATE NOCASE, email")
    .all<Colleague>();
  return results;
}

export function colleagueNames(rows: Colleague[]) {
  return new Map(rows.map((row) => [row.email, row.name]));
}

export async function saveColleague(db: D1Database, email: string, name: string) {
  const now = Date.now();
  const existing = await db.prepare("SELECT email FROM colleague WHERE email = ?").bind(email).first<{ email: string }>();
  if (!existing) {
    const count = await db.prepare("SELECT COUNT(*) AS n FROM colleague").first<{ n: number }>();
    if (Number(count?.n ?? 0) >= LIMIT) return { ok: false as const, error: "同事已经够多了。", status: 400 };
  }
  await db
    .prepare(
      `INSERT INTO colleague (email, name, created_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at`,
    )
    .bind(email, name, now, now)
    .run();
  return { ok: true as const, colleague: { email, name } };
}

export async function removeColleague(db: D1Database, email: string) {
  const existing = await db.prepare("SELECT email FROM colleague WHERE email = ?").bind(email).first<{ email: string }>();
  if (!existing) return false;
  await db.prepare("DELETE FROM colleague WHERE email = ?").bind(email).run();
  return true;
}

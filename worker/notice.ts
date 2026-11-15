import { NOTICES } from "../src/office/notices";
import type { Env } from "./env";

/** The unsigned local voice the chat already calls 你. Online, each Access email is separate. */
export const NOTICE_YOU = "you";

export async function readNotices(db: Env["DB"], email: string) {
  const latest = NOTICES[0];
  if (!latest) return { notices: NOTICES, unseen: false };
  const row = await db
    .prepare("SELECT notice_id FROM notice_seen WHERE email = ?")
    .bind(email)
    .first<{ notice_id: string }>();
  return { notices: NOTICES, unseen: row?.notice_id !== latest.id };
}

export async function seeNotices(db: Env["DB"], email: string) {
  const latest = NOTICES[0];
  if (!latest) return;
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO notice_seen (email, notice_id, seen_at) VALUES (?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET notice_id = excluded.notice_id, seen_at = excluded.seen_at`,
    )
    .bind(email, latest.id, now)
    .run();
}

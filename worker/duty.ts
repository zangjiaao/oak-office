import { obj, str, type Static } from "@earendil-works/pi-schema";
import { DUTY_MAX_MINUTES, DUTY_MIN_MINUTES, everyLabel, type Duty } from "../src/work/duty";
import type { Env } from "./env";

const DUTY_LIMIT = 8;
const TASK_MAX = 500;

const ScheduleArgs = obj({
  person_id: str(),
  task: str(),
  every_minutes: str(),
});

const CancelArgs = obj({
  duty_id: str(),
});

type StoredDuty = Duty & { created_at: number };

export async function listDuties(db: Env["DB"]) {
  const { results } = await db
    .prepare("SELECT id, person_id, task, every_ms, next_at, created_at FROM duty ORDER BY next_at ASC, id ASC")
    .all<StoredDuty>();
  return results;
}

export function scheduleTool(env: Env) {
  return {
    name: "schedule",
    label: "定时",
    description:
      "安排一件周期工作。person_id 是主管自己或员工的 id。task 是到点要做的事。every_minutes 是间隔分钟，最少 5，最多 10080。第一次在大约半分钟后。",
    parameters: ScheduleArgs,
    executionMode: "sequential" as const,
    execute: async (_id: string, args: Static<typeof ScheduleArgs>) => {
      const every = Number(args.every_minutes.trim());
      if (!Number.isInteger(every) || every < DUTY_MIN_MINUTES || every > DUTY_MAX_MINUTES) {
        return miss(`间隔用分钟，最少 ${DUTY_MIN_MINUTES}，最多 ${DUTY_MAX_MINUTES}。`);
      }
      const task = args.task.trim().replace(/\s+/g, " ");
      if (!task) return miss("定时要写清做什么。");
      if ([...task].length > TASK_MAX) return miss("这件事太长。");
      const person = await env.DB.prepare("SELECT id, name FROM people WHERE id = ?")
        .bind(args.person_id)
        .first<{ id: string; name: string }>();
      if (!person) return miss("没有这个员工。");
      const existing = await listDuties(env.DB);
      if (existing.length >= DUTY_LIMIT) return miss("定时已经够多了。先取消一个。");
      const now = Date.now();
      const duty: StoredDuty = {
        id: crypto.randomUUID(),
        person_id: person.id,
        task: [...task].slice(0, TASK_MAX).join(""),
        every_ms: every * 60_000,
        next_at: now,
        created_at: now,
      };
      await env.DB.prepare(
        "INSERT INTO duty (id, person_id, task, every_ms, next_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(duty.id, duty.person_id, duty.task, duty.every_ms, duty.next_at, duty.created_at)
        .run();
      return text(`已排上。${person.name}${everyLabel(duty.every_ms)}做一次：${duty.task}。编号 ${duty.id}。`);
    },
  };
}

export function unscheduleTool(env: Env) {
  return {
    name: "unschedule",
    label: "取消定时",
    description: "取消一件周期工作。duty_id 来自定时列表。",
    parameters: CancelArgs,
    executionMode: "sequential" as const,
    execute: async (_id: string, args: Static<typeof CancelArgs>) => {
      const removed = await cancelDuty(env.DB, args.duty_id);
      if (!removed) return miss("没有这个定时。");
      return text("已经取消。");
    },
  };
}

export async function cancelDuty(db: Env["DB"], id: string) {
  const existing = await db.prepare("SELECT id FROM duty WHERE id = ?").bind(id).first<{ id: string }>();
  if (!existing) return false;
  await db.prepare("DELETE FROM duty WHERE id = ?").bind(id).run();
  return true;
}

export async function runDue(env: Env): Promise<{ ran: number }> {
  if (ticking) return { ran: 0 };
  ticking = true;
  try {
    const { speak, officeBusy } = await import("./work");
    if (officeBusy()) return { ran: 0 };
    const now = Date.now();
    const due = await env.DB.prepare(
      "SELECT id, person_id, task, every_ms, next_at, created_at FROM duty WHERE next_at <= ? ORDER BY next_at ASC, id ASC LIMIT 1",
    )
      .bind(now)
      .first<StoredDuty>();
    if (!due) return { ran: 0 };
    const claimed = (await env.DB.prepare("UPDATE duty SET next_at = ? WHERE id = ? AND next_at = ?")
      .bind(now + due.every_ms, due.id, due.next_at)
      .run()) as { meta?: { changes?: number } };
    if (claimed.meta?.changes === 0) return { ran: 0 };
    const person = await env.DB.prepare("SELECT id, name, is_lead FROM people WHERE id = ?")
      .bind(due.person_id)
      .first<{ id: string; name: string; is_lead: 0 | 1 }>();
    if (!person) {
      await cancelDuty(env.DB, due.id);
      return { ran: 0 };
    }
    const lead = await env.DB.prepare("SELECT id, name FROM people WHERE is_lead = 1").first<{ id: string; name: string }>();
    if (!lead) return { ran: 0 };
    const text =
      person.id === lead.id
        ? `到点了。请你自己完成这件事，不要派给员工，也不要新建或取消定时：${due.task}`
        : `到点了。请派 ${person.name}（${person.id}）完成这件事，不要新建或取消定时：${due.task}`;
    const result = await speak(env, text, undefined, "clock");
    return { ran: result.ok ? 1 : 0 };
  } finally {
    ticking = false;
  }
}

let ticking = false;

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {} };
}

function miss(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {}, isError: true };
}

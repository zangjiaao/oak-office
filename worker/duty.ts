import { obj, opt, str, type Static } from "@earendil-works/pi-schema";
import {
  DUTY_DAY_MS,
  DUTY_MAX_MINUTES,
  DUTY_MIN_MINUTES,
  clockLabel,
  clockStamp,
  everyLabel,
  nextDailyAt,
  nextDueAt,
  parseClock,
  reviseTarget,
  type Duty,
} from "../src/work/duty";
import { disarmCrew } from "./crew";
import type { Env } from "./env";

const DUTY_LIMIT = 8;
const TASK_MAX = 500;

const ScheduleArgs = obj({
  person_id: str(),
  task: str(),
  every_minutes: opt(str()),
  at: opt(str()),
});

const CancelArgs = obj({
  duty_id: str(),
});

type StoredDuty = Duty & { created_at: number };

export async function listDuties(db: Env["DB"], departmentId?: string) {
  const scoped = departmentId
    ? await db
        .prepare(
          `SELECT duty.id, duty.person_id, duty.task, duty.every_ms, duty.at_minutes, duty.next_at, duty.created_at
           FROM duty JOIN people ON people.id = duty.person_id
           WHERE people.department_id = ?
           ORDER BY duty.next_at ASC, duty.id ASC`,
        )
        .bind(departmentId)
        .all<StoredDuty>()
    : await db
        .prepare("SELECT id, person_id, task, every_ms, at_minutes, next_at, created_at FROM duty ORDER BY next_at ASC, id ASC")
        .all<StoredDuty>();
  return scoped.results;
}

export function scheduleTool(env: Env, departmentId: string) {
  return {
    name: "schedule",
    label: "定时",
    description:
      `安排或修改一件周期工作。person_id 是主管自己或员工的 id。task 必须写清到点要完成的全部内容，因为到点会单独开一轮、不带着当前聊天。每天固定钟点用 at，写成 09:00，按北京时间，不要同时填 every_minutes。间隔才填 every_minutes，单位分钟，最少 ${DUTY_MIN_MINUTES}，最多 ${DUTY_MAX_MINUTES}。这个人只有一条定时、或任务文字相同，就是改原来那条。钟点任务等到下一个该钟点。间隔任务第一次在大约半分钟后。到点由本人直接做。`,
    parameters: ScheduleArgs,
    executionMode: "sequential" as const,
    execute: async (_id: string, args: Static<typeof ScheduleArgs>) => {
      const everyRaw = args.every_minutes?.trim() ?? "";
      const atRaw = args.at?.trim() ?? "";
      if (everyRaw && atRaw) return miss("钟点和间隔只写一个。");
      if (!everyRaw && !atRaw) return miss("要写间隔分钟，或每天的钟点，例如 09:00。");
      const atMinutes = atRaw ? parseClock(atRaw) : null;
      if (atRaw && atMinutes === null) return miss("钟点写成 09:00，按北京时间。");
      const every = everyRaw ? Number(everyRaw) : null;
      if (every !== null && (!Number.isInteger(every) || every < DUTY_MIN_MINUTES || every > DUTY_MAX_MINUTES)) {
        return miss(`间隔用分钟，最少 ${DUTY_MIN_MINUTES}，最多 ${DUTY_MAX_MINUTES}。`);
      }
      const task = args.task.trim().replace(/\s+/g, " ");
      if (!task) return miss("定时要写清做什么。");
      if ([...task].length > TASK_MAX) return miss("这件事太长。");
      const person = await env.DB.prepare("SELECT id, name, department_id FROM people WHERE id = ?")
        .bind(args.person_id)
        .first<{ id: string; name: string; department_id: string }>();
      if (!person || person.department_id !== departmentId) return miss("没有这个员工。");
      const existing = await listDuties(env.DB, departmentId);
      const now = Date.now();
      const taskText = [...task].slice(0, TASK_MAX).join("");
      const prior = reviseTarget(
        existing.filter((duty) => duty.person_id === person.id),
        taskText,
      );
      const slot = clockSlot(now, atMinutes, every);
      if (prior) {
        await env.DB.prepare("UPDATE duty SET task = ?, every_ms = ?, at_minutes = ?, next_at = ? WHERE id = ?")
          .bind(taskText, slot.everyMs, slot.atMinutes, slot.nextAt, prior.id)
          .run();
        disarmCrew(person.id);
        return text(`已改成。${person.name}${slot.label}做一次：${taskText}。${slot.when}编号 ${prior.id}。`);
      }
      if (existing.length >= DUTY_LIMIT) return miss("定时已经够多了。先取消一个。");
      const duty: StoredDuty = {
        id: crypto.randomUUID(),
        person_id: person.id,
        task: taskText,
        every_ms: slot.everyMs,
        at_minutes: slot.atMinutes,
        next_at: slot.nextAt,
        created_at: now,
      };
      await env.DB.prepare(
        "INSERT INTO duty (id, person_id, task, every_ms, at_minutes, next_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
        .bind(duty.id, duty.person_id, duty.task, duty.every_ms, duty.at_minutes, duty.next_at, duty.created_at)
        .run();
      disarmCrew(person.id);
      return text(`已排上。${person.name}${slot.label}做一次：${duty.task}。${slot.when}编号 ${duty.id}。`);
    },
  };
}

export function unscheduleTool(env: Env, departmentId: string) {
  return {
    name: "unschedule",
    label: "取消定时",
    description: "取消一件周期工作。duty_id 来自定时列表。",
    parameters: CancelArgs,
    executionMode: "sequential" as const,
    execute: async (_id: string, args: Static<typeof CancelArgs>) => {
      const owned = await env.DB.prepare(
        `SELECT duty.person_id FROM duty JOIN people ON people.id = duty.person_id
         WHERE duty.id = ? AND people.department_id = ?`,
      )
        .bind(args.duty_id, departmentId)
        .first<{ person_id: string }>();
      if (!owned) return miss("没有这个定时。");
      const personId = await cancelDuty(env.DB, args.duty_id);
      if (!personId) return miss("没有这个定时。");
      const { settleShift } = await import("./work");
      await settleShift(env, personId);
      return text("已经取消。");
    },
  };
}

export async function cancelDuty(db: Env["DB"], id: string) {
  const existing = await db.prepare("SELECT person_id FROM duty WHERE id = ?").bind(id).first<{ person_id: string }>();
  if (!existing) return null;
  await db.prepare("DELETE FROM duty WHERE id = ?").bind(id).run();
  return existing.person_id;
}

export async function runDue(env: Env): Promise<{ ran: number }> {
  if (ticking) return { ran: 0 };
  ticking = true;
  try {
    const { speak, officeBusy, runStaffDuty, personWorking } = await import("./work");
    const now = Date.now();
    const dueRows = await env.DB.prepare(
      "SELECT id, person_id, task, every_ms, at_minutes, next_at, created_at FROM duty WHERE next_at <= ? ORDER BY next_at ASC, id ASC LIMIT 8",
    )
      .bind(now)
      .all<StoredDuty>();
    let due: StoredDuty | undefined;
    let person: { id: string; name: string; is_lead: 0 | 1; department_id: string } | null = null;
    for (const row of dueRows.results) {
      const owner = await env.DB.prepare("SELECT id, name, is_lead, department_id FROM people WHERE id = ?")
        .bind(row.person_id)
        .first<{ id: string; name: string; is_lead: 0 | 1; department_id: string }>();
      if (!owner) {
        await cancelDuty(env.DB, row.id);
        continue;
      }
      if (officeBusy(owner.department_id) || personWorking(owner.id)) continue;
      due = row;
      person = owner;
      break;
    }
    if (!due || !person) return { ran: 0 };
    const result =
      person.is_lead === 1
        ? await speak(
            env,
            `到点了。请你现在自己完成这件事，做完用一句话告诉用户结果。不要派给员工，也不要新建或取消定时：${due.task}`,
            undefined,
            "clock",
            person.department_id,
          )
        : await runStaffDuty(env, person.id, due.task);
    const finished = Date.now();
    const next =
      typeof due.at_minutes === "number"
        ? result.ok
          ? nextDailyAt(finished, due.at_minutes)
          : finished + 60_000
        : nextDueAt(finished, due.every_ms, result.ok);
    await env.DB.prepare("UPDATE duty SET next_at = ? WHERE id = ?").bind(next, due.id).run();
    if (result.ok) failedDuty.delete(due.id);
    else await reportFailure(env, due.id, person.name, person.department_id, result.error);
    return { ran: result.ok ? 1 : 0 };
  } finally {
    ticking = false;
  }
}

const failedDuty = new Map<string, string>();

async function reportFailure(env: Env, id: string, name: string, departmentId: string, error: string) {
  if (failedDuty.get(id) === error) return;
  failedDuty.set(id, error);
  await env.DB.prepare(
    "INSERT INTO work_line (id, role, person_id, text, raw, created_at, department_id) VALUES (?, 'clock', NULL, ?, NULL, ?, ?)",
  )
    .bind(crypto.randomUUID(), `到点了。${name}没做成：${error}`, Date.now(), departmentId)
    .run();
}

let ticking = false;

function clockSlot(now: number, atMinutes: number | null, every: number | null) {
  if (atMinutes !== null) {
    const nextAt = nextDailyAt(now, atMinutes);
    return { everyMs: DUTY_DAY_MS, atMinutes, nextAt, label: clockLabel(atMinutes), when: `下一次 ${clockStamp(nextAt)}。` };
  }
  const everyMs = (every ?? DUTY_MIN_MINUTES) * 60_000;
  return { everyMs, atMinutes: null, nextAt: now, label: everyLabel(everyMs), when: "" };
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {} };
}

function miss(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {}, isError: true };
}

export type Duty = {
  id: string;
  person_id: string;
  task: string;
  every_ms: number;
  /** Minutes after midnight in Asia/Shanghai. Null means the duty repeats by every_ms. */
  at_minutes: number | null;
  next_at: number;
};

export const DUTY_MIN_MINUTES = 1;
export const DUTY_RETRY_MS = 60_000;

export function nextDueAt(now: number, everyMs: number, ok: boolean) {
  if (ok) return now + everyMs;
  return now + Math.min(everyMs, DUTY_RETRY_MS);
}
export const DUTY_MAX_MINUTES = 10_080;
export const DUTY_ZONE = "Asia/Shanghai";
export const DUTY_DAY_MS = 24 * 60 * 60 * 1000;

export function parseClock(input: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function clockLabel(atMinutes: number) {
  const hour = Math.floor(atMinutes / 60);
  const minute = atMinutes % 60;
  return `每天 ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function dutyWhen(duty: { every_ms: number; at_minutes?: number | null }) {
  if (typeof duty.at_minutes === "number") return clockLabel(duty.at_minutes);
  return everyLabel(duty.every_ms);
}

type Civil = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function civilIn(ms: number, timeZone: string): Civil {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const bag = Object.fromEntries(fmt.formatToParts(ms).map((part) => [part.type, part.value]));
  let hour = Number(bag.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  };
}

function utcFromCivil(year: number, month: number, day: number, hour: number, minute: number, timeZone: string) {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const shift = (ms: number) => {
    const civil = civilIn(ms, timeZone);
    return Date.UTC(civil.year, civil.month - 1, civil.day, civil.hour, civil.minute, civil.second) - ms;
  };
  const once = guess - shift(guess);
  return guess - shift(once);
}

/** The next time this clock minute occurs after now, in Asia/Shanghai unless a zone is passed. */
export function nextDailyAt(now: number, atMinutes: number, timeZone = DUTY_ZONE) {
  const hour = Math.floor(atMinutes / 60);
  const minute = atMinutes % 60;
  const today = civilIn(now, timeZone);
  let candidate = utcFromCivil(today.year, today.month, today.day, hour, minute, timeZone);
  if (candidate <= now) {
    const ahead = civilIn(now + DUTY_DAY_MS, timeZone);
    candidate = utcFromCivil(ahead.year, ahead.month, ahead.day, hour, minute, timeZone);
  }
  if (candidate <= now) {
    const further = civilIn(now + 2 * DUTY_DAY_MS, timeZone);
    candidate = utcFromCivil(further.year, further.month, further.day, hour, minute, timeZone);
  }
  return candidate;
}

export function clockStamp(ms: number, timeZone = DUTY_ZONE) {
  const civil = civilIn(ms, timeZone);
  return `${civil.month}月${civil.day}日 ${String(civil.hour).padStart(2, "0")}:${String(civil.minute).padStart(2, "0")}`;
}

export function everyLabel(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes % 1440 === 0) return `每${minutes / 1440}天`;
  if (minutes % 60 === 0) return `每${minutes / 60}小时`;
  return `每${minutes}分钟`;
}

const DUTY_LABEL_MAX = 16;

export function reviseTarget<T extends { task: string }>(mine: T[], task: string) {
  const wanted = task.replace(/\s+/g, "");
  return mine.find((duty) => duty.task.replace(/\s+/g, "") === wanted) ?? (mine.length === 1 ? mine[0] : undefined);
}

export function dutyHoldLabel(duty: { every_ms: number; task: string; at_minutes?: number | null }) {
  const text = `${dutyWhen(duty)}${duty.task}`.replace(/\s+/g, "");
  const label = [...text].slice(0, DUTY_LABEL_MAX).join("");
  return label || "等人";
}

export async function listDuties(departmentId: string): Promise<Duty[]> {
  const body = await send(`/api/duties?department=${encodeURIComponent(departmentId)}`);
  return (body as { duties: Duty[] }).duties;
}

export async function cancelDuty(id: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/duties/${id}`, { method: "DELETE" });
  } catch {
    throw new Error("定时没连上。");
  }
  if (!response.ok) throw new Error(await errorMessage(response));
}

async function send(path: string) {
  let response: Response;
  try {
    response = await fetch(path);
  } catch {
    throw new Error("定时没连上。");
  }
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<unknown>;
}

async function errorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* An empty status still needs a sentence. */
  }
  return "定时没有写成。";
}

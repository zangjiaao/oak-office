export type Duty = {
  id: string;
  person_id: string;
  task: string;
  every_ms: number;
  next_at: number;
};

export const DUTY_MIN_MINUTES = 5;
export const DUTY_MAX_MINUTES = 10_080;

export function everyLabel(ms: number) {
  const minutes = Math.round(ms / 60_000);
  if (minutes % 1440 === 0) return `每${minutes / 1440}天`;
  if (minutes % 60 === 0) return `每${minutes / 60}小时`;
  return `每${minutes}分钟`;
}

export async function listDuties(): Promise<Duty[]> {
  const body = await send("/api/duties");
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

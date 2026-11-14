export const WATER_MINUTES = [30, 45, 60, 90, 120] as const;

export type WaterReminder = {
  everyMinutes: number;
  nextAt: number;
  departmentId: string;
};

export async function readWater(): Promise<WaterReminder | null> {
  const body = await send("/api/water");
  return (body as { reminder: WaterReminder | null }).reminder;
}

export async function saveWater(departmentId: string, everyMinutes: number): Promise<WaterReminder> {
  const body = await send("/api/water", { method: "PUT", departmentId, everyMinutes });
  return (body as { reminder: WaterReminder }).reminder;
}

export async function clearWater(): Promise<void> {
  let response: Response;
  try {
    response = await fetch("/api/water", { method: "DELETE" });
  } catch {
    throw new Error("饮水提醒没连上。");
  }
  if (!response.ok) throw new Error(await errorMessage(response));
}

async function send(path: string, options?: { method: "PUT"; departmentId: string; everyMinutes: number }) {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options?.method ?? "GET",
      headers: options ? { "content-type": "application/json" } : undefined,
      body: options ? JSON.stringify({ departmentId: options.departmentId, everyMinutes: options.everyMinutes }) : undefined,
    });
  } catch {
    throw new Error("饮水提醒没连上。");
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
  return "饮水提醒没连上。";
}

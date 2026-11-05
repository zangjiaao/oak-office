import type { Pose } from "../office/types";

export type FloorMark = { person_id: string; pose: Pose; label: string };

export type WorkLine = { id: string; role: "user" | "lead"; text: string };

export type WorkOffice = {
  lead: { id: string; name: string } | null;
  lines: WorkLine[];
  floor: FloorMark[];
};

export async function loadWork(): Promise<WorkOffice> {
  return (await send("/api/work")) as WorkOffice;
}

export async function sayWork(text: string): Promise<WorkOffice> {
  return (await send("/api/work", text)) as WorkOffice;
}

async function send(path: string, text?: string) {
  let response: Response;
  try {
    response = await fetch(path, {
      method: text === undefined ? "GET" : "POST",
      headers: text === undefined ? undefined : { "content-type": "application/json" },
      body: text === undefined ? undefined : JSON.stringify({ text }),
    });
  } catch {
    throw new Error("主管这回没接上。");
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
  return "主管这回没接上。";
}

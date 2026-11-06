import type { Pose } from "../office/types";

export type FloorMark = { person_id: string; pose: Pose; label: string; updated_at?: number; visit?: string };

export type DutyHold = { person_id: string; label: string };

export type WorkLine = {
  id: string;
  role: "user" | "lead" | "staff" | "clock";
  person_id: string | null;
  text: string;
};

export type WorkBeat = {
  person_id: string;
  pose: Pose;
  label: string;
  hold: number;
  line?: WorkLine;
  lineAt?: "start" | "end";
  visit?: string;
};

export type WorkOffice = {
  lead: { id: string; name: string } | null;
  lines: WorkLine[];
  floor: FloorMark[];
  holding: DutyHold[];
  play?: WorkBeat[];
  closing?: WorkLine;
  playId?: string;
};

export async function loadWork(departmentId: string): Promise<WorkOffice> {
  return (await send(`/api/work?department=${encodeURIComponent(departmentId)}`)) as WorkOffice;
}

export async function sayWork(departmentId: string, text: string): Promise<WorkOffice> {
  return (await send("/api/work", { departmentId, text })) as WorkOffice;
}

async function send(path: string, body?: { departmentId: string; text: string }) {
  let response: Response;
  try {
    response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
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

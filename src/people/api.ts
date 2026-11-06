import type { PersonDraft, PersonRow } from "./record";

export async function listPeople(): Promise<PersonRow[]> {
  const body = await send("/api/people");
  return (body as { people: PersonRow[] }).people;
}

export async function hirePerson(draft: PersonDraft): Promise<PersonRow> {
  const body = await send("/api/people", { method: "POST", draft });
  return (body as { person: PersonRow }).person;
}

export async function updatePerson(id: string, draft: PersonDraft): Promise<PersonRow> {
  const body = await send(`/api/people/${id}`, { method: "PATCH", draft });
  return (body as { person: PersonRow }).person;
}

export async function forgetMemory(personId: string, noteId: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/people/${personId}/memory/${noteId}`, { method: "DELETE" });
  } catch {
    throw new Error("档案库没连上。");
  }
  if (!response.ok) throw new Error(await errorMessage(response));
}

export async function dismissPerson(id: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/people/${id}`, { method: "DELETE" });
  } catch {
    throw new Error("档案库没连上。");
  }
  if (!response.ok) throw new Error(await errorMessage(response));
}

async function send(path: string, options?: { method: "POST" | "PATCH"; draft: PersonDraft }) {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options?.method ?? "GET",
      headers: options ? { "content-type": "application/json" } : undefined,
      body: options ? JSON.stringify(options.draft) : undefined,
    });
  } catch {
    throw new Error("档案库没连上。");
  }
  if (!response.ok) throw new Error(await errorMessage(response));
  return response.json() as Promise<unknown>;
}

async function errorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* The worker sometimes answers with an empty status. */
  }
  return "档案没有写成。";
}

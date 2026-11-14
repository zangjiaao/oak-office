export type Colleague = { email: string; name: string };

export type Session = { email: string | null; name: string | null };

export async function listColleagues(): Promise<Colleague[]> {
  const body = await send("/api/colleagues");
  return (body as { colleagues: Colleague[] }).colleagues;
}

export async function saveColleague(email: string, name: string): Promise<Colleague> {
  const body = await send("/api/colleagues", { method: "PUT", draft: { email, name } });
  return (body as { colleague: Colleague }).colleague;
}

export async function removeColleague(email: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`/api/colleagues/${encodeURIComponent(email)}`, { method: "DELETE" });
  } catch {
    throw new Error("同事没连上。");
  }
  if (!response.ok) throw new Error(await errorMessage(response));
}

export async function currentSession(): Promise<Session> {
  const body = await send("/api/me");
  return body as Session;
}

async function send(path: string, options?: { method: "PUT"; draft: unknown }) {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options?.method ?? "GET",
      headers: options ? { "content-type": "application/json" } : undefined,
      body: options ? JSON.stringify(options.draft) : undefined,
    });
  } catch {
    throw new Error("同事没连上。");
  }
  if (!response.ok) throw new Error(await errorMessage(response));
  if (response.status === 204) return {};
  return response.json() as Promise<unknown>;
}

async function errorMessage(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* An empty status still needs a sentence. */
  }
  return "同事没连上。";
}

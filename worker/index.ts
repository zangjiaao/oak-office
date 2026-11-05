import { dismissPerson, readDraft, hirePerson, listPeople, RosterDbError, updatePerson } from "./people";
import { getWork, speak } from "./work";
import type { Env } from "./env";
import type { PersonDraft } from "../src/people/record";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true, name: "oak-office" });
      }
      if (url.pathname === "/api/work") {
        if (request.method === "GET") return json(await getWork(env.DB));
        if (request.method === "POST") {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return json({ error: "看不懂这句话。" }, 400);
          }
          const text = body && typeof body === "object" && "text" in body ? (body as { text: unknown }).text : undefined;
          if (typeof text !== "string") return json({ error: "看不懂这句话。" }, 400);
          const result = await speak(env, text, request.signal);
          if (!result.ok) return json({ error: result.error }, result.status);
          return json(result.office);
        }
        return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
      }
      if (url.pathname === "/api/people") {
        if (request.method === "GET") return json({ people: await listPeople(env.DB) });
        if (request.method === "POST") {
          return write(request, async (draft) => {
            const result = await hirePerson(env.DB, draft);
            if (!result.ok) return json({ error: result.error }, result.status);
            return json({ person: result.person }, 201);
          });
        }
        return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
      }
      const match = /^\/api\/people\/([^/]+)$/.exec(url.pathname);
      if (match) {
        const id = decodeURIComponent(match[1]);
        if (!UUID.test(id)) return json({ error: "没有这个人。" }, 404);
        if (request.method === "DELETE") {
          const result = await dismissPerson(env.DB, id);
          if (!result) return json({ error: "没有这个人。" }, 404);
          if (!result.ok) return json({ error: result.error }, result.status);
          return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
        }
        if (request.method !== "PATCH") {
          return new Response(null, { status: 405, headers: { allow: "PATCH, DELETE" } });
        }
        return write(request, async (draft) => {
          const result = await updatePerson(env.DB, id, draft);
          if (!result) return json({ error: "没有这个人。" }, 404);
          if (!result.ok) return json({ error: result.error }, result.status);
          return json({ person: result.person });
        });
      }
      return new Response(null, { status: 404 });
    } catch (error) {
      if (error instanceof RosterDbError) return json({ error: error.message }, error.status);
      console.error(error);
      return json({ error: "档案库没写成。" }, 500);
    }
  },
};

async function write(request: Request, run: (draft: PersonDraft) => Promise<Response>) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "看不懂这份档案。" }, 400);
  }
  const parsed = readDraft(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  return run(parsed.value);
}

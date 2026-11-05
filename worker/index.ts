import { readDraft, hirePerson, listPeople, RosterDbError, updatePerson } from "./people";
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
      if (url.pathname === "/api/people") {
        if (request.method === "GET") return json({ people: await listPeople(env.DB) });
        if (request.method === "POST") {
          return write(request, async (draft) => json({ person: await hirePerson(env.DB, draft) }, 201));
        }
        return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
      }
      const match = /^\/api\/people\/([^/]+)$/.exec(url.pathname);
      if (match) {
        if (request.method !== "PATCH") {
          return new Response(null, { status: 405, headers: { allow: "PATCH" } });
        }
        const id = decodeURIComponent(match[1]);
        if (!UUID.test(id)) return json({ error: "没有这个人。" }, 404);
        return write(request, async (draft) => {
          const person = await updatePerson(env.DB, id, draft);
          if (!person) return json({ error: "没有这个人。" }, 404);
          return json({ person });
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

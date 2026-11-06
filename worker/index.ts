import { createDepartment, listDepartments, readDepartment, updateDepartment } from "./department";
import { cancelDuty, listDuties, runDue } from "./duty";
import { forget } from "./memory";
import { dismissPerson, readDraft, hirePerson, listPeople, RosterDbError, updatePerson } from "./people";
import { crewUntil, releaseCrew } from "./crew";
import { getWork, settleShift, speak } from "./work";
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
  async fetch(request: Request, env: Env, ctx?: { waitUntil(promise: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return json({ ok: true, name: "oak-office" });
      }
      if (url.pathname === "/api/departments") {
        if (request.method === "GET") return json({ departments: await listDepartments(env.DB) });
        if (request.method === "POST") return writeDepartment(request, (draft) => createDepartment(env.DB, draft));
        return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
      }
      const departmentMatch = /^\/api\/departments\/([^/]+)$/.exec(url.pathname);
      if (departmentMatch) {
        const id = decodeURIComponent(departmentMatch[1]);
        if (!UUID.test(id)) return json({ error: "没有这一层。" }, 404);
        if (request.method !== "PATCH") return new Response(null, { status: 405, headers: { allow: "PATCH" } });
        return writeDepartment(request, (draft) => updateDepartment(env.DB, id, draft));
      }
      if (url.pathname === "/api/work") {
        const departmentId = url.searchParams.get("department") ?? "";
        if (request.method === "GET") {
          if (!UUID.test(departmentId)) return json({ error: "先选一层。" }, 400);
          return json(await getWork(env.DB, departmentId));
        }
        if (request.method === "POST") {
          let body: unknown;
          try {
            body = await request.json();
          } catch {
            return json({ error: "看不懂这句话。" }, 400);
          }
          const record = body && typeof body === "object" ? (body as { text?: unknown; departmentId?: unknown }) : {};
          if (typeof record.text !== "string") return json({ error: "看不懂这句话。" }, 400);
          if (typeof record.departmentId !== "string" || !UUID.test(record.departmentId)) {
            return json({ error: "先选一层。" }, 400);
          }
          const result = await speak(env, record.text, request.signal, "user", record.departmentId);
          if (!result.ok) return json({ error: result.error }, result.status);
          holdCrew(ctx);
          return json(result.office);
        }
        return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
      }
      if (url.pathname === "/api/duties") {
        if (request.method === "GET") {
          const departmentId = url.searchParams.get("department") ?? "";
          if (!UUID.test(departmentId)) return json({ error: "先选一层。" }, 400);
          return json({ duties: await listDuties(env.DB, departmentId) });
        }
        return new Response(null, { status: 405, headers: { allow: "GET" } });
      }
      if (url.pathname === "/api/duties/tick") {
        if (request.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST" } });
        const token = env.OFFICE_HOST_TOKEN?.trim();
        if (!token || request.headers.get("authorization") !== `Bearer ${token}`) {
          return json({ error: "口令不对。" }, 401);
        }
        const result = await runDue(env);
        holdCrew(ctx);
        return json(result);
      }
      const dutyMatch = /^\/api\/duties\/([^/]+)$/.exec(url.pathname);
      if (dutyMatch) {
        const id = decodeURIComponent(dutyMatch[1]);
        if (!UUID.test(id)) return json({ error: "没有这个定时。" }, 404);
        if (request.method !== "DELETE") return new Response(null, { status: 405, headers: { allow: "DELETE" } });
        const personId = await cancelDuty(env.DB, id);
        if (!personId) return json({ error: "没有这个定时。" }, 404);
        await settleShift(env, personId);
        return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      }
      if (url.pathname === "/api/people") {
        const departmentId = url.searchParams.get("department") ?? "";
        if (request.method === "GET") {
          if (!UUID.test(departmentId)) return json({ error: "先选一层。" }, 400);
          return json({ people: await listPeople(env.DB, departmentId) });
        }
        if (request.method === "POST") {
          if (!UUID.test(departmentId)) return json({ error: "先选一层。" }, 400);
          return write(request, async (draft) => {
            const result = await hirePerson(env.DB, draft, departmentId);
            if (!result.ok) return json({ error: result.error }, result.status);
            return json({ person: result.person }, 201);
          });
        }
        return new Response(null, { status: 405, headers: { allow: "GET, POST" } });
      }
      const memoryMatch = /^\/api\/people\/([^/]+)\/memory\/([^/]+)$/.exec(url.pathname);
      if (memoryMatch) {
        const personId = decodeURIComponent(memoryMatch[1]);
        const noteId = decodeURIComponent(memoryMatch[2]);
        if (!UUID.test(personId) || !UUID.test(noteId)) return json({ error: "没有这条记忆。" }, 404);
        if (request.method !== "DELETE") {
          return new Response(null, { status: 405, headers: { allow: "DELETE" } });
        }
        const result = await forget(env.DB, personId, noteId);
        if (result === null) return json({ error: "没有这个人。" }, 404);
        if (!result) return json({ error: "没有这条记忆。" }, 404);
        return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
      }
      const match = /^\/api\/people\/([^/]+)$/.exec(url.pathname);
      if (match) {
        const id = decodeURIComponent(match[1]);
        if (!UUID.test(id)) return json({ error: "没有这个人。" }, 404);
        if (request.method === "DELETE") {
          releaseCrew(id);
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
      const message = error instanceof Error ? error.message : "";
      if (message.includes("no such table") || message.includes("no such column")) {
        return json({ error: "本地库还没跟上。" }, 503);
      }
      console.error(error);
      return json({ error: "档案库没写成。" }, 500);
    }
  },
};

function holdCrew(ctx?: { waitUntil(promise: Promise<unknown>): void }) {
  const until = crewUntil();
  const wait = until - Date.now();
  if (!ctx || wait <= 0) return;
  ctx.waitUntil(new Promise((resolve) => setTimeout(resolve, wait + 40)));
}

async function writeDepartment(
  request: Request,
  run: (draft: import("../src/people/department").DepartmentDraft) => Promise<
    { ok: true; department: import("../src/people/department").Department } | { ok: false; error: string; status: number } | null
  >,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "看不懂这一层。" }, 400);
  }
  const parsed = readDepartment(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const result = await run(parsed.value);
  if (!result) return json({ error: "没有这一层。" }, 404);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ department: result.department }, request.method === "POST" ? 201 : 200);
}

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

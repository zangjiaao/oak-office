import type { Env } from "./env";
import { officeJson, officePost } from "./office-client";

export type WorkspaceEntry = { name: string; kind: "dir" | "file"; bytes: number };

export async function workspaceList(env: Env, folder: string) {
  const path = safePath(folder);
  if (path === null) return { ok: false as const, error: "只能看工作目录里的文件夹。", status: 400 };
  return ask(env, "/list", { path: path || "." });
}

export async function workspaceText(env: Env, file: string) {
  const path = safePath(file);
  if (!path) return { ok: false as const, error: "只能看工作目录里的文件。", status: 400 };
  return ask(env, "/read", { path });
}

export async function workspaceRemove(env: Env, file: string) {
  const path = safePath(file);
  if (!path) return { ok: false as const, error: "只能删工作目录里的文件。", status: 400 };
  return ask(env, "/delete", { path });
}

export async function workspaceFile(env: Env, file: string) {
  const path = safePath(file);
  if (!path) return Response.json({ error: "只能拿工作目录里的文件。" }, { status: 400 });
  const posted = await officePost(env, "/raw", { path });
  if (!posted.ok) return Response.json({ error: posted.error }, { status: posted.status });
  const response = posted.response;
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("json") || !response.ok || !type.includes("octet-stream")) {
    const payload = type.includes("json") ? ((await response.json().catch(() => null)) as { error?: string } | null) : null;
    const denied = response.status === 401 || response.status === 403 || (response.status >= 300 && response.status < 400);
    return Response.json(
      { error: payload?.error || (denied ? "脚本工作区被入口拦住了。" : "没拿到文件。") },
      { status: response.ok ? 502 : response.status || 502 },
    );
  }
  return new Response(response.body, {
    status: response.status,
    headers: {
      "content-type": "application/octet-stream",
      "content-disposition": response.headers.get("content-disposition") ?? "attachment",
      "cache-control": "no-store",
    },
  });
}

async function ask(env: Env, action: string, body: Record<string, string>) {
  const result = await officeJson<{ ok?: boolean; error?: string; text?: string; entries?: WorkspaceEntry[] }>(env, action, body);
  if (!result.ok) return result;
  return { ok: true as const, text: result.payload.text ?? "", entries: result.payload.entries ?? [], status: 200 };
}

function safePath(input: string) {
  const text = input.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (text.includes("\0") || text.split("/").includes("..") || text.startsWith("/")) return null;
  return text;
}

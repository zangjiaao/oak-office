import type { Env } from "./env";

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
  const host = env.OFFICE_HOST?.trim();
  const token = env.OFFICE_HOST_TOKEN?.trim();
  if (!host || !token) {
    return Response.json({ error: "脚本工作区还没打开。在 .dev.vars 里写 OFFICE_HOST_TOKEN。" }, { status: 503 });
  }
  let response: Response;
  try {
    response = await fetch(`${host}/raw`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ path }),
    });
  } catch {
    return Response.json({ error: "脚本工作区没连上。" }, { status: 503 });
  }
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("json")) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return Response.json({ error: payload?.error || "没拿到文件。" }, { status: response.ok ? 502 : response.status });
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
  const host = env.OFFICE_HOST?.trim();
  const token = env.OFFICE_HOST_TOKEN?.trim();
  if (!host || !token) {
    return { ok: false as const, error: "脚本工作区还没打开。在 .dev.vars 里写 OFFICE_HOST_TOKEN。", status: 503 };
  }
  try {
    const response = await fetch(`${host}${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { ok?: boolean; error?: string; text?: string; entries?: WorkspaceEntry[] };
    if (!response.ok || payload.ok === false) {
      return { ok: false as const, error: payload.error || "工作目录没接上。", status: response.status || 502 };
    }
    return { ok: true as const, text: payload.text ?? "", entries: payload.entries ?? [], status: 200 };
  } catch {
    return { ok: false as const, error: "脚本工作区没连上。", status: 503 };
  }
}

function safePath(input: string) {
  const text = input.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (text.includes("\0") || text.split("/").includes("..") || text.startsWith("/")) return null;
  return text;
}

import { accessHeaders } from "./access";
import type { Env } from "./env";

const CLOSED = "脚本工作区还没打开。在 .dev.vars 里写 OFFICE_HOST_TOKEN。";

export function officeTarget(env: Env) {
  const host = env.OFFICE_HOST?.trim() ?? "";
  const token = env.OFFICE_HOST_TOKEN?.trim() ?? "";
  if (!host || !token) return null;
  return { host, token };
}

export function officeHeaders(env: Env, token: string): Record<string, string> {
  return {
    "content-type": "application/json",
    authorization: `Bearer ${token}`,
    ...accessHeaders(env.CF_ACCESS_CLIENT_ID, env.CF_ACCESS_CLIENT_SECRET),
  };
}

export async function officePost(env: Env, action: string, body: unknown, signal?: AbortSignal) {
  const target = officeTarget(env);
  if (!target) return { ok: false as const, error: CLOSED, status: 503 };
  try {
    const response = await fetch(`${target.host}${action}`, {
      method: "POST",
      headers: officeHeaders(env, target.token),
      body: JSON.stringify(body),
      redirect: "manual",
      signal,
    });
    return { ok: true as const, response };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return {
      ok: false as const,
      error: message ? `脚本工作区没连上。${message}` : "脚本工作区没连上。",
      status: 503,
    };
  }
}

export async function officeJson<T extends { ok?: boolean; error?: string }>(
  env: Env,
  action: string,
  body: unknown,
  signal?: AbortSignal,
) {
  const posted = await officePost(env, action, body, signal);
  if (!posted.ok) return posted;
  const type = posted.response.headers.get("content-type") ?? "";
  if (!type.includes("json")) {
    return { ok: false as const, error: blocked(posted.response.status), status: posted.response.status || 502 };
  }
  const payload = (await posted.response.json()) as T;
  if (!posted.response.ok || payload.ok === false) {
    return { ok: false as const, error: payload.error || "工作目录没接上。", status: posted.response.status || 502 };
  }
  return { ok: true as const, status: posted.response.status, payload };
}

function blocked(status: number) {
  if (status === 301 || status === 302 || status === 303 || status === 307 || status === 308 || status === 401 || status === 403) {
    return "脚本工作区被入口拦住了。";
  }
  return "工作目录没接上。";
}

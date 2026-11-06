import { obj, str, type Static } from "@earendil-works/pi-schema";
import type { Pose } from "../src/office/types";
import type { Env } from "./env";

type Step = { pose: Pose; label: string };
type Mark = (pose: Pose, label: string) => Promise<void>;

const SearchArgs = obj({ query: str() });
const ReadArgs = obj({ path: str() });
const WriteArgs = obj({ path: str(), content: str() });
const EditArgs = obj({ path: str(), old: str(), new: str() });
const BashArgs = obj({ command: str() });

export function deskTools(env: Env, steps: Step[], mark: Mark) {
  return [
    searchTool(env, steps, mark),
    readTool(env, steps, mark),
    writeTool(env, steps, mark),
    editTool(env, steps, mark),
    bashTool(env, steps, mark),
  ];
}

function searchTool(env: Env, steps: Step[], mark: Mark) {
  return {
    name: "search",
    label: "搜索",
    description: "用 Tavily 在互联网上搜索。query 是搜索词。",
    parameters: SearchArgs,
    executionMode: "sequential" as const,
    execute: async (_id: string, args: Static<typeof SearchArgs>) => {
      const query = args.query.trim();
      if (!query) return miss("搜索词是空的。");
      const key = env.TAVILY_API_KEY?.trim();
      if (!key) return miss("搜索还没配置。在 .dev.vars 里写 TAVILY_API_KEY。");
      await note(steps, mark, "read", "在搜索");
      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ api_key: key, query, max_results: 5, search_depth: "basic", include_answer: true }),
      });
      if (!response.ok) return miss("搜索这回没接上。");
      const body = (await response.json()) as {
        answer?: string;
        results?: { title?: string; url?: string; content?: string }[];
      };
      const lines = (body.results ?? []).slice(0, 5).map((item, index) => {
        const content = (item.content ?? "").replace(/\s+/g, " ").slice(0, 400);
        return `${index + 1}. ${item.title ?? "无题"}\n${item.url ?? ""}\n${content}`;
      });
      const answer = body.answer?.trim() ? `${body.answer.trim()}\n\n` : "";
      return text(`${answer}${lines.join("\n\n") || "没有搜到结果。"}`);
    },
  };
}

function readTool(env: Env, steps: Step[], mark: Mark) {
  return fileTool(env, steps, mark, "read", "在看文件", "读取工作目录里的文件。path 相对工作目录。", ReadArgs, "/read");
}

function writeTool(env: Env, steps: Step[], mark: Mark) {
  return fileTool(env, steps, mark, "type", "在写脚本", "新建或覆盖工作目录里的文件。用来写脚本。", WriteArgs, "/write");
}

function editTool(env: Env, steps: Step[], mark: Mark) {
  return fileTool(env, steps, mark, "type", "在改脚本", "替换文件里唯一的一段原文。old 必须只出现一次。", EditArgs, "/edit");
}

function bashTool(env: Env, steps: Step[], mark: Mark) {
  return fileTool(env, steps, mark, "run", "在跑脚本", "在工作目录里执行 bash。用来运行刚写的脚本。", BashArgs, "/bash");
}

function fileTool(
  env: Env,
  steps: Step[],
  mark: Mark,
  pose: Pose,
  label: string,
  description: string,
  parameters: typeof ReadArgs | typeof WriteArgs | typeof EditArgs | typeof BashArgs,
  action: string,
) {
  return {
    name: action.slice(1),
    label,
    description,
    parameters,
    executionMode: "sequential" as const,
    execute: async (_id: string, args: Record<string, string>) => {
      await note(steps, mark, pose, label);
      const result = await officeHost(env, action, args);
      return result.ok ? text(result.text || "完成。") : miss(result.error || "工作目录没接上。");
    },
  };
}

async function note(steps: Step[], mark: Mark, pose: Pose, label: string) {
  steps.push({ pose, label });
  await mark(pose, label);
}

async function officeHost(env: Env, action: string, body: Record<string, string>) {
  const host = env.OFFICE_HOST?.trim();
  const token = env.OFFICE_HOST_TOKEN?.trim();
  if (!host || !token) return { ok: false as const, error: "脚本工作区还没打开。在 .dev.vars 里写 OFFICE_HOST_TOKEN。" };
  try {
    const response = await fetch(`${host}${action}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as { ok?: boolean; text?: string; error?: string; exitCode?: number };
    if (!response.ok || payload.ok === false) return { ok: false as const, error: payload.error || "工作目录没接上。" };
    const exit = payload.exitCode === undefined ? "" : `\n退出码 ${payload.exitCode}`;
    return { ok: true as const, text: `${payload.text ?? ""}${exit}`.trim() };
  } catch {
    return { ok: false as const, error: "脚本工作区没连上。" };
  }
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {} };
}

function miss(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {}, isError: true };
}

import { arr, obj, opt, str, type Static } from "@earendil-works/pi-schema";
import { BASH_MAX_SECONDS, bashSeconds, hideSecrets } from "./bash-guard";
import type { Pose } from "../src/office/types";
import type { Env } from "./env";
import { remember } from "./memory";
import { officeJson } from "./office-client";
import { finishShell, startShell } from "./shell";

type Step = { pose: Pose; label: string };
type Mark = (pose: Pose, label: string) => Promise<void>;

const SearchArgs = obj({ query: str() });
const ReadArgs = obj({ path: str() });
const WriteArgs = obj({ path: str(), content: str() });
const EditArgs = obj({
  path: str(),
  edits: arr(obj({ old: str(), new: str() })),
});
const BashArgs = obj({
  command: str(),
  timeout: opt(str()),
});

export function deskTools(env: Env, steps: Step[], mark: Mark, who: { departmentId: string; personId: string }) {
  return [
    searchTool(env, steps, mark),
    readTool(env, steps, mark),
    writeTool(env, steps, mark),
    editTool(env, steps, mark),
    bashTool(env, steps, mark, who),
  ];
}

const RememberArgs = obj({ text: str() });

export function rememberTool(env: Env, personId: string) {
  return {
    name: "remember",
    label: "记住",
    description: "记下以后还用得上的一句事实，比如用户的偏好或已经定下的决定。不要把整段对话记进去。",
    parameters: RememberArgs,
    executionMode: "sequential" as const,
    execute: async (_id: string, args: Static<typeof RememberArgs>) => {
      const note = await remember(env.DB, personId, args.text);
      if (!note) return miss("要记住的内容是空的。", "remember");
      return text("记住了。");
    },
  };
}

function searchTool(env: Env, steps: Step[], mark: Mark) {
  return {
    name: "search",
    label: "搜索",
    description: "用 Tavily 在互联网上搜索。query 是搜索词。",
    parameters: SearchArgs,
    execute: async (_id: string, args: Static<typeof SearchArgs>) => {
      const query = args.query.trim();
      if (!query) return miss("搜索词是空的。", "search");
      const key = env.TAVILY_API_KEY?.trim();
      if (!key) return miss("搜索还没配置。在 .dev.vars 里写 TAVILY_API_KEY。", "search");
      await note(steps, mark, "read", "在搜索");
      try {
        const response = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ api_key: key, query, max_results: 5, search_depth: "basic", include_answer: true }),
        });
        if (!response.ok) {
          const detail = clip(await response.text().catch(() => ""), 240);
          trace("工具失败", { tool: "search", status: response.status, query: clip(query, 120), error: detail || "搜索这回没接上。" });
          return miss("搜索这回没接上。");
        }
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
      } catch (error) {
        const message = error instanceof Error ? error.message : "搜索这回没接上。";
        trace("工具失败", { tool: "search", query: clip(query, 120), error: clip(message, 240) });
        return miss("搜索这回没接上。");
      }
    },
  };
}

function readTool(env: Env, steps: Step[], mark: Mark) {
  return fileTool(
    env,
    steps,
    mark,
    "read",
    "在看文件",
    "读取文件内容。看文件用 read，不要用 cat 或 sed。工作目录用相对路径。已安装技能写成 ~/.agents/skills/技能名/SKILL.md。技能里要求执行的命令，读完后用 bash 自己跑。",
    ReadArgs,
    "/read",
  );
}

function writeTool(env: Env, steps: Step[], mark: Mark) {
  return fileTool(env, steps, mark, "type", "在写脚本", "新建或覆盖工作目录里的文件。用来写脚本。", WriteArgs, "/write");
}

function editTool(env: Env, steps: Step[], mark: Mark) {
  return {
    name: "edit",
    label: "在改脚本",
    description:
      "修改工作目录里的一个文件。edits 里放下这一处文件的全部改动，不要一处调用一次。每一处 old 必须和原文完全一致，且只出现一次，几处不能重叠。靠得很近的改动合成一条。",
    parameters: EditArgs,
    executionMode: "sequential" as const,
    execute: async (_id: string, args: Static<typeof EditArgs>) => {
      await note(steps, mark, "type", "在改脚本");
      const result = await officeHost(env, "/edit", { path: args.path, edits: args.edits });
      if (!result.ok) return miss(result.error || "工作目录没接上。", "edit");
      return text(result.text || "完成。");
    },
  };
}

function bashTool(env: Env, steps: Step[], mark: Mark, who: { departmentId: string; personId: string }) {
  return {
    name: "bash",
    label: "在跑脚本",
    description: `在这台机器的工作目录里执行 bash，返回标准输出和标准错误。可以跑 node、curl、已安装技能里的 CLI，也可以 ls。timeout 是整数秒，不写就是 20，最长 ${BASH_MAX_SECONDS}。访问令牌和刷新令牌会从输出里拿掉。`,
    parameters: BashArgs,
    executionMode: "sequential" as const,
    execute: async (_id: string, args: Static<typeof BashArgs>, signal?: AbortSignal) => {
      const command = args.command.trim();
      if (!command) return miss("没有命令。", "bash");
      const seconds = bashSeconds(args.timeout);
      if (seconds === null) return miss(`超时用整数秒，最少 1，最多 ${BASH_MAX_SECONDS}。`, "bash");
      const id = crypto.randomUUID();
      const recorded = await startShell(env.DB, { id, departmentId: who.departmentId, personId: who.personId, command }).then(
        () => true,
        () => false,
      );
      await note(steps, mark, "run", "在跑脚本");
      const result = await officeHost(env, "/bash", { command, id, timeout: seconds }, signal);
      if (recorded) await finishShell(env.DB, id, result.ok ? result.text : result.error, result.ok ? result.exitCode : null).catch(() => {});
      if (!result.ok) return miss(result.error || "工作目录没接上。", "bash");
      const exit = result.exitCode === null ? "" : `\n退出码 ${result.exitCode}`;
      return text(hideSecrets(`${result.text}${exit}`.trim() || "完成。"));
    },
  };
}

function fileTool(
  env: Env,
  steps: Step[],
  mark: Mark,
  pose: Pose,
  label: string,
  description: string,
  parameters: typeof ReadArgs | typeof WriteArgs | typeof BashArgs,
  action: string,
) {
  return {
    name: action.slice(1),
    label,
    description,
    parameters,
    ...(action === "/read" ? {} : { executionMode: "sequential" as const }),
    execute: async (_id: string, args: Record<string, string>) => {
      await note(steps, mark, pose, label);
      const result = await officeHost(env, action, args);
      if (!result.ok) return miss(result.error || "工作目录没接上。", action.slice(1));
      return text(result.text || "完成。");
    },
  };
}

async function note(steps: Step[], mark: Mark, pose: Pose, label: string) {
  steps.push({ pose, label });
  await mark(pose, label);
}

async function officeHost(env: Env, action: string, body: Record<string, unknown>, signal?: AbortSignal) {
  const result = await officeJson<{ ok?: boolean; text?: string; error?: string; exitCode?: number }>(env, action, body, signal);
  if (!result.ok) return { ok: false as const, error: result.error, exitCode: null as number | null };
  return {
    ok: true as const,
    text: result.payload.text ?? "",
    exitCode: typeof result.payload.exitCode === "number" ? result.payload.exitCode : null,
  };
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {} };
}

function miss(value: string, tool?: string) {
  if (tool) trace("工具失败", { tool, error: clip(value, 240) });
  return { content: [{ type: "text" as const, text: value }], details: {}, isError: true };
}

function trace(event: string, detail?: Record<string, unknown>) {
  console.error("[oak]", event, detail ?? "");
}

function clip(value: string, max: number) {
  const clean = value.replace(/Bearer\s+\S+/gi, "Bearer …").replace(/tvly-[A-Za-z0-9_-]+/g, "tvly-…");
  const chars = [...clean];
  return chars.length > max ? chars.slice(0, max).join("") : clean;
}

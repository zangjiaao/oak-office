import type { AgentLoopTurnUpdate, AgentMessage, PrepareNextTurnContext } from "@earendil-works/pi-agent-core";
import type { StreamFn } from "@earendil-works/pi-agent-core";
import type { Model, TranscriptContext } from "@earendil-works/pi-ai";
import { visibleText } from "./pi";
import { colleagueNames, listColleagues } from "./colleague";
import type { D1Database } from "./env";

/** Free tokens kept below the window. Same default as pi-coding-agent. */
const RESERVE = 16_384;
/** Recent tokens left verbatim. Same default as pi-coding-agent. */
const KEEP = 20_000;

export type TranscriptLine = {
  id: string;
  role: "user" | "lead" | "staff" | "clock";
  person_id: string | null;
  text: string;
  raw: string | null;
  created_at: number;
  author_email: string | null;
};

type Saved = { summary: string; first_kept_id: string };

export async function listTranscript(db: D1Database, departmentId: string) {
  const { results } = await db
    .prepare(
      `SELECT id, role, person_id, text, raw, created_at, author_email FROM work_line
       WHERE department_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .bind(departmentId)
    .all<TranscriptLine>();
  return results;
}

/**
 * Model context for one floor: the whole dialogue, or a stored summary plus the recent lines.
 * Compacts when the projected prompt crosses the window, the way pi-coding-agent does.
 * The chat transcript is not rewritten.
 */
export async function fitHistory(
  db: D1Database,
  departmentId: string,
  preface: string,
  model: Model<any>,
  streamFn: StreamFn,
  apiKey: string,
) {
  const lines = await listTranscript(db, departmentId);
  const names = colleagueNames(await listColleagues(db));
  const saved = await loadCompact(db, departmentId);
  const at = saved ? lines.findIndex((line) => line.id === saved.first_kept_id) : -1;
  const visible = at >= 0 ? lines.slice(at) : lines;
  const previous = saved?.summary ?? null;
  const window = model.contextWindow > 0 ? model.contextWindow : 1_000_000;
  const tokens = estimateTokens(preface) + (previous ? estimateTokens(previous) : 0) + visible.reduce((sum, line) => sum + lineTokens(line), 0);
  if (tokens <= window - RESERVE) return { summary: previous, lines: visible };
  const cut = keepFrom(visible, lineTokens);
  if (cut <= 0 || cut >= visible.length) return { summary: previous, lines: visible };
  const kept = visible.slice(cut);
  const summary = await summarize(model, streamFn, apiKey, visible.slice(0, cut).map((line) => spokenLine(line, names)), previous, window);
  const text = summary ?? (previous ? `${previous}\n\n（再往前的一段没能并进摘要。）` : "更早的对话没能压缩，只保留了最近一段。");
  await saveCompact(db, departmentId, text, kept[0].id);
  console.error(`[oak] 压缩对话 ${JSON.stringify({ tokens, kept: kept.length })}`);
  return { summary: text, lines: kept };
}

/** Between tool rounds, compact the live transcript when it crosses the same threshold. */
export function compactTurn(preface: string, model: Model<any>, streamFn: StreamFn, apiKey: string) {
  let previous: string | null = null;
  return async (turn: PrepareNextTurnContext, signal?: AbortSignal): Promise<AgentLoopTurnUpdate | undefined> => {
    if (signal?.aborted) return undefined;
    const messages = turn.context.messages;
    const window = model.contextWindow > 0 ? model.contextWindow : 1_000_000;
    const tokens = estimateTokens(preface) + messages.reduce((sum, message) => sum + messageTokens(message), 0);
    if (tokens <= window - RESERVE) return undefined;
    let cut = keepFrom(messages, messageTokens);
    while (cut < messages.length && messages[cut]?.role === "toolResult") cut += 1;
    if (cut <= 0 || cut >= messages.length) return undefined;
    const kept = messages.slice(cut);
    if (kept[0]?.role === "toolResult") return undefined;
    const summary = await summarize(model, streamFn, apiKey, messages.slice(0, cut).map(spokenMessage), previous, window);
    if (!summary) {
      console.error(`[oak] 压缩没接上 ${JSON.stringify({ tokens })}`);
      return undefined;
    }
    previous = summary;
    console.error(`[oak] 压缩这一轮 ${JSON.stringify({ tokens, kept: kept.length })}`);
    return {
      context: {
        ...turn.context,
        messages: [{ role: "user", content: summaryNote(summary), timestamp: Date.now() }, ...kept],
      },
    };
  };
}

export function summaryNote(summary: string) {
  return `此前对话已压缩。下面是摘要，之后才是原文。\n\n${summary}`;
}

async function loadCompact(db: D1Database, departmentId: string) {
  return db
    .prepare("SELECT summary, first_kept_id FROM work_compact WHERE department_id = ?")
    .bind(departmentId)
    .first<Saved>();
}

async function saveCompact(db: D1Database, departmentId: string, summary: string, firstKeptId: string) {
  await db
    .prepare(
      `INSERT INTO work_compact (department_id, summary, first_kept_id, updated_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(department_id) DO UPDATE SET summary = excluded.summary, first_kept_id = excluded.first_kept_id, updated_at = excluded.updated_at`,
    )
    .bind(departmentId, summary, firstKeptId, Date.now())
    .run();
}

function keepFrom<T>(items: T[], tokensOf: (item: T) => number) {
  let acc = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    acc += tokensOf(items[i]);
    if (acc >= KEEP) return i;
  }
  return 0;
}

async function summarize(
  model: Model<any>,
  streamFn: StreamFn,
  apiKey: string,
  lines: string[],
  previous: string | null,
  window: number,
) {
  const budget = Math.max(8_000, window - RESERVE - 4_000);
  let summary = previous;
  let batch: string[] = [];
  let size = summary ? estimateTokens(summary) : 0;
  for (const line of lines) {
    const n = estimateTokens(line);
    if (batch.length > 0 && size + n > budget) {
      summary = await oneSummary(model, streamFn, apiKey, batch, summary);
      if (!summary) return null;
      batch = [];
      size = estimateTokens(summary);
    }
    batch.push(line);
    size += n;
  }
  if (batch.length === 0) return summary;
  return oneSummary(model, streamFn, apiKey, batch, summary);
}

async function oneSummary(model: Model<any>, streamFn: StreamFn, apiKey: string, lines: string[], previous: string | null) {
  const prompt = [
    "<conversation>",
    lines.join("\n"),
    "</conversation>",
    previous ? `<previous_summary>\n${previous}\n</previous_summary>` : "",
    previous
      ? "把上面的新对话并进已有摘要。保留已有信息，补上新的进展、决定和上下文。完成的事项从「正在做」挪到「已完成」。"
      : "把上面的对话写成一份供另一个模型接着工作的摘要。",
    "用下面的标题，内容用中文，尽量短。保留准确的文件路径、人名、数字和原话。",
    "## 目标",
    "## 约束",
    "## 进度",
    "### 已完成",
    "### 正在做",
    "### 卡住",
    "## 决定",
    "## 下一步",
    "## 关键上下文",
  ]
    .filter((line) => line.length > 0)
    .join("\n");
  const maxTokens = Math.min(Math.floor(RESERVE * 0.8), model.maxTokens > 0 ? model.maxTokens : RESERVE);
  try {
    const response = await streamFn(
      model,
      {
        messages: [
          {
            role: "user",
            content: `你只输出摘要，不接话，不调用工具。\n\n${prompt}`,
            timestamp: Date.now(),
          },
        ],
      } as TranscriptContext,
      { apiKey, maxTokens },
    );
    const message = await response.result();
    if (message.stopReason === "error" || message.stopReason === "aborted") return null;
    const text = visibleText(message);
    return text || null;
  } catch (error) {
    console.error(`[oak] 压缩没接上 ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function spokenLine(line: TranscriptLine, names: Map<string, string>) {
  const who =
    line.role === "lead"
      ? "主管"
      : line.role === "staff"
        ? "员工"
        : line.role === "clock"
          ? "定时"
          : line.author_email
            ? (names.get(line.author_email) ?? line.author_email)
            : "用户";
  return `[${who}] ${line.text}${toolHint(line.raw)}`;
}

function toolHint(raw: string | null) {
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw) as unknown;
    const messages = Array.isArray(parsed) ? parsed : [parsed];
    const names = [
      ...new Set(
        messages.flatMap((message) => {
          if (!message || typeof message !== "object") return [];
          const record = message as { role?: string; toolName?: string; content?: { type?: string; name?: string }[] };
          if (record.role === "toolResult" && record.toolName) return [record.toolName];
          if (record.role === "assistant" && Array.isArray(record.content)) {
            return record.content.flatMap((part) => (part.type === "toolCall" && part.name ? [part.name] : []));
          }
          return [];
        }),
      ),
    ];
    return names.length ? `（用过 ${names.join("、")}）` : "";
  } catch {
    return "";
  }
}

function spokenMessage(message: AgentMessage) {
  if (message.role === "user") return `[用户] ${typeof message.content === "string" ? message.content : textOf(message.content)}`;
  if (message.role === "assistant") {
    const called = message.content.flatMap((part) => (part.type === "toolCall" ? [part.name] : []));
    const said = visibleText(message);
    return `[主管] ${said}${called.length ? `（调用 ${called.join("、")}）` : ""}`;
  }
  if (message.role === "toolResult") return `[工具 ${message.toolName}] ${textOf(message.content)}`;
  return "";
}

function textOf(content: readonly { type: string; text?: string }[]) {
  return content.flatMap((part) => (part.type === "text" && part.text ? [part.text] : [])).join("\n");
}

function lineTokens(line: TranscriptLine) {
  return estimateTokens(line.role === "lead" && line.raw ? line.raw : line.text);
}

function messageTokens(message: AgentMessage) {
  return estimateTokens(spokenMessage(message));
}

/** CJK is about one token per character. pi's 3.5-characters estimate is for English and would compact too late here. */
function estimateTokens(text: string) {
  let tokens = 0;
  for (const char of text) tokens += (char.codePointAt(0) ?? 0) > 0xff ? 1 : 0.25;
  return Math.ceil(tokens);
}

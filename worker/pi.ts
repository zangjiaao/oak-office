import type { AgentMessage, StreamFn } from "@earendil-works/pi-agent-core";
import { createModels, type AssistantMessage } from "@earendil-works/pi-ai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { hideSecrets } from "./bash-guard";
import { stripSpoken } from "./dsml";
import type { Env } from "./env";

const MISSING_KEY = "聊天模型尚未配置。在 .dev.vars 里写上 DEEPSEEK_API_KEY。";

export function openPi(env: Env) {
  const key = env.DEEPSEEK_API_KEY?.trim();
  if (!key) return { ok: false as const, error: MISSING_KEY, status: 503 };
  const models = createModels();
  models.setProvider(deepseekProvider());
  const id = env.AI_MODEL?.trim() || "deepseek-flash";
  let model = models.getModel("deepseek", id);
  if (!model && (id === "deepseek-chat" || id === "deepseek-reasoner")) {
    const base = models.getModels("deepseek")[0];
    if (base) {
      model = {
        ...base,
        id,
        name: id,
        reasoning: id === "deepseek-reasoner" || base.reasoning,
      };
    }
  }
  const modelFor = (id: string) => models.getModel("deepseek", id) ?? null;
  if (!model) {
    const known = models
      .getModels("deepseek")
      .map((item) => item.id)
      .join("、");
    return { ok: false as const, error: `AI_MODEL 不在目录里。可以用 ${known}。`, status: 503 };
  }
  return {
    ok: true as const,
    model,
    modelFor,
    streamFn: ((next, context, options) => models.streamSimple(next, context, options)) satisfies StreamFn,
    getApiKey: () => key,
  };
}

export function visibleText(message: AssistantMessage) {
  return stripSpoken(
    message.content.flatMap((part) => (part.type === "text" && part.text.trim() ? [part.text.trim()] : [])).join("\n"),
  );
}

export function replayMessage(message: AssistantMessage): AssistantMessage {
  return {
    ...message,
    content: message.content.filter((part) => part.type === "text" || part.type === "thinking"),
  };
}

const TRACE_TEXT = 8000;

/** Messages from one turn, without the opening user line, so the next turn still sees tool calls and results. */
export function turnTrace(messages: AgentMessage[]): AgentMessage[] {
  let skippedPrompt = false;
  const kept: AgentMessage[] = [];
  for (const message of messages) {
    if (!skippedPrompt && message.role === "user") {
      skippedPrompt = true;
      continue;
    }
    if (message.role !== "assistant" && message.role !== "toolResult" && message.role !== "user") continue;
    const slim = slimTrace(message);
    if (slim) kept.push(slim);
  }
  return kept;
}

function slimTrace(message: AgentMessage): AgentMessage | null {
  if (message.role === "assistant") {
    const content: AssistantMessage["content"] = [];
    for (const part of message.content) {
      if (part.type === "text") {
        const text = clipTrace(hideSecrets(part.text));
        if (text) content.push({ type: "text", text });
        continue;
      }
      if (part.type === "thinking") {
        const thinking = clipTrace(part.thinking);
        if (thinking) content.push({ ...part, thinking });
        continue;
      }
      if (part.type === "toolCall") content.push({ ...part, arguments: redactArgs(part.arguments) });
    }
    if (!content.length) return null;
    return { ...message, content };
  }
  if (message.role === "toolResult") {
    const content = message.content.flatMap((part) => {
      if (part.type !== "text") return [];
      const text = clipTrace(hideSecrets(part.text));
      return text ? [{ type: "text" as const, text }] : [];
    });
    return {
      role: "toolResult",
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      isError: message.isError,
      timestamp: message.timestamp,
      content: content.length ? content : [{ type: "text", text: "完成。" }],
    };
  }
  if (message.role === "user") {
    if (typeof message.content === "string") return { ...message, content: clipTrace(hideSecrets(message.content)) };
    const content = message.content.flatMap((part) => {
      if (part.type !== "text") return [];
      const text = clipTrace(hideSecrets(part.text));
      return text ? [{ type: "text" as const, text }] : [];
    });
    if (!content.length) return null;
    return { ...message, content };
  }
  return null;
}

function redactArgs(value: ToolArguments) {
  try {
    const parsed = JSON.parse(hideSecrets(JSON.stringify(value))) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as ToolArguments;
  } catch {
    /* The redacted arguments were not an object. */
  }
  return {};
}

type ToolArguments = AssistantMessage["content"][number] extends infer Part
  ? Part extends { type: "toolCall"; arguments: infer Arguments }
    ? Arguments
    : never
  : never;

function clipTrace(value: string) {
  const chars = [...value];
  return chars.length > TRACE_TEXT ? `${chars.slice(0, TRACE_TEXT).join("")}\n…后面省去了` : value;
}

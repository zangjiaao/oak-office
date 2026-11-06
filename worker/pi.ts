import type { StreamFn } from "@earendil-works/pi-agent-core";
import { createModels, type AssistantMessage } from "@earendil-works/pi-ai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
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
    streamFn: (maxTokens: number): StreamFn => (next, context, options) =>
      models.streamSimple(next, context, { ...options, maxTokens }),
    getApiKey: () => key,
  };
}

export function visibleText(message: AssistantMessage) {
  return message.content
    .flatMap((part) => (part.type === "text" && part.text.trim() ? [part.text.trim()] : []))
    .join("\n");
}

export function replayMessage(message: AssistantMessage): AssistantMessage {
  return {
    ...message,
    content: message.content.filter((part) => part.type === "text" || part.type === "thinking"),
  };
}

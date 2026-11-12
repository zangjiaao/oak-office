import type { AssistantMessage, JsonObject, JsonValue } from "@earendil-works/pi-ai";

const FENCE = /```[\s\S]*?```/g;
const END = /<[|｜]end▁of▁sentence[|｜]>/g;
const DANGLING = /<[\s|｜]{0,4}DSML/;

type Call = { name: string; arguments: JsonObject };
type Token = { close: boolean; name: string; attrs: string; start: number; end: number };

/** Drop DeepSeek tool markup from text that a person would read. */
export function stripSpoken(value: string) {
  return takeDsml(value).text.trim();
}

/**
 * Remove DSML from the answer text. Thinking stays, so reasoning_content can be passed back intact.
 * Returns the tool names that were written into the answer. They are not executed.
 */
export function quietDsml(message: AssistantMessage) {
  const notes: string[] = [];
  const content: AssistantMessage["content"] = [];
  for (const part of message.content) {
    if (part.type !== "text") {
      content.push(part);
      continue;
    }
    const taken = takeDsml(part.text);
    for (const call of taken.calls) {
      const command = typeof call.arguments.command === "string" ? call.arguments.command : "";
      notes.push(command ? `${call.name} ${[...command].slice(0, 160).join("")}` : call.name);
    }
    const text = taken.text.trim();
    if (text) content.push({ ...part, text });
  }
  message.content = content.length > 0 ? content : [{ type: "text", text: "" }];
  return notes;
}

function takeDsml(value: string) {
  const fences: string[] = [];
  const masked = value.replace(FENCE, (fence) => {
    fences.push(fence);
    return `\u0000FENCE${fences.length - 1}\u0000`;
  });
  const openFence = masked.indexOf("```");
  const head = openFence === -1 ? masked : masked.slice(0, openFence);
  const tail = openFence === -1 ? "" : masked.slice(openFence);
  const parsed = parseRegion(head.replace(END, ""));
  return {
    text: restore(`${parsed.text}${tail}`, fences),
    calls: parsed.calls,
    found: parsed.found,
  };
}

function parseRegion(source: string) {
  const tokens = scan(source);
  const calls: Call[] = [];
  const cuts: Array<[number, number]> = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (!token.close && isBlock(token.name)) {
      const block = consumeBlock(source, tokens, index);
      cuts.push([token.start, block.end]);
      calls.push(...block.calls);
      index = block.next;
      continue;
    }
    if (!token.close && token.name === "invoke") {
      const invoke = consumeInvoke(source, tokens, index);
      if (invoke?.call) {
        cuts.push([token.start, invoke.end]);
        calls.push(invoke.call);
        index = invoke.next;
        continue;
      }
    }
    index += 1;
  }
  let text = source;
  for (const [start, end] of cuts.sort((left, right) => right[0] - left[0])) {
    text = `${text.slice(0, start)}${text.slice(end)}`;
  }
  const found = cuts.length > 0 || DANGLING.test(text);
  if (DANGLING.test(text)) text = text.replace(/<[\s|｜]{0,4}DSML[\s\S]*$/g, "");
  return { text, calls, found };
}

function scan(source: string) {
  const found: Token[] = [];
  for (const match of source.matchAll(/<(\/)?([|｜]{1,2})\s*DSML\s*\2\s*([A-Za-z_]+)([^>]*)>/g)) {
    found.push({
      close: match[1] === "/",
      name: match[3].toLowerCase(),
      attrs: match[4] ?? "",
      start: match.index ?? 0,
      end: (match.index ?? 0) + match[0].length,
    });
  }
  return found;
}

function consumeBlock(source: string, tokens: Token[], openAt: number) {
  const calls: Call[] = [];
  let index = openAt + 1;
  let end = source.length;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token.close && isBlock(token.name)) {
      end = token.end;
      index += 1;
      break;
    }
    if (!token.close && token.name === "invoke") {
      const invoke = consumeInvoke(source, tokens, index);
      if (invoke) {
        if (invoke.call) calls.push(invoke.call);
        index = invoke.next;
        continue;
      }
    }
    index += 1;
  }
  return { calls, end, next: index };
}

function consumeInvoke(source: string, tokens: Token[], openAt: number) {
  const open = tokens[openAt];
  const name = attr(open.attrs, "name");
  const args: JsonObject = {};
  let index = openAt + 1;
  let end = open.end;
  let closed = false;
  while (index < tokens.length) {
    const token = tokens[index];
    if (token.close && token.name === "invoke") {
      end = token.end;
      closed = true;
      index += 1;
      break;
    }
    if (!token.close && token.name === "parameter") {
      const key = attr(token.attrs, "name");
      const asString = attr(token.attrs, "string") !== "false";
      let cursor = index + 1;
      let valueEnd = token.end;
      let closedParam = false;
      while (cursor < tokens.length) {
        const next = tokens[cursor];
        if (next.close && next.name === "parameter") {
          valueEnd = next.start;
          end = next.end;
          closedParam = true;
          cursor += 1;
          break;
        }
        if (!next.close && (next.name === "parameter" || next.name === "invoke" || isBlock(next.name))) break;
        cursor += 1;
      }
      if (closedParam && key) args[key] = decodeParam(source.slice(token.end, valueEnd), asString);
      index = cursor;
      continue;
    }
    if (!token.close && (token.name === "invoke" || isBlock(token.name))) break;
    index += 1;
  }
  if (!closed || !name) return null;
  return { call: { name, arguments: args }, end, next: index };
}

function decodeParam(body: string, asString: boolean): JsonValue {
  const raw = body.trim();
  if (asString) return raw;
  try {
    return asJson(JSON.parse(raw) as unknown);
  } catch {
    return raw;
  }
}

function asJson(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => asJson(item));
  if (value && typeof value === "object") {
    const out: JsonObject = {};
    for (const [key, item] of Object.entries(value)) out[key] = asJson(item);
    return out;
  }
  return "";
}

function attr(source: string, key: string) {
  const match = new RegExp(`\\b${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(source);
  return (match?.[1] ?? match?.[2] ?? "").trim();
}

function isBlock(name: string) {
  return name === "calls" || name === "tool_calls" || name === "tool_call" || name === "function_calls" || name === "function_call";
}

function restore(value: string, fences: string[]) {
  return value.replace(/\u0000FENCE(\d+)\u0000/g, (_match, index: string) => fences[Number(index)] ?? "");
}

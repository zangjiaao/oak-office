export type Token = { kind: "plain" | "keyword" | "string" | "comment" | "number" | "tag" | "attr"; text: string };

type Mode = { kind: "code" } | { kind: "string"; quote: string } | { kind: "comment"; end: string } | { kind: "tag" };

const JS = words(
  "const let var function return if else for while import from export class extends new this typeof instanceof async await try catch finally throw break continue switch case default of in null undefined true false void type interface implements public private protected readonly enum namespace declare keyof infer never unknown",
);
const PY = words(
  "def class return if elif else for while import from as with try except finally lambda yield pass break continue in not and or is None True False async await raise global nonlocal",
);
const SQL = words(
  "select from where and or insert into values update set delete create table join left right inner on group by order limit as not null in is like distinct primary key index drop alter union having case when then else end",
);
const JSON_WORDS = words("true false null");

const WORDS: Record<string, Set<string>> = { js: JS, py: PY, sql: SQL, json: JSON_WORDS };

export function languageOf(ext: string) {
  if (ext === "py") return "py";
  if (ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs" || ext === "ts" || ext === "tsx") return "js";
  if (ext === "css") return "css";
  if (ext === "html" || ext === "xml" || ext === "svg") return "html";
  if (ext === "json") return "json";
  if (ext === "sql") return "sql";
  if (ext === "sh" || ext === "yml" || ext === "yaml" || ext === "toml") return "hash";
  return "text";
}

export function prettyJson(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export function highlight(text: string, lang: string): Token[][] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let mode: Mode = { kind: "code" };
  return lines.map((line) => {
    const next = lang === "text" ? { toks: [{ kind: "plain" as const, text: line }], mode } : takeLine(line, lang, mode);
    mode = next.mode;
    return next.toks;
  });
}

function takeLine(line: string, lang: string, mode: Mode): { toks: Token[]; mode: Mode } {
  const toks: Token[] = [];
  let i = 0;
  const push = (kind: Token["kind"], text: string) => {
    if (!text) return;
    const last = toks[toks.length - 1];
    if (last && last.kind === kind) last.text += text;
    else toks.push({ kind, text });
  };

  if (mode.kind === "comment") {
    const at = line.indexOf(mode.end);
    if (at < 0) {
      push("comment", line);
      return { toks, mode };
    }
    push("comment", line.slice(0, at + mode.end.length));
    i = at + mode.end.length;
    mode = { kind: "code" };
  } else if (mode.kind === "string") {
    const closed = readString(line, 0, mode.quote);
    push("string", line.slice(0, closed.end));
    i = closed.end;
    if (!closed.closed) return { toks, mode };
    mode = { kind: "code" };
  }

  while (i < line.length) {
    if (lang === "html" && (mode.kind === "tag" || line[i] === "<")) {
      const tag = readTag(line, i, mode.kind === "tag");
      for (const token of tag.toks) push(token.kind, token.text);
      i = tag.end > i ? tag.end : i + 1;
      mode = tag.mode;
      if (tag.done) return { toks, mode };
      continue;
    }
    const comment = openComment(line, i, lang);
    if (comment) {
      if (comment.toEnd) {
        push("comment", line.slice(i));
        return { toks, mode: { kind: "code" } };
      }
      const at = line.indexOf(comment.end, i + 2);
      if (at < 0) {
        push("comment", line.slice(i));
        return { toks, mode: { kind: "comment", end: comment.end } };
      }
      push("comment", line.slice(i, at + comment.end.length));
      i = at + comment.end.length;
      continue;
    }
    const quote = openString(line, i, lang);
    if (quote) {
      const closed = readString(line, i + quote.length, quote);
      push("string", line.slice(i, closed.end));
      i = closed.end;
      if (!closed.closed) return { toks, mode: { kind: "string", quote } };
      continue;
    }
    const number = readNumber(line, i);
    if (number > i) {
      push("number", line.slice(i, number));
      i = number;
      continue;
    }
    const word = readWord(line, i);
    if (word) {
      push(WORDS[lang]?.has(word) ? "keyword" : "plain", word);
      i += word.length;
      continue;
    }
    push("plain", line[i]);
    i += 1;
  }
  return { toks, mode };
}

function readTag(line: string, start: number, inside: boolean): { toks: Token[]; end: number; mode: Mode; done: boolean } {
  const toks: Token[] = [];
  let i = start;
  let mode: Mode = { kind: "tag" };
  const push = (kind: Token["kind"], text: string) => {
    if (!text) return;
    toks.push({ kind, text });
  };
  if (!inside) {
    if (line.startsWith("<!--", i)) {
      const at = line.indexOf("-->", i + 4);
      if (at < 0) return { toks: [{ kind: "comment" as const, text: line.slice(i) }], end: line.length, mode: { kind: "comment" as const, end: "-->" }, done: true };
      return { toks: [{ kind: "comment" as const, text: line.slice(i, at + 3) }], end: at + 3, mode: { kind: "code" as const }, done: false };
    }
    if (line[i] !== "<") return { toks: [], end: i, mode: { kind: "code" as const }, done: false };
    push("plain", "<");
    i += 1;
    if (line[i] === "/") {
      push("plain", "/");
      i += 1;
    }
    const name = readWord(line, i);
    if (name) {
      push("tag", name);
      i += name.length;
    }
  }
  while (i < line.length) {
    const quote = line[i] === '"' || line[i] === "'" ? line[i] : null;
    if (quote) {
      const closed = readString(line, i + 1, quote);
      push("string", line.slice(i, closed.end));
      i = closed.end;
      if (!closed.closed) return { toks, end: i, mode: { kind: "string", quote }, done: true };
      continue;
    }
    if (line[i] === ">") {
      push("plain", ">");
      return { toks, end: i + 1, mode: { kind: "code" }, done: false };
    }
    const word = readWord(line, i);
    if (word) {
      push("attr", word);
      i += word.length;
      continue;
    }
    push("plain", line[i]);
    i += 1;
  }
  return { toks, end: i, mode, done: true };
}

function openComment(line: string, i: number, lang: string) {
  if (lang !== "py" && lang !== "hash" && lang !== "json" && line.startsWith("/*", i)) return { end: "*/", toEnd: false };
  if (lang === "js" && line.startsWith("//", i)) return { end: "", toEnd: true };
  if (lang === "sql" && line.startsWith("--", i)) return { end: "", toEnd: true };
  if ((lang === "py" || lang === "hash") && line[i] === "#") return { end: "", toEnd: true };
  return null;
}

function openString(line: string, i: number, lang: string) {
  if (lang === "py" && (line.startsWith('"""', i) || line.startsWith("'''", i))) return line.slice(i, i + 3);
  const mark = line[i];
  if (mark === '"' || mark === "'") return mark;
  if (lang === "js" && mark === "`") return mark;
  return null;
}

function readString(line: string, i: number, quote: string) {
  let j = i;
  while (j < line.length) {
    if (line.startsWith(quote, j)) return { end: j + quote.length, closed: true };
    if (line[j] === "\\" && quote.length === 1) {
      j += 2;
      continue;
    }
    j += 1;
  }
  return { end: line.length, closed: false };
}

function readNumber(line: string, i: number) {
  if (i > 0 && /[\w.]/.test(line[i - 1])) return i;
  let j = i;
  if (line[j] === "." && /\d/.test(line[j + 1] ?? "")) j += 1;
  if (!/\d/.test(line[j] ?? "")) return i;
  while (j < line.length && /[\d.]/.test(line[j])) j += 1;
  return j;
}

function readWord(line: string, i: number) {
  const match = /^[A-Za-z_][\w]*/.exec(line.slice(i));
  return match ? match[0] : "";
}

function words(list: string) {
  return new Set(list.split(" "));
}

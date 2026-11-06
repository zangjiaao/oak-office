export type Inline =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "link"; text: string; href: string }
  | { kind: "break" };

export type Block =
  | { kind: "p"; children: Inline[] }
  | { kind: "h"; level: 1 | 2 | 3; children: Inline[] }
  | { kind: "pre"; text: string }
  | { kind: "ul"; items: Inline[][] }
  | { kind: "ol"; items: Inline[][] }
  | { kind: "quote"; children: Inline[] };

export function parseMarkdown(source: string): Block[] {
  const text = source.replace(/\r\n/g, "\n");
  const blocks: Block[] = [];
  const fence = /```([^\n]*)\n?([\s\S]*?)```/g;
  let cursor = 0;
  for (const match of text.matchAll(fence)) {
    const start = match.index ?? 0;
    pushFlow(blocks, text.slice(cursor, start));
    blocks.push({ kind: "pre", text: match[2].replace(/\n$/, "") });
    cursor = start + match[0].length;
  }
  const rest = text.slice(cursor);
  const open = rest.indexOf("```");
  if (open === -1) pushFlow(blocks, rest);
  else {
    pushFlow(blocks, rest.slice(0, open));
    blocks.push({ kind: "pre", text: rest.slice(open + 3).replace(/^\n/, "").replace(/\n$/, "") });
  }
  return blocks;
}

function pushFlow(blocks: Block[], source: string) {
  const lines = source.split("\n");
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.trim() === "") {
      index += 1;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "h", level: heading[1].length as 1 | 2 | 3, children: inline(heading[2]) });
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quoted: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoted.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", children: inline(quoted.join("\n")) });
      continue;
    }
    const bullet = /^[-*]\s+/.test(line);
    const ordered = /^\d+\.\s+/.test(line);
    if (bullet || ordered) {
      const items: Inline[][] = [];
      const marker = bullet ? /^[-*]\s+/ : /^\d+\.\s+/;
      while (index < lines.length && marker.test(lines[index])) {
        items.push(inline(lines[index].replace(marker, "")));
        index += 1;
      }
      blocks.push({ kind: bullet ? "ul" : "ol", items });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() !== "" && !special(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push({ kind: "p", children: inline(paragraph.join("\n")) });
  }
}

function special(line: string) {
  return /^(#{1,3})\s+/.test(line) || /^>\s?/.test(line) || /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line);
}

export function inline(source: string): Inline[] {
  return readInline(source, 0);
}

function readInline(source: string, depth: number): Inline[] {
  const nodes: Inline[] = [];
  let text = "";
  const flush = () => {
    if (!text) return;
    nodes.push({ kind: "text", text });
    text = "";
  };
  for (let i = 0; i < source.length; i += 1) {
    if (source[i] === "\n") {
      flush();
      nodes.push({ kind: "break" });
      continue;
    }
    if (source.startsWith("**", i) || source.startsWith("__", i)) {
      const mark = source.slice(i, i + 2);
      const end = source.indexOf(mark, i + 2);
      if (end !== -1 && depth < 4) {
        flush();
        nodes.push({ kind: "strong", children: readInline(source.slice(i + 2, end), depth + 1) });
        i = end + 1;
        continue;
      }
    }
    if ((source[i] === "*" || source[i] === "_") && source[i + 1] !== source[i]) {
      const mark = source[i];
      const end = source.indexOf(mark, i + 1);
      if (end !== -1 && depth < 4 && !source.slice(i + 1, end).includes("\n")) {
        flush();
        nodes.push({ kind: "em", children: readInline(source.slice(i + 1, end), depth + 1) });
        i = end;
        continue;
      }
    }
    if (source[i] === "`") {
      const end = source.indexOf("`", i + 1);
      if (end !== -1) {
        flush();
        nodes.push({ kind: "code", text: source.slice(i + 1, end) });
        i = end;
        continue;
      }
    }
    if (source[i] === "[") {
      const link = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/.exec(source.slice(i));
      if (link) {
        flush();
        nodes.push({ kind: "link", text: link[1], href: link[2] });
        i += link[0].length - 1;
        continue;
      }
    }
    text += source[i];
  }
  flush();
  return nodes;
}

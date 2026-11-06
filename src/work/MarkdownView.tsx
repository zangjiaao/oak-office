import type { ReactNode } from "react";
import { parseMarkdown, type Inline } from "./markdown";

export function Markdown({ text }: { text: string }) {
  return <div className="md">{parseMarkdown(text).map((block, index) => drawBlock(block, index))}</div>;
}

function drawBlock(block: ReturnType<typeof parseMarkdown>[number], key: number) {
  if (block.kind === "pre") {
    return (
      <pre key={key}>
        <code>{block.text}</code>
      </pre>
    );
  }
  if (block.kind === "h") {
    const Tag = `h${block.level}` as "h1" | "h2" | "h3";
    return <Tag key={key}>{drawInline(block.children)}</Tag>;
  }
  if (block.kind === "ul" || block.kind === "ol") {
    const Tag = block.kind;
    return (
      <Tag key={key}>
        {block.items.map((item, index) => (
          <li key={index}>{drawInline(item)}</li>
        ))}
      </Tag>
    );
  }
  if (block.kind === "quote") return <blockquote key={key}>{drawInline(block.children)}</blockquote>;
  return <p key={key}>{drawInline(block.children)}</p>;
}

function drawInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, index) => {
    if (node.kind === "text") return node.text;
    if (node.kind === "break") return <br key={index} />;
    if (node.kind === "code") return <code key={index}>{node.text}</code>;
    if (node.kind === "strong") return <strong key={index}>{drawInline(node.children)}</strong>;
    if (node.kind === "em") return <em key={index}>{drawInline(node.children)}</em>;
    return (
      <a key={index} href={node.href} target="_blank" rel="noreferrer">
        {node.text}
      </a>
    );
  });
}

import { memo, type CSSProperties } from "react";
import { highlight, languageOf, prettyJson } from "./highlight";

export const CodeView = memo(function CodeView({ text, ext }: { text: string; ext: string }) {
  const source = ext === "json" ? prettyJson(text) : text;
  const lines = highlight(source, languageOf(ext));
  return (
    <div className="code" style={{ "--ln": `${String(lines.length).length}ch` } as CSSProperties}>
      {lines.map((tokens, index) => (
        <div className="row" key={index}>
          <span className="ln" aria-hidden="true">
            {index + 1}
          </span>
          <code>
            {tokens.map((token, tokenIndex) =>
              token.kind === "plain" ? token.text : (
                <span key={tokenIndex} className={token.kind}>
                  {token.text}
                </span>
              ),
            )}
          </code>
        </div>
      ))}
    </div>
  );
});

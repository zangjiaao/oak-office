import { useEffect, useState } from "react";
import { Markdown } from "../work/MarkdownView";

type Entry = { name: string; kind: "dir" | "file"; bytes: number };

const TEXT = new Set([
  "md",
  "markdown",
  "txt",
  "json",
  "csv",
  "tsv",
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "css",
  "html",
  "yml",
  "yaml",
  "toml",
  "sql",
  "sh",
  "log",
  "xml",
  "svg",
]);

export function ScreenDesk({ title, onClose }: { title: string; onClose: () => void }) {
  const [folder, setFolder] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let gone = false;
    setEntries(null);
    setError(null);
    void listFiles(folder)
      .then((rows) => {
        if (!gone) setEntries(rows);
      })
      .catch((caught) => {
        if (!gone) setError(caught instanceof Error ? caught.message : "工作区没打开。");
      });
    return () => {
      gone = true;
    };
  }, [folder]);

  async function openFile(name: string) {
    const path = joinPath(folder, name);
    setFile(path);
    setText(null);
    setNote(null);
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    if (!TEXT.has(ext)) {
      setNote("这个文件不能在屏幕里打开，可以下载。");
      return;
    }
    try {
      const body = await readText(path);
      setText(body);
    } catch (caught) {
      setNote(caught instanceof Error ? caught.message : "文件没打开。");
    }
  }

  async function download(name: string) {
    const path = joinPath(folder, name);
    setError(null);
    try {
      const response = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`);
      if (!response.ok) throw new Error(await errorText(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "文件没下载下来。");
    }
  }

  const crumbs = folder ? folder.split("/") : [];

  return (
    <div className="monitor" role="dialog" aria-label={title}>
      <header>
        <strong>{title}</strong>
        <button type="button" onClick={onClose}>
          离开电脑
        </button>
      </header>
      <p className="crumbs">
        <button type="button" onClick={() => setFolder("")}>
          工作区
        </button>
        {crumbs.map((part, index) => {
          const path = crumbs.slice(0, index + 1).join("/");
          return (
            <button key={path} type="button" onClick={() => setFolder(path)}>
              {part}
            </button>
          );
        })}
      </p>
      <div className="monitor-body">
        <ul>
          {error ? <li className="file-error">{error}</li> : null}
          {entries === null && !error ? <li>在读工作区。</li> : null}
          {entries && entries.length === 0 ? <li>工作区还是空的。</li> : null}
          {entries?.map((entry) => (
            <li key={entry.name}>
              <button
                type="button"
                onClick={() => (entry.kind === "dir" ? setFolder(joinPath(folder, entry.name)) : void openFile(entry.name))}
              >
                {entry.kind === "dir" ? `${entry.name}/` : entry.name}
              </button>
              {entry.kind === "file" ? (
                <button type="button" onClick={() => void download(entry.name)}>
                  下载
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <article>
          {file ? <h2>{file.split("/").pop()}</h2> : <p>点一个文件，在屏幕里看。</p>}
          {note ? <p>{note}</p> : null}
          {text !== null && file?.endsWith(".md") ? <Markdown text={text} /> : null}
          {text !== null && file && !file.endsWith(".md") ? <pre>{text}</pre> : null}
          {file && text === null && !note ? <p>在打开。</p> : null}
        </article>
      </div>
    </div>
  );
}

function joinPath(folder: string, name: string) {
  return folder ? `${folder}/${name}` : name;
}

async function listFiles(folder: string) {
  const response = await fetch(`/api/workspace?path=${encodeURIComponent(folder)}`);
  if (!response.ok) throw new Error(await errorText(response));
  const body = (await response.json()) as { entries?: Entry[] };
  return body.entries ?? [];
}

async function readText(path: string) {
  const response = await fetch(`/api/workspace/text?path=${encodeURIComponent(path)}`);
  if (!response.ok) throw new Error(await errorText(response));
  const body = (await response.json()) as { text?: string };
  return body.text ?? "";
}

async function errorText(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* An empty status still needs a sentence. */
  }
  return "工作区没打开。";
}

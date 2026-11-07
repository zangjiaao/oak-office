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

export function ScreenDesk({
  title,
  onClose,
  box,
}: {
  title: string;
  onClose: () => void;
  box: { left: number; top: number; width: number; height: number };
}) {
  const [clock, setClock] = useState(() => deskClock());
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
    const timer = setInterval(() => setClock(deskClock()), 1000);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearInterval(timer);
    };
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
    <div className="desk-screen">
      <button type="button" className="desk-dim" aria-label="离开电脑" onClick={onClose} />
      <div className="computer" role="dialog" aria-label={title} style={box}>
        <div className="bezel">
          <i className="camera" />
          <div className="glass">
            <header className="menu-bar">
              <strong>{title}</strong>
              <span>工作区</span>
              <time>{clock}</time>
              <button type="button" onClick={onClose}>
                关机
              </button>
            </header>
            <div className="desktop">
              <aside>
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
                <ul>
                  {error ? <li>{error}</li> : null}
                  {entries === null && !error ? <li>在读工作区。</li> : null}
                  {entries && entries.length === 0 ? <li>工作区还是空的。</li> : null}
                  {entries?.map((entry) => {
                    const path = joinPath(folder, entry.name);
                    return (
                      <li key={entry.name} className={file === path ? "on" : ""}>
                        <button
                          type="button"
                          onClick={() => (entry.kind === "dir" ? setFolder(path) : void openFile(entry.name))}
                        >
                          {entry.kind === "dir" ? `${entry.name}/` : entry.name}
                        </button>
                        {entry.kind === "file" ? (
                          <button type="button" onClick={() => void download(entry.name)}>
                            下载
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </aside>
              <section className="window">
                <header>
                  <i />
                  <i />
                  <i />
                  <span>{file ? file.split("/").pop() : "未打开文件"}</span>
                </header>
                <article>
                  {file ? null : <p>点左边的文件，在屏幕里看。</p>}
                  {note ? <p>{note}</p> : null}
                  {text !== null && (file?.endsWith(".md") || file?.endsWith(".markdown")) ? <Markdown text={text} /> : null}
                  {text !== null && file && !file.endsWith(".md") && !file.endsWith(".markdown") ? <pre>{text}</pre> : null}
                  {file && text === null && !note ? <p>在打开。</p> : null}
                </article>
              </section>
            </div>
          </div>
        </div>
        <div className="chin">
          <i />
        </div>
        <div className="stand" />
      </div>
    </div>
  );
}

function deskClock() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
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

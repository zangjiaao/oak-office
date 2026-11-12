import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CodeView } from "./CodeView";
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

type ShellRun = {
  id: string;
  command: string;
  output: string;
  exitCode: number | null;
  finishedAt: number | null;
};

export function ScreenDesk({
  title,
  personId,
  onClose,
  box,
}: {
  title: string;
  personId: string | null;
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
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [night, setNight] = useState(previewNight);
  const [pane, setPane] = useState<"files" | "term">("files");
  const [runs, setRuns] = useState<ShellRun[] | null>(null);
  const [shellError, setShellError] = useState<string | null>(null);
  const termRef = useRef<HTMLDivElement>(null);
  const panePick = useRef(false);
  const followTail = useRef(true);

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
    setPending(null);
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
  }, [folder, reload]);

  useEffect(() => {
    if (!personId) return;
    let gone = false;
    const load = () => {
      void fetch(`/api/shell?person=${encodeURIComponent(personId)}`)
        .then(async (response) => {
          if (!response.ok) throw new Error(await errorText(response));
          return (await response.json()) as { runs?: ShellRun[] };
        })
        .then((body) => {
          if (gone) return;
          const next = body.runs ?? [];
          setRuns(next);
          setShellError(null);
          if (!panePick.current && next.some((run) => run.finishedAt === null)) setPane("term");
        })
        .catch((caught) => {
          if (!gone) setShellError(caught instanceof Error ? caught.message : "终端没打开。");
        });
    };
    load();
    const timer = setInterval(load, 1000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [personId]);

  useLayoutEffect(() => {
    if (pane === "term") followTail.current = true;
  }, [pane]);

  useLayoutEffect(() => {
    const node = termRef.current;
    if (!node || pane !== "term" || !followTail.current) return;
    const pin = () => {
      if (followTail.current) node.scrollTop = node.scrollHeight;
    };
    pin();
    const frame = requestAnimationFrame(pin);
    return () => cancelAnimationFrame(frame);
  }, [runs, pane]);

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

  async function remove(name: string) {
    const path = joinPath(folder, name);
    if (pending !== path) {
      setPending(path);
      return;
    }
    setPending(null);
    setError(null);
    try {
      const response = await fetch(`/api/workspace/file?path=${encodeURIComponent(path)}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await errorText(response));
      if (file === path) {
        setFile(null);
        setText(null);
        setNote(null);
      }
      setReload((value) => value + 1);
    } catch (caught) {
      setPending(null);
      setError(caught instanceof Error ? caught.message : "文件没删掉。");
    }
  }

  function onTermScroll() {
    const node = termRef.current;
    if (!node) return;
    followTail.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48;
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
              <button
                type="button"
                className={pane === "files" ? "on" : ""}
                onClick={() => {
                  panePick.current = true;
                  setPane("files");
                }}
              >
                工作区
              </button>
              <button
                type="button"
                className={pane === "term" ? "on" : ""}
                onClick={() => {
                  panePick.current = true;
                  setPane("term");
                }}
              >
                终端
              </button>
              <time>{clock}</time>
              <button type="button" onClick={onClose}>
                关机
              </button>
            </header>
            <div className={pane === "term" ? "desktop term" : "desktop"}>
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
                          <span className="file-actions">
                            <button type="button" aria-label="下载" onClick={() => void download(entry.name)}>
                              <DownloadIcon />
                            </button>
                            <button
                              type="button"
                              className={pending === path ? "armed" : ""}
                              aria-label={pending === path ? "确认删除" : "删除"}
                              onClick={() => void remove(entry.name)}
                            >
                              <TrashIcon />
                            </button>
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </aside>
              <section className={night ? "window night" : "window"}>
                <header>
                  <i />
                  <i />
                  <i />
                  <span>{file ? file.split("/").pop() : "未打开文件"}</span>
                  <button
                    type="button"
                    className="night-toggle"
                    aria-label={night ? "白天" : "黑夜"}
                    onClick={() =>
                      setNight((value) => {
                        const next = !value;
                        savePreviewNight(next);
                        return next;
                      })
                    }
                  >
                    {night ? <SunIcon /> : <MoonIcon />}
                  </button>
                </header>
                <article>
                  {file ? null : <p>点左边的文件，在屏幕里看。</p>}
                  {note ? <p>{note}</p> : null}
                  {text !== null && markdown(file) ? <Markdown text={text} /> : null}
                  {text !== null && file && !markdown(file) ? <CodeView text={text} ext={extension(file)} /> : null}
                  {file && text === null && !note ? <p>在打开。</p> : null}
                </article>
              </section>
              {pane === "term" ? (
                <div className="term-view" ref={termRef} onScroll={onTermScroll}>
                  {!personId ? <p>这台电脑还没有人。</p> : null}
                  {shellError ? <p>{shellError}</p> : null}
                  {personId && runs === null && !shellError ? <p>在读终端。</p> : null}
                  {runs && runs.length === 0 ? <p>还没有跑过命令。</p> : null}
                  {runs?.map((run) => (
                    <div key={run.id}>
                      <p className="cmd">$ {run.command}</p>
                      {run.output ? <p>{run.output}</p> : null}
                      {run.finishedAt === null ? <p className="run">运行中</p> : null}
                      {run.finishedAt !== null && run.exitCode ? <p className="bad">退出码 {run.exitCode}</p> : null}
                    </div>
                  ))}
                </div>
              ) : null}
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

function DownloadIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.5v7M5.2 7.2 8 10l2.8-2.8M3.2 13h9.6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.2 4.2h9.6M6.2 4.2V2.8h3.6v1.4M4.6 4.2l.6 9h5.6l.6-9" />
    </svg>
  );
}

function previewNight() {
  try {
    return localStorage.getItem("oak-preview-night") === "1";
  } catch {
    return false;
  }
}

function savePreviewNight(night: boolean) {
  try {
    localStorage.setItem("oak-preview-night", night ? "1" : "0");
  } catch {
    /* A private window can refuse the preference. */
  }
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M10.2 2.2a5.2 5.2 0 1 0 3.6 8.8 4.4 4.4 0 0 1-3.6-8.8Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="2.3" />
      <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.5 3.5l1.1 1.1M11.4 11.4l1.1 1.1M12.5 3.5l-1.1 1.1M4.6 11.4l-1.1 1.1" />
    </svg>
  );
}

function deskClock() {
  return new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function markdown(file: string | null) {
  return file?.endsWith(".md") || file?.endsWith(".markdown") || false;
}

function extension(file: string) {
  return file.split(".").pop()?.toLowerCase() ?? "";
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

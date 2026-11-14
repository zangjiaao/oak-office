import { useEffect, useState, type CSSProperties } from "react";

type Task = {
  id: string;
  title: string;
  person_id: string | null;
  state: "open" | "doing" | "done";
  created_at: number;
};

const RANK = { doing: 0, open: 1, done: 2 };

export function BoardDesk({
  departmentId,
  people,
  box,
  face,
  onClose,
}: {
  departmentId: string;
  people: { id: string; name: string }[];
  box: { left: number; top: number; width: number; height: number };
  face: string;
  onClose: () => void;
}) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftOwner, setDraftOwner] = useState("");

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let gone = false;
    const load = () => {
      void listTasks(departmentId)
        .then((nextTasks) => {
          if (gone) return;
          setTasks(nextTasks);
          setError(null);
        })
        .catch((caught) => {
          if (!gone) setError(caught instanceof Error ? caught.message : "看板没打开。");
        });
    };
    load();
    const timer = setInterval(load, 2000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [departmentId]);

  async function addTask(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const task = await createTask(departmentId, title, owner);
      setTasks((current) => [...(current ?? []), task]);
      setTitle("");
      setOwner("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "这件事没记上。");
    }
  }

  function beginEdit(task: Task) {
    setError(null);
    setEditing(task.id);
    setDraftTitle(task.title);
    setDraftOwner(task.person_id ?? "");
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      const task = await patchTask(departmentId, editing, draftTitle, draftOwner);
      setTasks((current) => (current ?? []).map((item) => (item.id === task.id ? task : item)));
      setEditing(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "这件事没改成。");
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await deleteTask(departmentId, id);
      setTasks((current) => (current ?? []).filter((item) => item.id !== id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "这件事没去掉。");
    }
  }

  const rows = [...(tasks ?? [])].sort((a, b) => RANK[a.state] - RANK[b.state] || a.created_at - b.created_at);

  return (
    <div className="desk-screen">
      <button type="button" className="desk-dim" aria-label="离开看板" onClick={onClose} />
      <section
        className="slate"
        role="dialog"
        aria-label="看板"
        style={{ ...box, backgroundColor: face, color: ink(face) } as CSSProperties}
      >
        <header>
          <strong>看板</strong>
          <button type="button" aria-label="关上" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <div className="slate-body">
          {error ? <p className="quiet">{error}</p> : null}
          {rows.length > 0 ? (
            <ul>
              {rows.map((task, index) => (
                <li
                  key={task.id}
                  className={`pin tone-${index % 3}${task.state === "done" ? " done" : ""}${editing === task.id ? " editing" : ""}`}
                >
                  {editing === task.id ? (
                    <form onSubmit={(event) => void saveEdit(event)}>
                      <small>{stateName(task.state)}</small>
                      <input
                        value={draftTitle}
                        maxLength={80}
                        aria-label="改这件事"
                        onChange={(event) => setDraftTitle(event.target.value)}
                      />
                      <select aria-label="负责人" value={draftOwner} onChange={(event) => setDraftOwner(event.target.value)}>
                        <option value="">不指定</option>
                        {people.map((person) => (
                          <option key={person.id} value={person.id}>
                            {person.name}
                          </option>
                        ))}
                      </select>
                      <span className="slate-actions">
                        <button type="submit" aria-label="改好">
                          <CheckIcon />
                        </button>
                        <button type="button" aria-label="取消" onClick={() => setEditing(null)}>
                          <CloseIcon />
                        </button>
                      </span>
                    </form>
                  ) : (
                    <>
                      <span>
                        <small>
                          {stateName(task.state)} · {personName(people, task.person_id)}
                        </small>
                        <b>{task.title}</b>
                      </span>
                      <span className="slate-actions">
                        <button type="button" aria-label="编辑" onClick={() => beginEdit(task)}>
                          <PencilIcon />
                        </button>
                        <button type="button" aria-label="去掉" onClick={() => void remove(task.id)}>
                          <TrashIcon />
                        </button>
                      </span>
                    </>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <form onSubmit={(event) => void addTask(event)}>
          <input
            value={title}
            maxLength={80}
            placeholder="记一件事"
            aria-label="记一件事"
            onChange={(event) => setTitle(event.target.value)}
          />
          <select aria-label="负责人" value={owner} onChange={(event) => setOwner(event.target.value)}>
            <option value="">不指定</option>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
          <button type="submit">记下</button>
        </form>
      </section>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M9.2 2.6 13.4 6.8 5.2 15H1.2v-4Z" />
      <path d="M8 3.8 12.2 8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.4 8.2 6.6 11.4 12.6 4.6" />
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

function ink(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const bright = ((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114;
  return bright > 150000 ? "#1a1714" : "#f4f7fb";
}

function personName(people: { id: string; name: string }[], id: string | null) {
  if (!id) return "不指定";
  return people.find((person) => person.id === id)?.name ?? "已离开";
}

function stateName(state: Task["state"]) {
  if (state === "doing") return "在做";
  if (state === "done") return "划掉";
  return "还没做";
}

async function listTasks(departmentId: string) {
  const response = await fetch(`/api/board?department=${encodeURIComponent(departmentId)}`);
  if (!response.ok) throw new Error(await errorText(response));
  const body = (await response.json()) as { tasks?: Task[] };
  return body.tasks ?? [];
}

async function createTask(departmentId: string, title: string, personId: string) {
  const response = await fetch("/api/board", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ departmentId, title, personId }),
  });
  if (!response.ok) throw new Error(await errorText(response));
  const body = (await response.json()) as { task: Task };
  return body.task;
}

async function patchTask(departmentId: string, id: string, title: string, personId: string) {
  const response = await fetch(`/api/board/${id}?department=${encodeURIComponent(departmentId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, personId }),
  });
  if (!response.ok) throw new Error(await errorText(response));
  const body = (await response.json()) as { task: Task };
  return body.task;
}

async function deleteTask(departmentId: string, id: string) {
  const response = await fetch(`/api/board/${id}?department=${encodeURIComponent(departmentId)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await errorText(response));
}

async function errorText(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) return body.error;
  } catch {
    /* An empty status still needs a sentence. */
  }
  return "看板没打开。";
}

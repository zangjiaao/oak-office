import { useEffect, useState, type CSSProperties } from "react";
import { everyLabel, listDuties, type Duty } from "../work/duty";

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
  const [duties, setDuties] = useState<Duty[] | null>(null);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [now, setNow] = useState(() => Date.now());

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
      void Promise.all([listDuties(departmentId), listTasks(departmentId)])
        .then(([nextDuties, nextTasks]) => {
          if (gone) return;
          setDuties(nextDuties);
          setTasks(nextTasks);
          setNow(Date.now());
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

  async function mark(id: string, state: Task["state"]) {
    setError(null);
    try {
      const task = await patchTask(departmentId, id, state);
      setTasks((current) => (current ?? []).map((item) => (item.id === id ? task : item)));
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
        style={
          {
            ...box,
            backgroundColor: face,
            backgroundImage:
              "radial-gradient(rgba(255,255,255,0.22) 0.6px, transparent 0.7px), radial-gradient(rgba(0,0,0,0.16) 0.6px, transparent 0.7px)",
            backgroundSize: "5px 5px, 8px 8px",
            backgroundPosition: "0 0, 2px 3px",
            color: ink(face),
          } as CSSProperties
        }
      >
        <header>
          <strong>看板</strong>
          <button type="button" onClick={onClose}>
            关上
          </button>
        </header>
        <div className="slate-body">
          {error ? <p className="quiet">{error}</p> : null}
          <h2>定时</h2>
          <ul>
            {duties === null && !error ? <li className="quiet">在读定时。</li> : null}
            {duties && duties.length === 0 ? <li className="quiet">还没有定时。</li> : null}
            {duties?.map((duty, index) => (
              <li key={duty.id} className={`pin tone-${index % 3}`}>
                <span>
                  <small>
                    {personName(people, duty.person_id)} · {everyLabel(duty.every_ms)}
                  </small>
                  <b>{duty.task}</b>
                </span>
                <em>{duty.next_at <= now ? "在做" : nextLabel(duty.next_at)}</em>
              </li>
            ))}
          </ul>
          <h2>这件事</h2>
          <ul>
            {tasks === null && !error ? <li className="quiet">在读板上的事。</li> : null}
            {tasks && tasks.length === 0 ? <li className="quiet">还没有要记的事。</li> : null}
            {rows.map((task, index) => (
              <li key={task.id} className={task.state === "done" ? `pin tone-${index % 3} done` : `pin tone-${index % 3}`}>
                <span>
                  <small>
                    {stateName(task.state)} · {personName(people, task.person_id)}
                  </small>
                  <b>{task.title}</b>
                </span>
                <span className="slate-actions">
                  {task.state !== "doing" ? (
                    <button type="button" onClick={() => void mark(task.id, "doing")}>
                      在做
                    </button>
                  ) : null}
                  {task.state !== "open" ? (
                    <button type="button" onClick={() => void mark(task.id, "open")}>
                      还没做
                    </button>
                  ) : null}
                  {task.state !== "done" ? (
                    <button type="button" onClick={() => void mark(task.id, "done")}>
                      划掉
                    </button>
                  ) : null}
                  <button type="button" onClick={() => void remove(task.id)}>
                    去掉
                  </button>
                </span>
              </li>
            ))}
          </ul>
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

function nextLabel(nextAt: number) {
  return `下次 ${new Date(nextAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
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

async function patchTask(departmentId: string, id: string, state: Task["state"]) {
  const response = await fetch(`/api/board/${id}?department=${encodeURIComponent(departmentId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state }),
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

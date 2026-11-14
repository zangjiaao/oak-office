import { useEffect, useState, type FormEvent } from "react";
import { currentSession, listColleagues, removeColleague, saveColleague, type Colleague, type Session } from "./colleague";

export function Colleagues() {
  const [rows, setRows] = useState<Colleague[] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let gone = false;
    void Promise.all([listColleagues(), currentSession()])
      .then(([next, me]) => {
        if (gone) return;
        setRows(next);
        setSession(me);
      })
      .catch((caught) => {
        if (!gone) setError(caught instanceof Error ? caught.message : "同事没连上。");
      });
    return () => {
      gone = true;
    };
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await saveColleague(email, name);
      setRows((current) => {
        const rest = (current ?? []).filter((row) => row.email !== saved.email);
        return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name, "zh"));
      });
      setSession((current) => (current?.email === saved.email ? { ...current, name: saved.name } : current));
      setEmail("");
      setName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "这位同事没记下。");
    } finally {
      setSaving(false);
    }
  }

  async function drop(target: string) {
    setSaving(true);
    setError(null);
    try {
      await removeColleague(target);
      setRows((current) => (current ?? []).filter((row) => row.email !== target));
      setSession((current) => (current?.email === target ? { email: target, name: null } : current));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "这位同事没去掉。");
    } finally {
      setSaving(false);
    }
  }

  const here = session?.email ? (rows?.find((row) => row.email === session.email)?.name ?? session.name) : null;

  return (
    <section className="colleagues">
      <h3>同事</h3>
      <p className="hint">
        {session?.email
          ? here
            ? `你现在是 ${here}（${session.email}）。`
            : `你现在是 ${session.email}，还没起名。`
          : "Access 进来之后，邮箱会出现在这里。"}
        对上名字后，跟主管说话就显示这个名字。
      </p>
      {rows && rows.length > 0 ? (
        <ul className="memories">
          {rows.map((row) => (
            <li key={row.email}>
              <p>
                {row.name}
                <em>{row.email}</em>
              </p>
              <button type="button" onClick={() => void drop(row.email)} disabled={saving}>
                去掉
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form className="file" onSubmit={(event) => void save(event)}>
        <label>
          邮箱
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="off" maxLength={254} />
        </label>
        <label>
          名字
          <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="off" maxLength={16} />
        </label>
        {error ? <p className="file-error">{error}</p> : null}
        <button type="submit" disabled={saving || email.trim() === "" || name.trim() === ""}>
          记下
        </button>
      </form>
    </section>
  );
}

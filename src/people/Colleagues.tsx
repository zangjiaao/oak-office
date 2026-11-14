import { useEffect, useState, type FormEvent } from "react";
import { currentSession, listColleagues, removeColleague, saveColleague, type Colleague, type Session } from "./colleague";
import { Dialog } from "./Dialog";

export function Colleagues({ suspended, onBegin }: { suspended: boolean; onBegin: () => void }) {
  const [rows, setRows] = useState<Colleague[] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState<{ email: string; name: string; fresh: boolean } | null>(null);
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

  useEffect(() => {
    if (suspended) setDraft(null);
  }, [suspended]);

  function beginCreate() {
    onBegin();
    setDraft({ email: "", name: "", fresh: true });
    setError(null);
  }

  function beginEdit(row: Colleague) {
    onBegin();
    setDraft({ email: row.email, name: row.name, fresh: false });
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await saveColleague(draft.email, draft.name);
      setRows((current) => {
        const rest = (current ?? []).filter((row) => row.email !== saved.email);
        return [...rest, saved].sort((a, b) => a.name.localeCompare(b.name, "zh"));
      });
      setSession((current) => (current?.email === saved.email ? { ...current, name: saved.name } : current));
      setDraft(null);
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
      setDraft((current) => (current?.email === target ? null : current));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "这位同事没去掉。");
    } finally {
      setSaving(false);
    }
  }

  const here = session?.email ? (rows?.find((row) => row.email === session.email)?.name ?? session.name) : null;

  return (
    <section className="roster-section colleagues">
      <header>
        <h3>同事</h3>
        <button type="button" onClick={beginCreate}>
          记下
        </button>
      </header>
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
              <button type="button" className="who" onClick={() => beginEdit(row)}>
                {row.name}
                <em>{row.email}</em>
              </button>
              <button type="button" onClick={() => void drop(row.email)} disabled={saving}>
                去掉
              </button>
            </li>
          ))}
        </ul>
      ) : rows ? (
        <p className="empty">还没有记下名字。</p>
      ) : null}
      {error && !draft ? <p className="file-error">{error}</p> : null}
      {draft ? (
        <Dialog title={draft.fresh ? "记下名字" : "改名字"} onClose={() => setDraft(null)}>
          <form className="sheet-form" onSubmit={(event) => void save(event)}>
            <header>
              <strong>{draft.fresh ? "记下名字" : "改名字"}</strong>
              <button type="button" className="close" onClick={() => setDraft(null)} disabled={saving}>
                取消
              </button>
            </header>
            <div className="body file">
              <label>
                邮箱
                <input
                  value={draft.email}
                  onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                  type="email"
                  autoComplete="off"
                  maxLength={254}
                  readOnly={!draft.fresh}
                  autoFocus={draft.fresh}
                />
              </label>
              <label>
                名字
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  autoComplete="off"
                  maxLength={16}
                  autoFocus={!draft.fresh}
                />
              </label>
              {error ? <p className="file-error">{error}</p> : null}
            </div>
            <footer>
              <button type="submit" className="save" disabled={saving || draft.email.trim() === "" || draft.name.trim() === ""}>
                记下
              </button>
            </footer>
          </form>
        </Dialog>
      ) : null}
    </section>
  );
}

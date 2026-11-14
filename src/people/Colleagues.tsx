import { useEffect, useState, type FormEvent } from "react";
import { currentSession, listColleagues, removeColleague, saveColleague, type Colleague, type Session } from "./colleague";
import { Dialog } from "./Dialog";
import { CloseIcon, PlusIcon } from "./icons";

export function Colleagues({ suspended, onBegin }: { suspended: boolean; onBegin: () => void }) {
  const [rows, setRows] = useState<Colleague[] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [draft, setDraft] = useState<{ email: string; name: string; fresh: boolean } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
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
    if (!suspended) return;
    setDraft(null);
    setChosen(null);
    setRemoving(false);
  }, [suspended]);

  function beginCreate() {
    onBegin();
    setChosen(null);
    setRemoving(false);
    setDraft({ email: "", name: "", fresh: true });
    setError(null);
  }

  function beginEdit(row: Colleague) {
    onBegin();
    setChosen(row.email);
    setRemoving(false);
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

  async function drop() {
    if (!draft || draft.fresh || saving) return;
    if (!removing) {
      setRemoving(true);
      setError(null);
      return;
    }
    const target = draft.email;
    setSaving(true);
    setError(null);
    try {
      await removeColleague(target);
      setRows((current) => (current ?? []).filter((row) => row.email !== target));
      setSession((current) => (current?.email === target ? { email: target, name: null } : current));
      setChosen(null);
      setDraft(null);
      setRemoving(false);
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
        <button type="button" className="icon" aria-label="记下" onClick={beginCreate}>
          <PlusIcon />
        </button>
      </header>
      {rows && rows.length > 0 ? (
        <ul className="people">
          {rows.map((row) => (
            <li key={row.email}>
              <button type="button" className={chosen === row.email ? "on" : ""} onClick={() => beginEdit(row)}>
                <b>{row.name}</b>
                <em>{row.email}</em>
              </button>
            </li>
          ))}
        </ul>
      ) : rows ? (
        <p className="empty">
          {session?.email
            ? here
              ? `你现在是 ${here}（${session.email}）。`
              : `你现在是 ${session.email}，还没起名。`
            : "Access 进来之后，邮箱会出现在这里。"}
          对上名字后，跟主管说话就显示这个名字。
        </p>
      ) : null}
      {error && !draft ? <p className="file-error">{error}</p> : null}
      {draft ? (
        <Dialog title={draft.fresh ? "记下名字" : "改名字"} onClose={() => setDraft(null)}>
          <form className="sheet-form" onSubmit={(event) => void save(event)}>
            <header>
              <strong>{draft.fresh ? "记下名字" : "改名字"}</strong>
              <button type="button" className="close" aria-label="关闭" onClick={() => setDraft(null)} disabled={saving}>
                <CloseIcon />
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
              {draft.fresh ? null : (
                <div className="danger">
                  <h4>危险区</h4>
                  <div>
                    <p>{removing ? "再点一次，这个名字才会去掉。" : "去掉后，跟主管说话不再显示这个名字。"}</p>
                    <button type="button" onClick={() => void drop()} disabled={saving}>
                      {removing ? "确认去掉" : "去掉"}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <footer>
              <button type="button" onClick={() => setDraft(null)} disabled={saving}>
                取消
              </button>
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

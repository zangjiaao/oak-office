import { useEffect, useState, type CSSProperties } from "react";
import { RULES_MAX } from "../people/department";
import type { Notice } from "./notices";

export function RulesDesk({
  text,
  notices,
  noticeError,
  noticesFirst,
  box,
  face,
  onClose,
  onSave,
}: {
  text: string;
  notices: Notice[] | null;
  noticeError: string | null;
  noticesFirst: boolean;
  box: { left: number; top: number; width: number; height: number };
  face: string;
  onClose: () => void;
  onSave: (rules: string) => Promise<void>;
}) {
  const [tab, setTab] = useState<"rules" | "notices">(noticesFirst ? "notices" : "rules");
  const [rules, setRules] = useState(text);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRules(text);
  }, [text]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (tab !== "rules") return;
    setSaving(true);
    setError(null);
    try {
      await onSave(rules);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "制度没写上。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="desk-screen">
      <button type="button" className="desk-dim" aria-label="离开制度" onClick={onClose} />
      <form
        className="charter"
        role="dialog"
        aria-label="制度和公告"
        style={{ ...box, backgroundColor: face, color: ink(face) } as CSSProperties}
        onSubmit={(event) => void save(event)}
      >
        <header>
          <div className="charter-tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === "rules"} className={tab === "rules" ? "on" : ""} onClick={() => setTab("rules")}>
              制度
            </button>
            <button type="button" role="tab" aria-selected={tab === "notices"} className={tab === "notices" ? "on" : ""} onClick={() => setTab("notices")}>
              公告
            </button>
          </div>
          <button type="button" className="close" aria-label="关上" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        {tab === "rules" ? (
          <div className="charter-rules">
            <textarea
              value={rules}
              maxLength={RULES_MAX}
              placeholder="比如：合同先由撰写人写完，交给盖章人，盖章人再交给主管。"
              aria-label="部门制度"
              onChange={(event) => setRules(event.target.value)}
            />
            {error ? <p className="quiet">{error}</p> : null}
            <footer>
              <button type="submit" disabled={saving}>
                {saving ? "在写" : "保存"}
              </button>
            </footer>
          </div>
        ) : (
          <div className="notice-list" role="tabpanel" aria-label="公告">
            {noticeError ? <p>{noticeError}</p> : null}
            {!noticeError && notices === null ? <p>在取公告。</p> : null}
            {!noticeError && notices && notices.length === 0 ? <p>还没有公告。</p> : null}
            {(notices ?? []).map((notice) => (
              <article key={notice.id}>
                <time dateTime={notice.at}>{noticeDate(notice.at)}</time>
                <ul>
                  {notice.changes.map((change) => (
                    <li key={change}>{change}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}

function noticeDate(at: string) {
  const [year, month, day] = at.split("-");
  if (!year || !month || !day) return at;
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function ink(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const bright = ((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114;
  return bright > 150000 ? "#1a1714" : "#f4f7fb";
}

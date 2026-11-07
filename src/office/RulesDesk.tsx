import { useEffect, useState, type CSSProperties } from "react";
import { RULES_MAX } from "../people/department";

export function RulesDesk({
  text,
  box,
  face,
  onClose,
  onSave,
}: {
  text: string;
  box: { left: number; top: number; width: number; height: number };
  face: string;
  onClose: () => void;
  onSave: (rules: string) => Promise<void>;
}) {
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
        aria-label="部门制度"
        style={{ ...box, backgroundColor: face, color: ink(face) } as CSSProperties}
        onSubmit={(event) => void save(event)}
      >
        <header>
          <strong>制度</strong>
          <button type="button" aria-label="关上" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
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
      </form>
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

function ink(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const bright = ((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114;
  return bright > 150000 ? "#1a1714" : "#f4f7fb";
}

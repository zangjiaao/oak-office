import { useEffect, type CSSProperties } from "react";
import type { Notice } from "./notices";

export function NoticeDesk({
  notices,
  error,
  box,
  face,
  onClose,
}: {
  notices: Notice[] | null;
  error: string | null;
  box: { left: number; top: number; width: number; height: number };
  face: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="desk-screen">
      <button type="button" className="desk-dim" aria-label="离开公告" onClick={onClose} />
      <section className="horn-sheet" role="dialog" aria-label="公告" style={{ ...box, backgroundColor: face, color: ink(face) } as CSSProperties}>
        <header>
          <strong>公告</strong>
          <button type="button" aria-label="关上" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <div className="horn-list">
          {error ? <p>{error}</p> : null}
          {!error && notices === null ? <p>在取公告。</p> : null}
          {!error && notices && notices.length === 0 ? <p>还没有公告。</p> : null}
          {(notices ?? []).map((notice) => (
            <article key={notice.id}>
              <strong>{notice.title}</strong>
              <p>{notice.body}</p>
            </article>
          ))}
        </div>
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

function ink(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  const bright = ((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114;
  return bright > 150000 ? "#1a1714" : "#f4f7fb";
}

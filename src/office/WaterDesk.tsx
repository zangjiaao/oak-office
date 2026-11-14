import { useEffect, useState, type CSSProperties } from "react";
import { currentSession, type Session } from "../people/colleague";
import { DUTY_ZONE } from "../work/duty";
import type { RoomLook } from "./room";
import { WATER_MINUTES, clearWater, readWater, saveWater, type WaterReminder } from "./water";

export function WaterDesk({
  departmentId,
  box,
  face,
  onClose,
  onReminder,
}: {
  departmentId: string;
  box: { left: number; top: number; width: number; zoom: number };
  face: RoomLook;
  onClose: () => void;
  onReminder?: (set: boolean) => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [reminder, setReminder] = useState<WaterReminder | null>(null);
  const [minutes, setMinutes] = useState<number>(60);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let gone = false;
    void (async () => {
      try {
        const me = await currentSession();
        if (gone) return;
        setSession(me);
        if (!me.email) return;
        const next = await readWater();
        if (gone) return;
        setReminder(next);
        if (next) setMinutes(next.everyMinutes);
        onReminder?.(Boolean(next));
        setError(null);
      } catch (caught) {
        if (!gone) setError(caught instanceof Error ? caught.message : "饮水提醒没打开。");
      }
    })();
    return () => {
      gone = true;
    };
  }, []);

  async function save() {
    if (!session?.email || saving) return;
    setSaving(true);
    setError(null);
    try {
      setReminder(await saveWater(departmentId, minutes));
      onReminder?.(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "饮水提醒没记下。");
    } finally {
      setSaving(false);
    }
  }

  async function drop() {
    if (!session?.email || saving || !reminder) return;
    setSaving(true);
    setError(null);
    try {
      await clearWater();
      setReminder(null);
      onReminder?.(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "饮水提醒没取消。");
    } finally {
      setSaving(false);
    }
  }

  const who = session?.email ? (session.name ? `${session.name}（${session.email}）` : session.email) : null;
  const chosen = (WATER_MINUTES as readonly number[]).includes(minutes) ? minutes : 60;

  return (
    <div className="desk-screen">
      <button type="button" className="desk-dim" aria-label="离开饮水" onClick={onClose} />
      <section
        className="cooler"
        role="dialog"
        aria-label="饮水"
        style={{ ...box, "--cooler-trim": face.trim, "--cooler-wood": face.wood } as CSSProperties}
      >
        <div className="cooler-body">
          <button type="button" className="cooler-close" aria-label="关上" onClick={onClose} disabled={saving}>
            <CloseIcon />
          </button>
          <div className="cooler-window">
            <b>{chosen % 60 === 0 ? `${chosen / 60}小时` : `${chosen}分钟`}</b>
          </div>
          <div className="cooler-panel">
            {error ? <p>{error}</p> : null}
            {session && !session.email ? <p>Access 进来之后，才能给自己定饮水提醒。</p> : null}
            {who ? <p>只提醒 {who}。</p> : null}
            <div className="cooler-picks">
              {WATER_MINUTES.map((item) => (
                <button key={item} type="button" className={minutes === item ? "on" : ""} onClick={() => setMinutes(item)} disabled={!who || saving}>
                  {item}
                </button>
              ))}
            </div>
            <p>{reminder ? `下一次 ${clockFace(reminder.nextAt)}。` : "还没有提醒。"}</p>
            <footer>
              <button type="button" onClick={() => void drop()} disabled={saving || !reminder}>
                取消提醒
              </button>
              <button type="button" className="save" onClick={() => void save()} disabled={saving || !who}>
                记下
              </button>
            </footer>
          </div>
        </div>
        <div className="cooler-stand" aria-hidden="true" />
      </section>
    </div>
  );
}

function clockFace(at: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: DUTY_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

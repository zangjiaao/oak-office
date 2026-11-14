import { useEffect, useState, type CSSProperties } from "react";
import { DUTY_ZONE, dutyWhen, listDuties, type Duty } from "../work/duty";

export function ClockDesk({
  departmentId,
  people,
  box,
  onClose,
}: {
  departmentId: string;
  people: { id: string; name: string }[];
  box: { left: number; top: number; width: number; height: number };
  onClose: () => void;
}) {
  const [duties, setDuties] = useState<Duty[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [clock, setClock] = useState(() => faceClock(Date.now()));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const timer = setInterval(() => setClock(faceClock(Date.now())), 1000);
    return () => {
      window.removeEventListener("keydown", onKey);
      clearInterval(timer);
    };
  }, [onClose]);

  useEffect(() => {
    let gone = false;
    const load = () => {
      void listDuties(departmentId)
        .then((next) => {
          if (gone) return;
          setDuties(next);
          setNow(Date.now());
          setError(null);
        })
        .catch((caught) => {
          if (!gone) setError(caught instanceof Error ? caught.message : "定时没打开。");
        });
    };
    load();
    const timer = setInterval(load, 2000);
    return () => {
      gone = true;
      clearInterval(timer);
    };
  }, [departmentId]);

  return (
    <div className="desk-screen">
      <button type="button" className="desk-dim" aria-label="离开定时" onClick={onClose} />
      <section className="slate duties" role="dialog" aria-label="定时" style={box as CSSProperties}>
        <header>
          <strong>定时</strong>
          <time>{clock}</time>
          <button type="button" aria-label="关上" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <div className="slate-body">
          {error ? <p className="quiet">{error}</p> : null}
          {duties && duties.length === 0 ? <p className="quiet">现在没有定时。</p> : null}
          {duties && duties.length > 0 ? (
            <ul>
              {duties.map((duty, index) => (
                <li key={duty.id} className={`pin tone-${index % 3}`}>
                  <span>
                    <small>
                      {personName(people, duty.person_id)} · {dutyWhen(duty)}
                    </small>
                    <b>{duty.task}</b>
                  </span>
                  <em>{duty.next_at <= now ? "在做" : nextLabel(duty.next_at)}</em>
                </li>
              ))}
            </ul>
          ) : null}
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

function personName(people: { id: string; name: string }[], id: string | null) {
  if (!id) return "不指定";
  return people.find((person) => person.id === id)?.name ?? "已离开";
}

function nextLabel(nextAt: number) {
  return `下次 ${new Date(nextAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
}

function faceClock(now: number) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: DUTY_ZONE,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(now);
}

import { useEffect, useState, type CSSProperties } from "react";
import { DUTY_ZONE, listDuties, type Duty } from "../work/duty";

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
          <DigitalClock />
          <button type="button" aria-label="关上" onClick={onClose}>
            <CloseIcon />
          </button>
        </header>
        <div className="slate-body">
          {error ? <p className="quiet">{error}</p> : null}
          {duties && duties.length === 0 ? <p className="quiet">现在没有定时。</p> : null}
          {duties && duties.length > 0 ? (
            <ul className="sheet">
              {duties.map((duty) => {
                const when = scheduleParts(duty);
                return (
                  <li key={duty.id} className="row">
                    <span className="when">
                      <small>{when.kicker}</small>
                      <b>{when.time}</b>
                    </span>
                    <span className="copy">
                      <b>{duty.task}</b>
                      <small>
                        {personName(people, duty.person_id)} · {duty.next_at <= now ? "在做" : nextLabel(duty.next_at)}
                      </small>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function DigitalClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const next = Date.now();
      setNow(next);
      timer = window.setTimeout(tick, 1000 - (next % 1000));
    };
    timer = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    return () => window.clearTimeout(timer);
  }, []);
  const face = readFace(now);
  return (
    <time className="face" dateTime={face.stamp}>
      <small>
        {face.date} {face.weekday}
      </small>
      <b>{face.time}</b>
    </time>
  );
}

function readFace(now: number) {
  const bag = Object.fromEntries(
    new Intl.DateTimeFormat("zh-CN", {
      timeZone: DUTY_ZONE,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "long",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  const hour = bag.hour === "24" ? "00" : bag.hour;
  return {
    date: `${bag.year}年${bag.month}月${bag.day}日`,
    weekday: bag.weekday,
    time: `${hour}:${bag.minute}:${bag.second}`,
    stamp: `${bag.year}-${bag.month.padStart(2, "0")}-${bag.day.padStart(2, "0")}T${hour}:${bag.minute}:${bag.second}`,
  };
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

function scheduleParts(duty: { every_ms: number; at_minutes?: number | null }) {
  if (typeof duty.at_minutes === "number") {
    const hour = Math.floor(duty.at_minutes / 60);
    const minute = duty.at_minutes % 60;
    return { kicker: "每天", time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
  }
  const minutes = Math.round(duty.every_ms / 60_000);
  if (minutes % 1440 === 0) return { kicker: "每", time: `${minutes / 1440}天` };
  if (minutes % 60 === 0) return { kicker: "每", time: `${minutes / 60}小时` };
  return { kicker: "每", time: `${minutes}分钟` };
}

function nextLabel(nextAt: number) {
  const when = new Intl.DateTimeFormat("zh-CN", {
    timeZone: DUTY_ZONE,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(nextAt);
  return `下次 ${when}`;
}


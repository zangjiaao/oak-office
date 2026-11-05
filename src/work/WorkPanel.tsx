import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PersonRow } from "../people/record";
import { loadWork, sayWork, type FloorMark, type WorkLine } from "./api";

export function WorkPanel({
  people,
  loadError,
  onFloor,
  onRetry,
}: {
  people: PersonRow[] | null;
  loadError: string | null;
  onFloor: (floor: FloorMark[]) => void;
  onRetry: () => void;
}) {
  const [lead, setLead] = useState<{ id: string; name: string } | null>(null);
  const [lines, setLines] = useState<WorkLine[] | null>(null);
  const [floor, setFloor] = useState<FloorMark[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const leadId = people?.find((person) => person.is_lead === 1)?.id ?? null;

  useEffect(() => {
    let gone = false;
    void loadWork()
      .then((office) => {
        if (gone) return;
        setLead(office.lead);
        setLines(office.lines);
        setFloor(office.floor);
        onFloor(office.floor);
        setError(null);
      })
      .catch((caught) => {
        if (gone) return;
        setError(caught instanceof Error ? caught.message : "主管这回没接上。");
      });
    return () => {
      gone = true;
    };
  }, [leadId, onFloor]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines?.length, sending]);

  async function say(event: FormEvent) {
    event.preventDefault();
    if (sending || !lead) return;
    const said = text.trim();
    if (!said) return;
    setSending(true);
    setError(null);
    try {
      const office = await sayWork(said);
      setLead(office.lead);
      setLines(office.lines);
      setFloor(office.floor);
      onFloor(office.floor);
      setText("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "主管这回没接上。");
    } finally {
      setSending(false);
    }
  }

  const named = new Map(people?.map((person) => [person.id, person.name]));

  return (
    <aside className="chat">
      <header>
        <strong>{lead?.name ?? "主管"}</strong>
        <span>交付组主管</span>
      </header>
      <div className="log" ref={logRef}>
        {loadError ? (
          <p className="file-error">
            {loadError}{" "}
            <button type="button" onClick={onRetry}>
              再试
            </button>
          </p>
        ) : null}
        {people && !lead && !loadError ? <p className="empty">先在编制里指定一位主管。</p> : null}
        {lines === null && !error ? <p className="empty">在读。</p> : null}
        {lines?.length === 0 && lead ? <p className="empty">主管在等你开口。</p> : null}
        {lines?.map((line) => (
          <article key={line.id} className={line.role}>
            <span>{line.role === "lead" ? lead?.name ?? "主管" : "你"}</span>
            <p>{line.text}</p>
          </article>
        ))}
        {sending ? <p className="empty">主管在安排。</p> : null}
        {error ? <p className="file-error">{error}</p> : null}
      </div>
      <form onSubmit={(event) => void say(event)}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          disabled={!lead || sending}
          placeholder={lead ? "跟主管说一句" : "先指定一位主管"}
          maxLength={1000}
        />
      </form>
      <ul className="roster">
        {(people ?? []).map((person) => {
          const mark = floor.find((item) => item.person_id === person.id);
          return (
            <li key={person.id}>
              <b>{named.get(person.id) ?? person.name}</b>
              <em>{mark?.label ?? (person.is_lead === 1 ? "主管" : "闲置")}</em>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

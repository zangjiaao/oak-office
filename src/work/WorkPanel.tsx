import { useEffect, useRef, useState, type FormEvent } from "react";
import type { PersonRow } from "../people/record";
import { shift, useNow } from "../office/shift";
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
    const previousFloor = floor;
    const previousLines = lines;
    setSending(true);
    setError(null);
    setText("");
    setLines([...(lines ?? []), { id: "pending-user", role: "user", person_id: null, text: said }]);
    const listening = previousFloor.map((mark) =>
      mark.person_id === lead.id ? { ...mark, pose: "think" as const, label: "在听" } : mark,
    );
    if (!listening.some((mark) => mark.person_id === lead.id)) {
      listening.push({ person_id: lead.id, pose: "think", label: "在听" });
    }
    showFloor(listening);
    const started = Date.now();
    try {
      const office = await sayWork(said);
      const hidden = new Set<string>();
      for (const step of office.play ?? []) if (step.line) hidden.add(step.line.id);
      if (office.closing) hidden.add(office.closing.id);
      setLead(office.lead);
      setLines(office.lines.filter((line) => !hidden.has(line.id)));
      let credit = Date.now() - started;
      const playing = new Map(previousFloor.map((mark) => [mark.person_id, mark]));
      for (const [index, step] of (office.play ?? []).entries()) {
        playing.set(step.person_id, { person_id: step.person_id, pose: step.pose, label: step.label });
        showFloor([...playing.values()]);
        const hold = index === 0 && step.label === "在听" ? Math.max(0, step.hold - credit) : step.hold;
        credit = 0;
        if (step.line && step.lineAt === "start") setLines((current) => [...(current ?? []), step.line!]);
        if (hold > 0) await wait(hold);
        if (step.line && step.lineAt !== "start") setLines((current) => [...(current ?? []), step.line!]);
      }
      if (office.closing) {
        await wait(700);
        setLines((current) => [...(current ?? []), office.closing!]);
      }
      showFloor(office.floor);
      setFloor(office.floor);
    } catch (caught) {
      setLines(previousLines);
      showFloor(previousFloor);
      setText(said);
      setError(caught instanceof Error ? caught.message : "主管这回没接上。");
    } finally {
      setSending(false);
    }
  }

  function showFloor(marks: FloorMark[]) {
    setFloor(marks);
    onFloor(marks);
  }

  const now = useNow(true);
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
            <span>{speaker(line, lead?.name, named)}</span>
            <p>{line.text}</p>
          </article>
        ))}
        {sending ? <p className="empty">主管在听。</p> : null}
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
          const view = mark ? shift(mark, now) : null;
          return (
            <li key={person.id}>
              <b>{named.get(person.id) ?? person.name}</b>
              <em>{view?.label ?? (person.is_lead === 1 ? "主管" : "闲置")}</em>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function speaker(line: WorkLine, leadName: string | undefined, names: Map<string, string>) {
  if (line.role === "user") return "你";
  if (line.role === "staff") return `${names.get(line.person_id ?? "") ?? "员工"} · 办理`;
  return `${leadName ?? "主管"} · 主管`;
}

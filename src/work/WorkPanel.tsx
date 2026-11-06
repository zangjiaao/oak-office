import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { PersonRow } from "../people/record";
import { loadWork, sayWork, type DutyHold, type FloorMark, type WorkLine, type WorkOffice } from "./api";
import { Markdown } from "./MarkdownView";

export function WorkPanel({
  people,
  departmentId,
  departmentName,
  loadError,
  onFloor,
  onHolding,
  onRetry,
}: {
  people: PersonRow[] | null;
  departmentId: string | null;
  departmentName: string;
  loadError: string | null;
  onFloor: (floor: FloorMark[]) => void;
  onHolding: (duties: DutyHold[]) => void;
  onRetry: () => void;
}) {
  const [lead, setLead] = useState<{ id: string; name: string } | null>(null);
  const [lines, setLines] = useState<WorkLine[] | null>(null);
  const [floor, setFloor] = useState<FloorMark[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);
  const playingRef = useRef(false);
  const floorRef = useRef(floor);
  const playedRef = useRef(new Set<string>());
  floorRef.current = floor;
  const leadId = people?.find((person) => person.is_lead === 1)?.id ?? null;

  useEffect(() => {
    let gone = false;
    if (!departmentId) return;
    void loadWork(departmentId)
      .then((office) => {
        if (gone) return;
        setError(null);
        void present(office);
      })
      .catch((caught) => {
        if (gone) return;
        setError(caught instanceof Error ? caught.message : "主管这回没接上。");
      });
    return () => {
      gone = true;
    };
  }, [leadId, departmentId, onFloor, onHolding]);

  useEffect(() => {
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
      if (playingRef.current) return;
      if (!sendingRef.current && ticks % 5 !== 0) return;
      if (!departmentId) return;
      void loadWork(departmentId)
        .then((office) => {
          if (playingRef.current) return;
          void present(office);
        })
        .catch(() => {});
    }, 1_000);
    return () => clearInterval(timer);
  }, [departmentId, onFloor, onHolding]);

  useEffect(() => {
    if (fieldRef.current) fitComposer(fieldRef.current);
  }, [text]);

  const tailId = lines?.at(-1)?.id ?? "";
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    const pin = () => log.scrollTo({ top: log.scrollHeight });
    pin();
    const frame = requestAnimationFrame(pin);
    return () => cancelAnimationFrame(frame);
  }, [tailId, sending]);

  async function say(event: FormEvent) {
    event.preventDefault();
    if (sending || !lead || !departmentId) return;
    const said = text.trim();
    if (!said) return;
    const previousFloor = floor;
    const previousLines = lines;
    sendingRef.current = true;
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
      const office = await sayWork(departmentId, said);
      await playBeats(office, floorRef.current, Date.now() - started);
    } catch (caught) {
      setText(said);
      setError(caught instanceof Error ? caught.message : "主管这回没接上。");
      try {
        const office = departmentId ? await loadWork(departmentId) : null;
        if (!office) throw new Error("先选一层。");
        setLead(office.lead);
        setLines(office.lines);
        showFloor(office.floor);
        onHolding(office.holding ?? []);
      } catch {
        setLines(previousLines);
        showFloor(previousFloor);
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function showFloor(marks: FloorMark[]) {
    floorRef.current = marks;
    setFloor(marks);
    onFloor(marks);
  }

  async function present(office: WorkOffice) {
    if (playingRef.current) return;
    if (sendingRef.current) {
      onHolding(office.holding ?? []);
      showFloor(liveDuringSend(floorRef.current, office.floor));
      return;
    }
    const fresh = Boolean(office.playId && office.play?.length && !playedRef.current.has(office.playId));
    if (!fresh || playingRef.current) {
      if (!playingRef.current && !sendingRef.current) {
        setLead(office.lead);
        onHolding(office.holding ?? []);
        setLines((current) => {
          const next = office.lines;
          if (current && current.length === next.length && current.every((line, index) => line.id === next[index]?.id)) {
            return current;
          }
          return next;
        });
        showFloor(office.floor);
      }
      return;
    }
    playedRef.current.add(office.playId!);
    await playBeats(office, floorRef.current, 0);
  }

  async function playBeats(office: WorkOffice, base: FloorMark[], credit: number) {
    onHolding(office.holding ?? []);
    setLead(office.lead);
    playingRef.current = true;
    const hidden = new Set<string>();
    for (const step of office.play ?? []) if (step.line) hidden.add(step.line.id);
    if (office.closing) hidden.add(office.closing.id);
    setLines(office.lines.filter((line) => !hidden.has(line.id)));
    const playing = new Map(base.map((mark) => [mark.person_id, mark]));
    try {
      for (const [index, step] of (office.play ?? []).entries()) {
        playing.set(step.person_id, {
          person_id: step.person_id,
          pose: step.pose,
          label: step.label,
          ...(step.visit ? { visit: step.visit } : {}),
        });
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
    } finally {
      playingRef.current = false;
    }
  }

  const named = new Map(people?.map((person) => [person.id, person.name]));

  return (
    <aside className="chat">
      <header>
        <strong>{lead?.name ?? "主管"}</strong>
        <span>{departmentName}主管</span>
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
            <div className="bubble">
              <Markdown text={line.text} />
            </div>
          </article>
        ))}
        {sending ? <p className="empty">主管在听。</p> : null}
        {error ? <p className="file-error">{error}</p> : null}
      </div>
      <form onSubmit={(event) => void say(event)}>
        <textarea
          ref={fieldRef}
          value={text}
          rows={1}
          onChange={(event) => {
            setText(event.target.value);
            fitComposer(event.currentTarget);
          }}
          onKeyDown={(event) => submitOnEnter(event)}
          disabled={!lead || sending}
          placeholder={lead ? "跟主管说一句" : "先指定一位主管"}
          maxLength={1000}
        />
        <button type="submit" disabled={!lead || sending || text.trim() === ""}>
          发送
        </button>
      </form>
    </aside>
  );
}

function liveDuringSend(current: FloorMark[], incoming: FloorMark[]) {
  if (current.length === 0) return incoming;
  return current.map((mark) => {
    if (mark.label === "不在") return mark;
    return incoming.find((item) => item.person_id === mark.person_id) ?? mark;
  });
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fitComposer(field: HTMLTextAreaElement) {
  field.style.height = "0px";
  field.style.height = `${Math.min(field.scrollHeight, 140)}px`;
}

function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
  event.preventDefault();
  event.currentTarget.form?.requestSubmit();
}

function speaker(line: WorkLine, leadName: string | undefined, names: Map<string, string>) {
  if (line.role === "user") return "你";
  if (line.role === "clock") return "定时";
  if (line.role === "staff") return `${names.get(line.person_id ?? "") ?? "员工"} · 办理`;
  return `${leadName ?? "主管"} · 主管`;
}

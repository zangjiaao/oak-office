import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { onSite } from "../office/shift";
import type { PersonRow } from "../people/record";
import { currentSession, listColleagues, type Colleague } from "../people/colleague";
import { loadWork, sayWork, stopWork, type DutyHold, type FloorMark, type WorkLine, type WorkOffice } from "./api";
import { Markdown } from "./MarkdownView";

export function WorkPanel({
  people,
  departmentId,
  departmentName,
  loadError,
  onFloor,
  onHolding,
  onRetry,
  active = true,
}: {
  people: PersonRow[] | null;
  departmentId: string | null;
  departmentName: string;
  loadError: string | null;
  onFloor: (floor: FloorMark[]) => void;
  onHolding: (duties: DutyHold[]) => void;
  onRetry: () => void;
  active?: boolean;
}) {
  const [lead, setLead] = useState<{ id: string; name: string } | null>(null);
  const [lines, setLines] = useState<WorkLine[] | null>(null);
  const [floor, setFloor] = useState<FloorMark[]>([]);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [who, setWho] = useState("all");
  const logRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const sendingRef = useRef(false);
  const playingRef = useRef(false);
  const stopRef = useRef<AbortController | null>(null);
  const skipPlayRef = useRef(false);
  const watchUntilRef = useRef(0);
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
      const floorBusy = floorRef.current.some((mark) => mark.pose !== "idle" && mark.pose !== "arrive" && mark.pose !== "done");
      const watching = Date.now() < watchUntilRef.current;
      if (!sendingRef.current && !floorBusy && !watching && document.visibilityState === "visible" && ticks % 5 !== 0) return;
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
    if (!active) return;
    let gone = false;
    void Promise.all([listColleagues(), currentSession()])
      .then(([rows, session]) => {
        if (gone) return;
        setColleagues(rows);
        setMe(session.email);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [active]);

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
  }, [tailId, sending, who]);

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
    setLines([...(lines ?? []), { id: "pending-user", role: "user", person_id: null, text: said, author_email: me }]);
    const listening = previousFloor.map((mark) =>
      mark.person_id === lead.id ? { ...mark, pose: "think" as const, label: "在想" } : mark,
    );
    if (!listening.some((mark) => mark.person_id === lead.id)) {
      listening.push({ person_id: lead.id, pose: "think", label: "在想" });
    }
    showFloor(listening);
    const started = Date.now();
    const controller = new AbortController();
    stopRef.current = controller;
    skipPlayRef.current = false;
    try {
      const office = await sayWork(departmentId, said, controller.signal);
      if (controller.signal.aborted) {
        await settleAfterStop(departmentId, said);
        return;
      }
      if (office.play?.length) await playBeats(office, floorRef.current, Date.now() - started);
      else {
        setLead(office.lead);
        setLines(office.lines);
        showFloor(office.floor);
        onHolding(office.holding ?? []);
      }
    } catch (caught) {
      if (aborted(caught) || controller.signal.aborted) {
        await settleAfterStop(departmentId, said);
        return;
      }
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
      stopRef.current = null;
      skipPlayRef.current = false;
      sendingRef.current = false;
      setSending(false);
    }
  }

  function interrupt() {
    skipPlayRef.current = true;
    watchUntilRef.current = Date.now() + 8_000;
    if (departmentId) void stopWork(departmentId);
    stopRef.current?.abort();
  }

  async function settleAfterStop(floorId: string, said: string) {
    setError(null);
    try {
      const office = await loadWork(floorId);
      const kept = office.lines.some((line) => line.role === "user" && line.text === said);
      if (!kept) setText(said);
      setLead(office.lead);
      setLines(office.lines);
      showFloor(office.floor);
      onHolding(office.holding ?? []);
    } catch {
      setText(said);
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
      setLead(office.lead);
      setLines((current) => mergeArrived(current, office.lines));
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
        if (skipPlayRef.current) break;
        const hold = index === 0 && (step.label === "在听" || step.label === "在想") ? Math.max(0, step.hold - credit) : step.hold;
        credit = 0;
        if (step.line && step.lineAt === "start") setLines((current) => [...(current ?? []), step.line!]);
        if (hold > 0) await wait(hold, () => skipPlayRef.current);
        if (skipPlayRef.current) break;
        if (step.line && step.lineAt !== "start") setLines((current) => [...(current ?? []), step.line!]);
      }
      if (skipPlayRef.current) {
        setLines(office.lines);
        showFloor(office.floor);
      } else if (office.closing) {
        await wait(700);
        setLines((current) => [...(current ?? []), office.closing!]);
      }
      showFloor(office.floor);
    } finally {
      playingRef.current = false;
    }
  }

  const named = new Map(people?.map((person) => [person.id, person.name]));
  const known = new Map(colleagues.map((row) => [row.email, row.name]));
  const speakers = speakerOptions(lines ?? [], known);
  const shown = who === "all" ? (lines ?? []) : linesByAuthor(lines ?? [], who);
  useEffect(() => {
    if (who !== "all" && !speakers.some(([email]) => email === who)) setWho("all");
  }, [who, speakers]);

  return (
    <aside className="chat">
      <header>
        <div>
          <strong>{lead?.name ?? "主管"}</strong>
          <span>{departmentName}主管</span>
        </div>
        {speakers.length > 0 ? (
          <select aria-label="按人看" value={who} onChange={(event) => setWho(event.target.value)}>
            <option value="all">全部</option>
            {speakers.map(([email, label]) => (
              <option key={email} value={email}>
                {label}
              </option>
            ))}
          </select>
        ) : null}
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
        {lines && lines.length > 0 && shown.length === 0 ? <p className="empty">没有这个人的对话。</p> : null}
        {shown.map((line) => (
          <article key={line.id} className={line.role}>
            <span>{speaker(line, lead?.name, named, known)}</span>
            <div className="bubble">
              <Markdown text={line.text} />
            </div>
          </article>
        ))}
        {sending ? <p className="empty">{leadActivity(floor.find((mark) => mark.person_id === lead?.id)?.label)}</p> : null}
        {error ? <p className="file-error">{error}</p> : null}
      </div>
      <form onSubmit={(event) => void say(event)}>
        <div className="composer">
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
        </div>
        {sending ? (
          <button type="button" className="stop" onClick={interrupt}>
            中断
          </button>
        ) : (
          <button type="submit" disabled={!lead || text.trim() === ""}>
            发送
          </button>
        )}
      </form>
    </aside>
  );
}

function mergeArrived(current: WorkLine[] | null, incoming: WorkLine[]) {
  if (!current) return incoming;
  const pending = current.find((line) => line.id === "pending-user");
  const incomingHasUser = pending ? incoming.some((line) => line.role === "user" && line.text === pending.text) : false;
  const base = pending && incomingHasUser ? current.filter((line) => line.id !== "pending-user") : current;
  const known = new Set(base.map((line) => line.id));
  const arrived = incoming.filter((line) => !known.has(line.id));
  if (arrived.length === 0 && base === current) return current;
  return [...base, ...arrived];
}

function leadActivity(label: string | undefined) {
  if (!label || label === "等你一句话" || label === "闲置" || label === "不在") return "主管在想。";
  if (label === "在听") return "主管在想。";
  if (label === "等他们") return "主管在派活。";
  return `主管${label}。`;
}

function liveDuringSend(current: FloorMark[], incoming: FloorMark[], now = Date.now()) {
  const previous = new Map(current.map((mark) => [mark.person_id, mark]));
  return incoming.map((mark) => {
    const prior = previous.get(mark.person_id);
    if (!onSite(prior, now) && onSite(mark, now)) return { ...mark, pose: "arrive" as const, label: "进来了" };
    return mark;
  });
}

function aborted(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function wait(ms: number, skip: () => boolean = () => false) {
  return new Promise<void>((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (skip() || Date.now() - start >= ms) {
        clearInterval(timer);
        resolve();
      }
    }, 50);
  });
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

function speaker(line: WorkLine, leadName: string | undefined, names: Map<string, string>, known: Map<string, string>) {
  if (line.role === "user") {
    if (!line.author_email) return "你";
    return known.get(line.author_email) ?? line.author_email;
  }
  if (line.role === "clock") return "定时";
  if (line.role === "staff") return `${names.get(line.person_id ?? "") ?? "员工"} · 办理`;
  return `${leadName ?? "主管"} · 主管`;
}

function speakerOptions(lines: WorkLine[], known: Map<string, string>) {
  const seen = new Map<string, string>();
  for (const line of lines) {
    if (line.role !== "user" || !line.author_email || seen.has(line.author_email)) continue;
    seen.set(line.author_email, known.get(line.author_email) ?? line.author_email);
  }
  return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], "zh"));
}

function linesByAuthor(lines: WorkLine[], email: string) {
  const shown: WorkLine[] = [];
  let open = false;
  for (const line of lines) {
    if (line.role === "user") open = line.author_email === email;
    if (open) shown.push(line);
  }
  return shown;
}

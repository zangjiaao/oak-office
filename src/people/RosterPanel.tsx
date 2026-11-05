import { useEffect, useRef, useState, type FormEvent } from "react";
import { rosterLabel, rosterNote, type DraftPreview } from "../office/seats";
import type { HairStyle, Look } from "../office/types";
import { hirePerson, updatePerson } from "./api";
import {
  GENDER_LABEL,
  GENDERS,
  HAIR_LABEL,
  LOOK_PRESETS,
  STAFF_FULL,
  applyPerson,
  canHire,
  identityOf,
  lookOf,
  parseDraft,
  staffFits,
  type Gender,
  type PersonRow,
} from "./record";

type FormState = {
  kind: "create" | "edit";
  id?: string;
  name: string;
  gender: Gender | "";
  look: Look;
  brief: string;
  dossier: string;
  isLead: boolean;
};

export function RosterPanel({
  people,
  loadError,
  selectedId,
  pickRequest,
  onSelect,
  onPeople,
  onRetry,
  onDraft,
}: {
  people: PersonRow[] | null;
  loadError: string | null;
  selectedId: string | null;
  pickRequest: { id: string; n: number } | null;
  onSelect: (id: string | null) => void;
  onPeople: (people: PersonRow[]) => void;
  onRetry: () => void;
  onDraft: (draft: DraftPreview | null) => void;
}) {
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const handledPick = useRef<number | null>(pickRequest?.n ?? null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!form) {
      onDraft(null);
      return;
    }
    onDraft({ kind: form.kind, id: form.id, name: form.name, look: form.look, isLead: form.isLead });
  }, [form, onDraft]);

  useEffect(() => () => onDraft(null), [onDraft]);

  useEffect(() => {
    if (!form) return;
    formRef.current?.scrollIntoView({ block: "start" });
  }, [form?.kind, form?.id]);

  useEffect(() => {
    if (!pickRequest || pickRequest.n === handledPick.current || !people) return;
    const person = people.find((item) => item.id === pickRequest.id);
    if (!person) return;
    handledPick.current = pickRequest.n;
    setForm(editForm(person));
    setError(null);
  }, [pickRequest, people]);

  function startHire() {
    onSelect(null);
    setForm(createForm());
    setError(null);
  }

  function open(person: PersonRow) {
    onSelect(person.id);
    setForm(editForm(person));
    setError(null);
  }

  function closeForm() {
    setForm(null);
    setError(null);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form || saving) return;
    const parsed = parseDraft({
      name: form.name,
      gender: form.gender,
      hair: form.look.hair,
      skin: form.look.skin,
      shirt: form.look.shirt,
      pants: form.look.pants,
      hair_style: form.look.hairStyle,
      brief: form.brief,
      dossier: form.dossier,
      is_lead: form.isLead ? 1 : 0,
    });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    if (!staffFits(people ?? [], { kind: form.kind, id: form.id, isLead: form.isLead })) {
      setError(STAFF_FULL);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (form.kind === "create") {
        const person = await hirePerson(parsed.value);
        onPeople(applyPerson(people ?? [], person));
        onSelect(person.id);
        setForm(null);
      } else if (form.id) {
        const person = await updatePerson(form.id, parsed.value);
        onPeople(applyPerson(people ?? [], person));
        setForm(editForm(person));
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "档案没有写成。");
    } finally {
      setSaving(false);
    }
  }

  const note = people ? rosterNote(people) : null;
  const roomForHire = people ? canHire(people) : false;
  const identity = form ? identityOf({ brief: form.brief, dossier: form.dossier }) : null;

  return (
    <aside className="chat staff">
      <header>
        <strong>编制</strong>
        <span>交付组</span>
      </header>
      <div className="log">
        {loadError ? (
          <p className="file-error">
            {loadError}{" "}
            <button type="button" onClick={onRetry}>
              再试
            </button>
          </p>
        ) : null}
        {people === null && !loadError ? <p className="empty">在读档案。</p> : null}
        {people && people.length === 0 && !form ? (
          <p className="empty">还没有人。入职之后，会坐在桌边。</p>
        ) : null}
        {people && people.length > 0 ? (
          <ul className="people">
            {people.map((person) => (
              <li key={person.id}>
                <button
                  type="button"
                  className={person.id === selectedId ? "on" : ""}
                  onClick={() => open(person)}
                >
                  <b>{person.name}</b>
                  <em>
                    {GENDER_LABEL[person.gender]} · {rosterLabel(person)}
                  </em>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {note ? <p className="hint">{note}</p> : null}
        {form ? (
          <form id="person-form" className="file" onSubmit={save} ref={formRef}>
            <label>
              姓名
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                autoComplete="off"
                maxLength={32}
              />
            </label>
            <div className="field">
              <span>主管</span>
              <button
                type="button"
                className={form.isLead ? "switch on" : "switch"}
                aria-pressed={form.isLead}
                onClick={() => setForm({ ...form, isLead: !form.isLead })}
              >
                <i />
                {form.isLead ? "是主管" : "不是主管"}
              </button>
              {form.isLead ? <p className="hint">这个部门只有一位主管。保存后，原来的主管回到员工桌。</p> : null}
              {people && !staffFits(people, { kind: form.kind, id: form.id, isLead: form.isLead }) ? (
                <p className="file-error">{STAFF_FULL}</p>
              ) : null}
            </div>
            <div className="field">
              <span>性别</span>
              <div className="choices">
                {GENDERS.map((gender) => (
                  <button
                    key={gender}
                    type="button"
                    className={form.gender === gender ? "on" : ""}
                    onClick={() => setForm({ ...form, gender })}
                  >
                    {GENDER_LABEL[gender]}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span>形象</span>
              <div className="presets">
                {LOOK_PRESETS.map((preset) => (
                  <button
                    key={`${preset.shirt}-${preset.hairStyle}`}
                    type="button"
                    className={sameLook(preset, form.look) ? "on" : ""}
                    style={{ background: preset.shirt }}
                    aria-label={HAIR_LABEL[preset.hairStyle]}
                    onClick={() => setForm({ ...form, look: preset })}
                  />
                ))}
              </div>
              <div className="choices">
                {(Object.keys(HAIR_LABEL) as HairStyle[]).map((style) => (
                  <button
                    key={style}
                    type="button"
                    className={form.look.hairStyle === style ? "on" : ""}
                    onClick={() => setForm({ ...form, look: { ...form.look, hairStyle: style } })}
                  >
                    {HAIR_LABEL[style]}
                  </button>
                ))}
              </div>
              <div className="colors">
                <Color
                  label="发"
                  value={form.look.hair}
                  onChange={(hair) => setForm({ ...form, look: { ...form.look, hair } })}
                />
                <Color
                  label="肤"
                  value={form.look.skin}
                  onChange={(skin) => setForm({ ...form, look: { ...form.look, skin } })}
                />
                <Color
                  label="衣"
                  value={form.look.shirt}
                  onChange={(shirt) => setForm({ ...form, look: { ...form.look, shirt } })}
                />
                <Color
                  label="裤"
                  value={form.look.pants}
                  onChange={(pants) => setForm({ ...form, look: { ...form.look, pants } })}
                />
              </div>
            </div>
            <label>
              一句话
              <input
                value={form.brief}
                onChange={(event) => setForm({ ...form, brief: event.target.value })}
                placeholder="空着就用通用身份"
                maxLength={80}
              />
            </label>
            <label>
              详细设定
              <textarea
                value={form.dossier}
                onChange={(event) => setForm({ ...form, dossier: event.target.value })}
                placeholder="空着就用通用身份"
                maxLength={4000}
              />
            </label>
            {identity ? (
              <p className="hint">
                {identity.generic
                  ? `通用身份：${identity.brief}${identity.dossier}`
                  : "空着的部分用通用身份。"}
              </p>
            ) : null}
            {error ? <p className="file-error">{error}</p> : null}
          </form>
        ) : null}
      </div>
      <div className="staff-bar">
        {form ? (
          <>
            <button type="submit" form="person-form" className="save" disabled={saving}>
              {form.kind === "create" ? "入职" : "保存"}
            </button>
            <button type="button" onClick={closeForm} disabled={saving}>
              取消
            </button>
          </>
        ) : (
          <button type="button" className="save" onClick={startHire} disabled={people === null || !roomForHire}>
            入职
          </button>
        )}
      </div>
    </aside>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      {label}
      <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function createForm(): FormState {
  return {
    kind: "create",
    name: "",
    gender: "",
    look: LOOK_PRESETS[0],
    brief: "",
    dossier: "",
    isLead: false,
  };
}

function editForm(person: PersonRow): FormState {
  return {
    kind: "edit",
    id: person.id,
    name: person.name,
    gender: person.gender,
    look: lookOf(person),
    brief: person.brief ?? "",
    dossier: person.dossier ?? "",
    isLead: person.is_lead === 1,
  };
}

function sameLook(a: Look, b: Look) {
  return (
    a.hair === b.hair &&
    a.skin === b.skin &&
    a.shirt === b.shirt &&
    a.pants === b.pants &&
    a.hairStyle === b.hairStyle
  );
}

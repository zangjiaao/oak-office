import { useEffect, useRef, useState, type FormEvent } from "react";
import { PET_CHOICES, petIds, type PetId } from "../office/pets";
import { DEFAULT_ROOM, ROOM_PRESETS, ROOM_STYLE_LABEL, ROOM_STYLES, sameRoom, type RoomLook, type RoomStyle } from "../office/room";
import { rosterLabel, rosterNote, type DraftPreview } from "../office/seats";
import type { HairStyle, Look } from "../office/types";
import { dismissPerson, forgetMemory, hirePerson, updateDepartment, updatePerson } from "./api";
import { staffFull, type Department, type DepartmentDraft } from "./department";
import { cancelDuty, dutyWhen, listDuties, type Duty } from "../work/duty";
import {
  GENDER_LABEL,
  GENDERS,
  HAIR_LABEL,
  LOOK_PRESETS,
  MODEL_LABEL,
  MODELS,
  THINKING_FOR,
  THINKING_LABEL,
  applyPerson,
  canHire,
  dropPerson,
  identityOf,
  lookOf,
  parseDraft,
  staffFits,
  type Gender,
  type OfficeModel,
  type PersonRow,
  type Thinking,
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
  model: OfficeModel;
  thinking: Thinking;
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
  department,
  floorDraft,
  onDepartment,
  onCreateFloor,
  onDiscardFloor,
  onPreviewFloor,
  onRemoveFloor,
  onLook,
  onPets,
}: {
  people: PersonRow[] | null;
  loadError: string | null;
  selectedId: string | null;
  pickRequest: { id: string; n: number } | null;
  onSelect: (id: string | null) => void;
  onPeople: (people: PersonRow[]) => void;
  onRetry: () => void;
  onDraft: (draft: DraftPreview | null) => void;
  department: Department | null;
  floorDraft: DepartmentDraft | null;
  onDepartment: (department: Department) => void;
  onCreateFloor: (draft: DepartmentDraft) => Promise<void>;
  onDiscardFloor: () => void;
  onPreviewFloor: (draft: DepartmentDraft) => void;
  onRemoveFloor: (id: string) => Promise<void>;
  onLook: (look: RoomLook | null) => void;
  onPets: (pets: PetId[] | null) => void;
}) {
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [duties, setDuties] = useState<Duty[]>([]);
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
    let gone = false;
    if (!department) return;
    void listDuties(department.id)
      .then((rows) => {
        if (!gone) setDuties(rows);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [people, department]);

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
    setLeaving(false);
  }, [pickRequest, people]);

  function startHire() {
    onSelect(null);
    setForm(createForm());
    setError(null);
    setLeaving(false);
  }

  function open(person: PersonRow) {
    onSelect(person.id);
    setForm(editForm(person));
    setError(null);
    setLeaving(false);
  }

  function closeForm() {
    setForm(null);
    setError(null);
    setLeaving(false);
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
      model: form.model,
      thinking: form.thinking,
    });
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const seats = department?.seats ?? 0;
    if (!department || !staffFits(people ?? [], { kind: form.kind, id: form.id, isLead: form.isLead }, seats)) {
      setError(staffFull(seats || 1));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (form.kind === "create") {
        const person = await hirePerson(department.id, parsed.value);
        onPeople(applyPerson(people ?? [], person));
        onSelect(person.id);
        setForm(null);
      } else if (form.id) {
        const person = await updatePerson(form.id, parsed.value);
        onPeople(applyPerson(people ?? [], person));
        setForm(editForm(person));
        setLeaving(false);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "档案没有写成。");
    } finally {
      setSaving(false);
    }
  }

  async function leave() {
    if (!form || form.kind !== "edit" || !form.id || saving) return;
    if (!leaving) {
      setLeaving(true);
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await dismissPerson(form.id);
      onPeople(dropPerson(people ?? [], form.id));
      if (selectedId === form.id) onSelect(null);
      setForm(null);
      setLeaving(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "档案没有去掉。");
    } finally {
      setSaving(false);
    }
  }

  const seats = department?.seats ?? 8;
  const note = people ? rosterNote(people, seats) : null;
  const roomForHire = people ? canHire(people, seats) : false;
  const identity = form ? identityOf({ brief: form.brief, dossier: form.dossier }) : null;
  const memories =
    form?.kind === "edit" && form.id ? (people?.find((person) => person.id === form.id)?.memories ?? []) : [];
  const dutiesHere = form?.kind === "edit" && form.id ? duties.filter((duty) => duty.person_id === form.id) : [];

  async function dropDuty(dutyId: string) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await cancelDuty(dutyId);
      setDuties((current) => current.filter((duty) => duty.id !== dutyId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "这个定时没有取消。");
    } finally {
      setSaving(false);
    }
  }

  async function forget(noteId: string) {
    if (!form?.id || saving) return;
    setSaving(true);
    setError(null);
    try {
      await forgetMemory(form.id, noteId);
      onPeople(
        (people ?? []).map((person) =>
          person.id === form.id
            ? { ...person, memories: (person.memories ?? []).filter((note) => note.id !== noteId) }
            : person,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "这条记忆没有去掉。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className="chat staff">
      <header>
        <strong>编制</strong>
        <span>
          {floorDraft
            ? `${floorDraft.floor}层 · 新的一层`
            : department
              ? `${department.floor}层 · ${department.name}`
              : "部门"}
        </span>
      </header>
      <div className="log">
        {floorDraft ? <p className="hint">保存之后，这一层才出现在办公楼。</p> : null}
        {floorDraft || department ? (
          <DepartmentForm
            key={floorDraft ? "new-floor" : department?.id}
            department={floorDraft ? null : department}
            draft={floorDraft}
            onDepartment={onDepartment}
            onCreateFloor={onCreateFloor}
            onDiscardFloor={onDiscardFloor}
            onPreviewFloor={onPreviewFloor}
            onRemoveFloor={onRemoveFloor}
            onLook={onLook}
            onPets={onPets}
          />
        ) : null}
        {loadError ? (
          <p className="file-error">
            {loadError}{" "}
            <button type="button" onClick={onRetry}>
              再试
            </button>
          </p>
        ) : null}
        {people === null && !loadError && !floorDraft ? <p className="empty">在读档案。</p> : null}
        {people && people.length === 0 && !form && !floorDraft ? (
          <p className="empty">还没有人。入职只留下档案，主管派活时才会进办公室。</p>
        ) : null}
        {people && people.length > 0 && !floorDraft ? (
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
              {people && !staffFits(people, { kind: form.kind, id: form.id, isLead: form.isLead }, seats) ? (
                <p className="file-error">{staffFull(seats)}</p>
              ) : null}
            </div>
            <div className="field">
              <span>模型</span>
              <div className="choices">
                {MODELS.map((model) => (
                  <button
                    key={model}
                    type="button"
                    className={form.model === model ? "on" : ""}
                    onClick={() =>
                      setForm({
                        ...form,
                        model,
                        thinking: THINKING_FOR[model].includes(form.thinking) ? form.thinking : "high",
                      })
                    }
                  >
                    {MODEL_LABEL[model]}
                  </button>
                ))}
              </div>
              <p className="hint">每个人可以用自己的模型。</p>
            </div>
            <div className="field">
              <span>思考</span>
              <div className="choices">
                {THINKING_FOR[form.model].map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={form.thinking === level ? "on" : ""}
                    onClick={() => setForm({ ...form, thinking: level })}
                  >
                    {THINKING_LABEL[level]}
                  </button>
                ))}
              </div>
              <p className="hint">想过的内容不进聊天。开着的时候，办公室里显示在想。</p>
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
            {form.kind === "edit" ? (
              <div className="field">
                <span>定时</span>
                {dutiesHere.length === 0 ? (
                  <p className="hint">还没有定时。跟主管说周期要做的事，会排在这里。</p>
                ) : (
                  <ul className="memories">
                    {dutiesHere.map((duty) => (
                      <li key={duty.id}>
                        <p>
                          {dutyWhen(duty)}：{duty.task}
                        </p>
                        <button type="button" onClick={() => void dropDuty(duty.id)} disabled={saving}>
                          取消定时
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
            {form.kind === "edit" ? (
              <div className="field">
                <span>记忆</span>
                {memories.length === 0 ? (
                  <p className="hint">还没有记忆。做完的事，和记住的事实，会出现在这里。</p>
                ) : (
                  <ul className="memories">
                    {memories.map((note) => (
                      <li key={note.id}>
                        <p>{note.text}</p>
                        <button type="button" onClick={() => void forget(note.id)} disabled={saving}>
                          忘掉
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
            {error ? <p className="file-error">{error}</p> : null}
          </form>
        ) : null}
      </div>
      <div className="staff-bar">
        {form ? (
          <>
            {leaving ? <p className="hint">确认后，这份档案去掉，工位留着。</p> : null}
            <button type="submit" form="person-form" className="save" disabled={saving}>
              {form.kind === "create" ? "入职" : "保存"}
            </button>
            {form.kind === "edit" ? (
              <button type="button" className="leave" onClick={() => void leave()} disabled={saving}>
                {leaving ? "确认离职" : "离职"}
              </button>
            ) : null}
            <button type="button" onClick={closeForm} disabled={saving}>
              取消
            </button>
          </>
        ) : floorDraft ? null : (
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
    model: "deepseek-flash",
    thinking: "low",
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
    model: person.model,
    thinking: person.thinking,
  };
}

function DepartmentForm({
  department,
  draft,
  onDepartment,
  onCreateFloor,
  onDiscardFloor,
  onPreviewFloor,
  onRemoveFloor,
  onLook,
  onPets,
}: {
  department: Department | null;
  draft: DepartmentDraft | null;
  onDepartment: (department: Department) => void;
  onCreateFloor: (draft: DepartmentDraft) => Promise<void>;
  onDiscardFloor: () => void;
  onPreviewFloor: (draft: DepartmentDraft) => void;
  onRemoveFloor: (id: string) => Promise<void>;
  onLook: (look: RoomLook | null) => void;
  onPets: (pets: PetId[] | null) => void;
}) {
  const opening = department ?? draft ?? { floor: 1, name: "", rules: "", seats: 4, pets: "", ...DEFAULT_ROOM };
  const [floor, setFloor] = useState(String(opening.floor));
  const [name, setName] = useState(opening.name);
  const [seats, setSeats] = useState(String(opening.seats));
  const [rules, setRules] = useState(opening.rules);
  const [style, setStyle] = useState<RoomStyle>(opening.style ?? DEFAULT_ROOM.style);
  const [wall, setWall] = useState(opening.wall ?? DEFAULT_ROOM.wall);
  const [ground, setGround] = useState(opening.ground ?? DEFAULT_ROOM.ground);
  const [trim, setTrim] = useState(opening.trim ?? DEFAULT_ROOM.trim);
  const [wood, setWood] = useState(opening.wood ?? DEFAULT_ROOM.wood);
  const [pets, setPets] = useState<PetId[]>(petIds(opening.pets) ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!department) return;
    setFloor(String(department.floor));
    setName(department.name);
    setSeats(String(department.seats));
    setRules(department.rules);
    setStyle(department.style ?? DEFAULT_ROOM.style);
    setWall(department.wall ?? DEFAULT_ROOM.wall);
    setGround(department.ground ?? DEFAULT_ROOM.ground);
    setTrim(department.trim ?? DEFAULT_ROOM.trim);
    setWood(department.wood ?? DEFAULT_ROOM.wood);
    setPets(petIds(department.pets) ?? []);
    setError(null);
    setRemoving(false);
    setSaving(false);
  }, [department]);

  useEffect(() => {
    onLook({ style, wall, ground, trim, wood });
  }, [onLook, style, wall, ground, trim, wood]);

  useEffect(() => () => onLook(null), [onLook]);

  useEffect(() => {
    onPets(pets);
  }, [onPets, pets]);

  useEffect(() => () => onPets(null), [onPets]);

  useEffect(() => {
    if (department) return;
    const seatsNo = Number(seats);
    onPreviewFloor({
      floor: Number(floor),
      name,
      seats: Number.isInteger(seatsNo) ? seatsNo : 4,
      rules,
      style,
      wall,
      ground,
      trim,
      wood,
      pets: pets.join(","),
    });
  }, [department, floor, name, seats, rules, style, wall, ground, trim, wood, pets, onPreviewFloor]);

  async function remove() {
    if (!department) {
      onDiscardFloor();
      return;
    }
    if (saving) return;
    if (!removing) {
      setRemoving(true);
      setError(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onRemoveFloor(department.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "这一层没有拆掉。");
    } finally {
      setSaving(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const body: DepartmentDraft = {
      floor: Number(floor),
      name,
      seats: Number(seats),
      rules,
      style,
      wall,
      ground,
      trim,
      wood,
      pets: pets.join(","),
    };
    try {
      if (!department) {
        await onCreateFloor(body);
        return;
      }
      const next = await updateDepartment(department.id, body);
      onDepartment(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "这一层没有写成。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="file floor-file" onSubmit={(event) => void save(event)}>
      <div className="floor-fields">
        <label>
          楼层
          <input value={floor} onChange={(event) => setFloor(event.target.value)} inputMode="numeric" />
        </label>
        <label>
          名称
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={16}
            placeholder={department ? undefined : "比如：调研组"}
          />
        </label>
        <label>
          工位
          <input value={seats} onChange={(event) => setSeats(event.target.value)} inputMode="numeric" />
        </label>
      </div>
        <div className="field">
          <span>楼</span>
          <div className="presets">
            {ROOM_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className={sameRoom(preset.look, { style, wall, ground, trim, wood }) ? "on" : ""}
                style={{ background: preset.look.wall }}
                aria-label={preset.name}
                onClick={() => {
                  setStyle(preset.look.style);
                  setWall(preset.look.wall);
                  setGround(preset.look.ground);
                  setTrim(preset.look.trim);
                  setWood(preset.look.wood);
                }}
              />
            ))}
          </div>
          <div className="choices">
            {ROOM_STYLES.map((item) => (
              <button key={item} type="button" className={style === item ? "on" : ""} onClick={() => setStyle(item)}>
                {ROOM_STYLE_LABEL[item]}
              </button>
            ))}
          </div>
          <div className="colors">
            <Color label="墙" value={wall} onChange={setWall} />
            <Color label="地" value={ground} onChange={setGround} />
            <Color label="线" value={trim} onChange={setTrim} />
            <Color label="木" value={wood} onChange={setWood} />
          </div>
        </div>
        <div className="field">
          <span>宠物</span>
          <div className="choices">
            {PET_CHOICES.map((pet) => (
              <button
                key={pet.id}
                type="button"
                className={pets.includes(pet.id) ? "on" : ""}
                onClick={() =>
                  setPets((current) =>
                    current.includes(pet.id) ? current.filter((id) => id !== pet.id) : [...current, pet.id],
                  )
                }
              >
                {pet.name}
              </button>
            ))}
          </div>
          <p className="hint">点一下放到这一层，再点一下拿掉。没选的楼层没有宠物。</p>
        </div>
        <label>
          规章制度
        <textarea
          value={rules}
          onChange={(event) => setRules(event.target.value)}
          placeholder="比如：合同先由撰写人写完，交给盖章人，盖章人再交给主管。"
          maxLength={8000}
        />
      </label>
      <p className="hint">主管和这一层的员工都会读到。工位是这一层最多能有几位员工，主管不占工位。</p>
      {removing ? <p className="hint">确认后，这一层的人、对话和规章制度都会去掉。</p> : null}
      {error ? <p className="file-error">{error}</p> : null}
      <div className="floor-actions">
        <button type="submit" disabled={saving}>
          {saving ? "在写" : "保存这一层"}
        </button>
        <button type="button" className="leave" onClick={() => void remove()} disabled={Boolean(department) && saving}>
          {department ? (removing ? "确认拆掉" : "拆掉这一层") : "取消"}
        </button>
      </div>
    </form>
  );
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

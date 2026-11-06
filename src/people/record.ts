import type { HairStyle, Look } from "../office/types";

export const GENDERS = ["female", "male", "unspecified"] as const;

export type Gender = (typeof GENDERS)[number];

export const GENDER_LABEL: Record<Gender, string> = {
  female: "女",
  male: "男",
  unspecified: "不标明",
};

export const HAIR_LABEL: Record<HairStyle, string> = {
  short: "短发",
  bun: "髻",
  crop: "寸头",
};

/** Starting appearances. The form can still change every color. */
export const LOOK_PRESETS: Look[] = [
  {
    hair: "#2a211c",
    skin: "#e4b48f",
    shirt: "#1f3a32",
    pants: "#3a342c",
    hairStyle: "short",
  },
  {
    hair: "#4a2c24",
    skin: "#f0c2a0",
    shirt: "#c4654a",
    pants: "#3d342e",
    hairStyle: "bun",
  },
  {
    hair: "#6a5438",
    skin: "#d9a882",
    shirt: "#3d6f8c",
    pants: "#2e3640",
    hairStyle: "crop",
  },
  {
    hair: "#1c1a22",
    skin: "#c9926e",
    shirt: "#c6a15b",
    pants: "#34302c",
    hairStyle: "short",
  },
];

export const GENERIC_BRIEF = "办公室里的人。";
export const GENERIC_DOSSIER = "没有额外设定。做交给他们的事。";

/** Employee desks. The lead's desk is separate and does not count. */
export const MODELS = ["deepseek-flash", "deepseek-v4-pro"] as const;
export type OfficeModel = (typeof MODELS)[number];
export const MODEL_LABEL: Record<OfficeModel, string> = {
  "deepseek-flash": "DeepSeek Flash",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
};

export const THINKING = ["off", "low", "high", "max"] as const;
export type Thinking = (typeof THINKING)[number];
export const THINKING_LABEL: Record<Thinking, string> = {
  off: "关闭",
  low: "低",
  high: "高",
  max: "最大",
};

/** Levels the catalog actually accepts. V4 Pro has no low. */
export const THINKING_FOR: Record<OfficeModel, readonly Thinking[]> = {
  "deepseek-flash": ["off", "low", "high", "max"],
  "deepseek-v4-pro": ["off", "high", "max"],
};

export function thinkingFor(model: string, thinking: string): Thinking {
  const allowed = THINKING_FOR[model as OfficeModel] ?? THINKING;
  return (allowed as readonly string[]).includes(thinking) ? (thinking as Thinking) : "high";
}

export const STAFF_LIMIT = 8;
export const STAFF_FULL = "工位已满。员工最多八个。";

export type SeatChange = { kind: "create" | "edit"; id?: string; isLead: boolean };

export function staffCount(people: { id: string; is_lead: 0 | 1 }[], change?: SeatChange) {
  const rows = people.map((person) => ({
    lead:
      change?.kind === "edit" && change.id === person.id
        ? change.isLead
        : change?.isLead
          ? false
          : person.is_lead === 1,
  }));
  if (change?.kind === "create") rows.push({ lead: change.isLead });
  const leads = rows.filter((row) => row.lead).length;
  return rows.length - (leads > 0 ? 1 : 0);
}

export function staffFits(people: { id: string; is_lead: 0 | 1 }[], change?: SeatChange) {
  return staffCount(people, change) <= STAFF_LIMIT;
}

export function canHire(people: { id: string; is_lead: 0 | 1 }[]) {
  return (
    staffFits(people, { kind: "create", isLead: false }) ||
    staffFits(people, { kind: "create", isLead: true })
  );
}

/** Lowest empty employee desk. Leads do not occupy one, and ignored ids are treated as already gone. */
export function openSeat(
  people: { id: string; is_lead: 0 | 1; seat: number | null }[],
  ignore: string[] = [],
): number | null {
  const taken = new Set<number>();
  for (const person of people) {
    if (ignore.includes(person.id) || person.is_lead === 1 || person.seat === null) continue;
    taken.add(person.seat);
  }
  for (let seat = 0; seat < STAFF_LIMIT; seat += 1) {
    if (!taken.has(seat)) return seat;
  }
  return null;
}

/**
 * One row in D1 table `people`.
 * `brief` and `dossier` are null when the file leaves them blank.
 * Pi may only dispatch rows in this table. Rehearsal does not read it.
 */
export type PersonRow = {
  id: string;
  name: string;
  gender: Gender;
  hair: string;
  skin: string;
  shirt: string;
  pants: string;
  hair_style: HairStyle;
  brief: string | null;
  dossier: string | null;
  is_lead: 0 | 1;
  model: OfficeModel;
  thinking: Thinking;
  /** Employee desk 0–7. Null while this person is the lead. */
  seat: number | null;
  created_at: number;
  updated_at: number;
};

export type PersonDraft = {
  name: string;
  gender: Gender;
  hair: string;
  skin: string;
  shirt: string;
  pants: string;
  hair_style: HairStyle;
  brief: string | null;
  dossier: string | null;
  is_lead: 0 | 1;
  model: OfficeModel;
  thinking: Thinking;
};

const NAME_MAX = 32;
const BRIEF_MAX = 80;
const DOSSIER_MAX = 4000;
const HEX = /^#[0-9a-f]{6}$/;
const HAIR: readonly HairStyle[] = ["short", "bun", "crop"];

export function lookOf(person: Pick<PersonRow, "hair" | "skin" | "shirt" | "pants" | "hair_style">): Look {
  return {
    hair: person.hair,
    skin: person.skin,
    shirt: person.shirt,
    pants: person.pants,
    hairStyle: person.hair_style,
  };
}

export function identityOf(person: { brief: string | null; dossier: string | null }) {
  const brief = filled(person.brief);
  const dossier = filled(person.dossier);
  return {
    generic: brief === null && dossier === null,
    brief: brief ?? GENERIC_BRIEF,
    dossier: dossier ?? GENERIC_DOSSIER,
  };
}

export function parseDraft(input: unknown): { ok: true; value: PersonDraft } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "看不懂这份档案。" };
  const body = input as Record<string, unknown>;
  if (typeof body.name !== "string") return { ok: false, error: "看不懂这份档案。" };
  const name = body.name.trim();
  if (!name) return { ok: false, error: "姓名不能空着。" };
  if ([...name].length > NAME_MAX) return { ok: false, error: "姓名太长。" };
  if (typeof body.gender !== "string" || !GENDERS.includes(body.gender as Gender)) {
    return { ok: false, error: "要选性别。" };
  }
  const hair = color(body.hair);
  const skin = color(body.skin);
  const shirt = color(body.shirt);
  const pants = color(body.pants);
  if (!hair || !skin || !shirt || !pants) return { ok: false, error: "形象不完整。" };
  if (typeof body.hair_style !== "string" || !HAIR.includes(body.hair_style as HairStyle)) {
    return { ok: false, error: "形象不完整。" };
  }
  const brief = optionalText(body.brief, BRIEF_MAX, true, "一句话太长。");
  if (!brief.ok) return brief;
  const dossier = optionalText(body.dossier, DOSSIER_MAX, false, "详细设定太长。");
  if (!dossier.ok) return dossier;
  const isLead = leadFlag(body.is_lead);
  if (isLead === null) return { ok: false, error: "要选是不是主管。" };
  if (typeof body.model !== "string" || !MODELS.includes(body.model as OfficeModel)) {
    return { ok: false, error: "要选一个模型。" };
  }
  if (typeof body.thinking !== "string" || !THINKING.includes(body.thinking as Thinking)) {
    return { ok: false, error: "要选思考级别。" };
  }
  if (!THINKING_FOR[body.model as OfficeModel].includes(body.thinking as Thinking)) {
    return { ok: false, error: "这个模型没有这个思考级别。" };
  }
  return {
    ok: true,
    value: {
      name,
      gender: body.gender as Gender,
      hair,
      skin,
      shirt,
      pants,
      hair_style: body.hair_style as HairStyle,
      brief: brief.value,
      dossier: dossier.value,
      is_lead: isLead,
      model: body.model as OfficeModel,
      thinking: body.thinking as Thinking,
    },
  };
}

export function applyPerson(people: PersonRow[], person: PersonRow): PersonRow[] {
  let found = false;
  const next = people.map((item) => {
    if (item.id === person.id) {
      found = true;
      return person;
    }
    if (person.is_lead === 1 && item.is_lead === 1) {
      return { ...item, is_lead: 0 as const, seat: openSeat(people, [person.id, item.id]) };
    }
    return item;
  });
  return found ? next : [...next, person];
}

export function dropPerson(people: PersonRow[], id: string) {
  return people.filter((person) => person.id !== id);
}

function leadFlag(value: unknown): 0 | 1 | null {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  return null;
}

function filled(value: string | null | undefined) {
  const text = value?.trim() ?? "";
  return text ? text : null;
}

function color(value: unknown) {
  if (typeof value !== "string" || !HEX.test(value.toLowerCase())) return null;
  return value.toLowerCase();
}

function optionalText(
  value: unknown,
  max: number,
  collapse: boolean,
  tooLong: string,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false, error: "看不懂这份档案。" };
  const text = collapse ? value.trim().replace(/\s+/g, " ") : value.trim();
  if (!text) return { ok: true, value: null };
  if ([...text].length > max) return { ok: false, error: tooLong };
  return { ok: true, value: text };
}

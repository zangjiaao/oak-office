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
    },
  };
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

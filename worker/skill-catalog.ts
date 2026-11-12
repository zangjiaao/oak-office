import type { Env } from "./env";
import { officeJson } from "./office-client";
import { skillsForPrompt, type SkillEntry } from "./skill-prompt";

/** Ask the office machine which skills are installed. The worker cannot see that directory. */
export async function skillCatalog(env: Env) {
  const result = await officeJson<{ ok?: boolean; skills?: unknown }>(env, "/skills", {});
  if (!result.ok || !Array.isArray(result.payload.skills)) return skillsForPrompt(null);
  return skillsForPrompt(result.payload.skills.filter(isSkill));
}

function isSkill(value: unknown): value is SkillEntry {
  if (!value || typeof value !== "object") return false;
  const skill = value as { name?: unknown; description?: unknown; file?: unknown };
  return typeof skill.name === "string" && typeof skill.description === "string" && typeof skill.file === "string";
}

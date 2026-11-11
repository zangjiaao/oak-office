import type { Env } from "./env";
import { skillsForPrompt, type SkillEntry } from "./skill-prompt";

/** Ask the office machine which skills are installed. The worker cannot see that directory. */
export async function skillCatalog(env: Env) {
  const host = env.OFFICE_HOST?.trim();
  const token = env.OFFICE_HOST_TOKEN?.trim();
  if (!host || !token) return skillsForPrompt(null);
  try {
    const response = await fetch(`${host}/skills`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: "{}",
    });
    const payload = (await response.json()) as { ok?: boolean; skills?: unknown };
    if (!response.ok || payload.ok === false || !Array.isArray(payload.skills)) return skillsForPrompt(null);
    return skillsForPrompt(payload.skills.filter(isSkill));
  } catch {
    return skillsForPrompt(null);
  }
}

function isSkill(value: unknown): value is SkillEntry {
  if (!value || typeof value !== "object") return false;
  const skill = value as { name?: unknown; description?: unknown; file?: unknown };
  return typeof skill.name === "string" && typeof skill.description === "string" && typeof skill.file === "string";
}

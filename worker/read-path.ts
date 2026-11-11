import { realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DENY = "只能读工作目录里的文件，或 ~/.agents/skills 里的技能文件。";

export async function resolveReadPath(
  workspace: string,
  input: unknown,
  roots?: { home?: string; skills?: string },
): Promise<{ ok: true; file: string; kind: "workspace" | "skill" } | { ok: false; status: number; error: string }> {
  if (typeof input !== "string") return { ok: false, status: 400, error: DENY };
  const text = input.trim();
  if (!text || text.includes("\0") || text.split(/[\\/]/).includes("..")) return { ok: false, status: 400, error: DENY };
  const home = roots?.home ?? os.homedir();
  const skills = roots?.skills ?? path.join(home, ".agents", "skills");
  if (text === "~" || text.startsWith("~/")) {
    const rest = text === "~" ? "" : text.slice(2);
    return resolveSkill(path.resolve(home, rest), skills);
  }
  const abs = path.resolve(workspace, text);
  if (inside(workspace, abs)) return { ok: true, file: abs, kind: "workspace" };
  if (path.isAbsolute(text)) return resolveSkill(path.resolve(text), skills);
  return { ok: false, status: 400, error: DENY };
}

async function resolveSkill(abs: string, skillsRoot: string) {
  const root = path.resolve(skillsRoot);
  if (!inside(root, abs)) return { ok: false as const, status: 400, error: DENY };
  let real: string;
  try {
    real = await realpath(abs);
  } catch {
    return { ok: false as const, status: 404, error: "没有这个文件。" };
  }
  if (!inside(root, real)) return { ok: false as const, status: 400, error: "技能文件只能在 ~/.agents/skills 里面。" };
  return { ok: true as const, file: real, kind: "skill" as const };
}

function inside(root: string, abs: string) {
  const rel = path.relative(root, abs);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

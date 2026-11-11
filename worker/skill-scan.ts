import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const MAX_SKILLS = 24;
const MAX_DESCRIPTION = 1024;

export type InstalledSkill = { name: string; description: string; file: string };

/** SKILL.md files under ~/.agents/skills. A directory with SKILL.md is one skill. */
export async function listInstalledSkills(root = path.join(os.homedir(), ".agents", "skills")) {
  const found: InstalledSkill[] = [];
  await walk(root, 0, found);
  found.sort((a, b) => a.name.localeCompare(b.name, "en"));
  return found.slice(0, MAX_SKILLS);
}

async function walk(dir: string, depth: number, found: InstalledSkill[]) {
  if (depth > 4 || found.length >= MAX_SKILLS) return;
  const info = await stat(dir).catch(() => null);
  if (!info?.isDirectory()) return;
  const names = await readdir(dir).catch(() => [] as string[]);
  if (names.includes("SKILL.md")) {
    const skill = await readSkill(path.join(dir, "SKILL.md"), path.basename(dir));
    if (skill) found.push(skill);
    return;
  }
  for (const name of names) {
    if (name.startsWith(".") || name === "node_modules") continue;
    await walk(path.join(dir, name), depth + 1, found);
  }
}

async function readSkill(file: string, directoryName: string): Promise<InstalledSkill | null> {
  const raw = await readFile(file, "utf8").catch(() => "");
  const fields = frontmatter(raw.replace(/^\uFEFF/, ""));
  if (!fields || fields["disable-model-invocation"] === "true") return null;
  const description = clip(fields.description ?? "", MAX_DESCRIPTION);
  if (!description) return null;
  const named = (fields.name ?? "").trim();
  return { name: named || directoryName, description, file };
}

function frontmatter(raw: string) {
  if (!raw.startsWith("---")) return null;
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return null;
  const fields: Record<string, string> = {};
  let key = "";
  for (const line of raw.slice(raw.indexOf("\n") + 1, end).split(/\r?\n/)) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (match && !/^\s/.test(line)) {
      key = match[1];
      fields[key] = unquote(match[2].trim());
      continue;
    }
    if (key && /^\s+\S/.test(line)) {
      const extra = line.trim();
      fields[key] = fields[key] ? `${fields[key]} ${extra}` : extra;
    }
  }
  return fields;
}

function unquote(value: string) {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (value === ">" || value === "|" || value === ">-" || value === "|-") return "";
  return value;
}

function clip(value: string, max: number) {
  const chars = [...value.trim()];
  return chars.length > max ? chars.slice(0, max).join("") : chars.join("");
}

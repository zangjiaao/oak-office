import { parseDepartment, type Department, type DepartmentDraft } from "../src/people/department";
import type { D1Database } from "./env";

const COLUMNS = "id, floor, name, rules, seats, style, wall, ground, trim, wood, created_at, updated_at";

export function readDepartment(input: unknown) {
  return parseDepartment(input);
}

export async function listDepartments(db: D1Database): Promise<Department[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUMNS} FROM department ORDER BY floor ASC, id ASC`)
    .all<Department>();
  return results;
}

export async function departmentById(db: D1Database, id: string): Promise<Department | null> {
  return db.prepare(`SELECT ${COLUMNS} FROM department WHERE id = ?`).bind(id).first<Department>();
}

export async function createDepartment(
  db: D1Database,
  draft: DepartmentDraft,
): Promise<{ ok: true; department: Department } | { ok: false; error: string; status: number }> {
  const taken = await db
    .prepare("SELECT id FROM department WHERE floor = ?")
    .bind(draft.floor)
    .first<{ id: string }>();
  if (taken) return { ok: false, error: "这一层已经有部门了。", status: 400 };
  const now = Date.now();
  const department: Department = { id: crypto.randomUUID(), ...draft, created_at: now, updated_at: now };
  await db
    .prepare(`INSERT INTO department (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      department.id,
      department.floor,
      department.name,
      department.rules,
      department.seats,
      department.style,
      department.wall,
      department.ground,
      department.trim,
      department.wood,
      department.created_at,
      department.updated_at,
    )
    .run();
  return { ok: true, department };
}

export async function updateDepartment(
  db: D1Database,
  id: string,
  draft: DepartmentDraft,
): Promise<{ ok: true; department: Department } | { ok: false; error: string; status: number } | null> {
  const existing = await departmentById(db, id);
  if (!existing) return null;
  const taken = await db
    .prepare("SELECT id FROM department WHERE floor = ? AND id != ?")
    .bind(draft.floor, id)
    .first<{ id: string }>();
  if (taken) return { ok: false, error: "这一层已经有部门了。", status: 400 };
  const crowded = await seatsFit(db, id, draft.seats);
  if (!crowded) return { ok: false, error: "工位比现在的人少。先让多余的员工离开。", status: 400 };
  const department: Department = { ...existing, ...draft, updated_at: Date.now() };
  await db
    .prepare(
      "UPDATE department SET floor = ?, name = ?, rules = ?, seats = ?, style = ?, wall = ?, ground = ?, trim = ?, wood = ?, updated_at = ? WHERE id = ?",
    )
    .bind(
      department.floor,
      department.name,
      department.rules,
      department.seats,
      department.style,
      department.wall,
      department.ground,
      department.trim,
      department.wood,
      department.updated_at,
      id,
    )
    .run();
  return { ok: true, department };
}

export async function removeDepartment(
  db: D1Database,
  id: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number } | null> {
  const existing = await departmentById(db, id);
  if (!existing) return null;
  const row = await db.prepare("SELECT COUNT(*) AS n FROM department").first<{ n: number }>();
  if (Number(row?.n ?? 0) <= 1) return { ok: false, error: "至少留一层。", status: 400 };
  await db.batch([
    db.prepare("DELETE FROM duty WHERE person_id IN (SELECT id FROM people WHERE department_id = ?)").bind(id),
    db.prepare("DELETE FROM person_memory WHERE person_id IN (SELECT id FROM people WHERE department_id = ?)").bind(id),
    db.prepare("DELETE FROM work_desk WHERE person_id IN (SELECT id FROM people WHERE department_id = ?)").bind(id),
    db.prepare("DELETE FROM work_line WHERE department_id = ?").bind(id),
    db.prepare("DELETE FROM people WHERE department_id = ?").bind(id),
    db.prepare("DELETE FROM department WHERE id = ?").bind(id),
  ]);
  return { ok: true };
}

async function seatsFit(db: D1Database, departmentId: string, seats: number) {
  const row = await db
    .prepare(
      "SELECT COUNT(*) AS n, MAX(seat) AS top FROM people WHERE department_id = ? AND is_lead = 0",
    )
    .bind(departmentId)
    .first<{ n: number; top: number | null }>();
  if (!row) return true;
  const count = Number(row.n);
  const top = row.top === null ? null : Number(row.top);
  if (count > seats) return false;
  return top === null || top < seats;
}

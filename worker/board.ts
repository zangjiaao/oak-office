import { obj, str, type Static } from "@earendil-works/pi-schema";
import type { Env } from "./env";

export const BOARD_LIMIT = 24;
const TITLE_MAX = 80;

export type BoardState = "open" | "doing" | "done";

export type BoardTask = {
  id: string;
  department_id: string;
  title: string;
  person_id: string | null;
  state: BoardState;
  created_at: number;
  updated_at: number;
};

const BoardArgs = obj({
  action: str(),
  title: str(),
  task_id: str(),
  person_id: str(),
  state: str(),
});

export async function listBoard(db: Env["DB"], departmentId: string) {
  const rows = await db
    .prepare(
      `SELECT id, department_id, title, person_id, state, created_at, updated_at
       FROM board_task WHERE department_id = ? ORDER BY created_at ASC, id ASC`,
    )
    .bind(departmentId)
    .all<BoardTask>();
  return rows.results;
}

export async function createBoardTask(db: Env["DB"], departmentId: string, title: string, personId: string | null) {
  const text = title.trim().replace(/\s+/g, " ");
  if (!text) return fail("先写这件是什么事。", 400);
  if ([...text].length > TITLE_MAX) return fail("这件事太长。", 400);
  const floor = await db.prepare("SELECT id FROM department WHERE id = ?").bind(departmentId).first<{ id: string }>();
  if (!floor) return fail("没有这一层。", 404);
  if (personId && !(await personOnFloor(db, departmentId, personId))) return fail("这个人不在这一层。", 400);
  const count = await db
    .prepare("SELECT COUNT(*) AS n FROM board_task WHERE department_id = ?")
    .bind(departmentId)
    .first<{ n: number }>();
  if (Number(count?.n ?? 0) >= BOARD_LIMIT) return fail("板上已经满了。先清掉几件。", 400);
  const now = Date.now();
  const task: BoardTask = {
    id: crypto.randomUUID(),
    department_id: departmentId,
    title: text,
    person_id: personId,
    state: "open",
    created_at: now,
    updated_at: now,
  };
  await db
    .prepare(
      `INSERT INTO board_task (id, department_id, title, person_id, state, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', ?, ?)`,
    )
    .bind(task.id, task.department_id, task.title, task.person_id, task.created_at, task.updated_at)
    .run();
  return { ok: true as const, task };
}

export async function editBoardTask(db: Env["DB"], departmentId: string, id: string, title: string, personId: string | null) {
  const text = title.trim().replace(/\s+/g, " ");
  if (!text) return fail("先写这件是什么事。", 400);
  if ([...text].length > TITLE_MAX) return fail("这件事太长。", 400);
  const existing = await ownedTask(db, departmentId, id);
  if (!existing) return fail("看板上没有这件事。", 404);
  if (personId && !(await personOnFloor(db, departmentId, personId))) return fail("这个人不在这一层。", 400);
  const now = Date.now();
  await db.prepare("UPDATE board_task SET title = ?, person_id = ?, updated_at = ? WHERE id = ?").bind(text, personId, now, id).run();
  return { ok: true as const, task: { ...existing, title: text, person_id: personId, updated_at: now } };
}

export async function setBoardState(db: Env["DB"], departmentId: string, id: string, state: string) {
  if (!isState(state)) return fail("状态用还没做、在做或划掉。", 400);
  const existing = await ownedTask(db, departmentId, id);
  if (!existing) return fail("看板上没有这件事。", 404);
  const now = Date.now();
  await db.prepare("UPDATE board_task SET state = ?, updated_at = ? WHERE id = ?").bind(state, now, id).run();
  return { ok: true as const, task: { ...existing, state, updated_at: now } };
}

export async function removeBoardTask(db: Env["DB"], departmentId: string, id: string) {
  const existing = await ownedTask(db, departmentId, id);
  if (!existing) return fail("看板上没有这件事。", 404);
  await db.prepare("DELETE FROM board_task WHERE id = ?").bind(id).run();
  return { ok: true as const };
}

export async function assignBoardTask(db: Env["DB"], departmentId: string, id: string, personId: string | null) {
  const existing = await ownedTask(db, departmentId, id);
  if (!existing) return fail("看板上没有这件事。", 404);
  if (personId && !(await personOnFloor(db, departmentId, personId))) return fail("这个人不在这一层。", 400);
  const now = Date.now();
  await db.prepare("UPDATE board_task SET person_id = ?, updated_at = ? WHERE id = ?").bind(personId, now, id).run();
  return { ok: true as const, task: { ...existing, person_id: personId, updated_at: now } };
}

export function boardLines(tasks: BoardTask[], people: { id: string; name: string }[]) {
  if (!tasks.length) return "看板上还没有一次性任务。新建、指定人或划掉都用 board。";
  const lines = tasks.map((task) => {
    const who = task.person_id ? (people.find((person) => person.id === task.person_id)?.name ?? "已离开") : "不指定";
    return `- ${task.id} ${stateLabel(task.state)} ${who} ${task.title}`;
  });
  return `看板上的一次性任务。用 board 新建、改负责人或划掉。定时不在这里改。\n${lines.join("\n")}`;
}

export function boardTool(env: Env, departmentId: string) {
  return {
    name: "board",
    label: "看板",
    description:
      "使用这一层的看板。一次调用处理一批，不要一件调用一次。action=add 新建，title 一行一件，每行最多 80 字。person_id 写员工 id 或留空，这一次新建的都会交给这个人。state 写 open、doing 或 done。action=assign 改负责人，task_id 一行一个 id，都交给 person_id。action=state 改状态，task_id 一行一条，写成「任务id open」或「任务id doing」或「任务id done」。返回里的 task_id 可填进 ask 的 board_task_id。定时不在这里改。",
    parameters: BoardArgs,
    executionMode: "sequential" as const,
    execute: async (_id: string, args: Static<typeof BoardArgs>) => {
      const action = args.action.trim();
      const personId = args.person_id.trim() || null;
      if (action === "add") {
        const titles = args.title
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        if (!titles.length) return miss("先写这件是什么事。");
        const wanted = args.state.trim();
        const noted = [];
        for (const title of titles) {
          const created = await createBoardTask(env.DB, departmentId, title, personId);
          if (!created.ok) return miss(noted.length ? `${noted.join("\n")}\n其余没记上：${created.error}` : created.error);
          const marked = wanted && wanted !== "open" ? await setBoardState(env.DB, departmentId, created.task.id, wanted) : created;
          if (!marked.ok) return miss(`${noted.join("\n")}\n其余没记上：${marked.error}`);
          noted.push(`${marked.task.id} ${stateLabel(marked.task.state)}：${marked.task.title}`);
        }
        return text(`已记上\n${noted.join("\n")}`);
      }
      if (action === "assign") {
        const ids = args.task_id
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter((line) => line.length > 0);
        if (!ids.length) return miss("先指明看板上的哪一件。");
        const noted = [];
        for (const id of ids) {
          const assigned = await assignBoardTask(env.DB, departmentId, id, personId);
          if (!assigned.ok) return miss(noted.length ? `${noted.join("\n")}\n其余没改：${assigned.error}` : assigned.error);
          noted.push(`${personId ? "已交给这个人" : "不指定"}：${assigned.task.title}`);
        }
        return text(noted.join("\n"));
      }
      if (action === "state") {
        const updates = stateUpdates(args.task_id, args.state.trim());
        if (!updates.length) return miss("先指明看板上的哪一件。");
        const noted = [];
        for (const update of updates) {
          const result = await setBoardState(env.DB, departmentId, update.id, update.state);
          if (!result.ok) return miss(noted.length ? `${noted.join("\n")}\n其余没改：${result.error}` : result.error);
          noted.push(`已标成${stateLabel(result.task.state)}：${result.task.title}`);
        }
        return text(noted.join("\n"));
      }
      return miss("action 用 add、assign 或 state。");
    },
  };
}

function stateUpdates(taskId: string, fallback: string) {
  return taskId
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [id, maybe] = line.split(/\s+/);
      return { id, state: maybe && isState(maybe) ? maybe : fallback };
    });
}

export function isState(value: string): value is BoardState {
  return value === "open" || value === "doing" || value === "done";
}

export function stateLabel(state: BoardState) {
  if (state === "doing") return "在做";
  if (state === "done") return "划掉";
  return "还没做";
}

async function personOnFloor(db: Env["DB"], departmentId: string, personId: string) {
  const row = await db
    .prepare("SELECT id FROM people WHERE id = ? AND department_id = ?")
    .bind(personId, departmentId)
    .first<{ id: string }>();
  return Boolean(row);
}

async function ownedTask(db: Env["DB"], departmentId: string, id: string) {
  return db
    .prepare(
      `SELECT id, department_id, title, person_id, state, created_at, updated_at
       FROM board_task WHERE id = ? AND department_id = ?`,
    )
    .bind(id, departmentId)
    .first<BoardTask>();
}

function fail(error: string, status: number) {
  return { ok: false as const, error, status };
}

function text(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {} };
}

function miss(value: string) {
  return { content: [{ type: "text" as const, text: value }], details: {}, isError: true };
}

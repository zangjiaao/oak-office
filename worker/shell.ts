import { BASH_MAX_SECONDS, hideSecrets } from "./bash-guard";
import type { Env } from "./env";

const KEEP = 40;
const COMMAND_MAX = 2_000;
const OUTPUT_MAX = 6_000;

export type ShellRun = {
  id: string;
  command: string;
  output: string;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number | null;
};

type Row = {
  id: string;
  command: string;
  output: string;
  exit_code: number | null;
  started_at: number;
  finished_at: number | null;
};

export async function startShell(db: Env["DB"], run: { id: string; departmentId: string; personId: string; command: string }) {
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO shell_run (id, department_id, person_id, command, output, exit_code, started_at, finished_at)
       VALUES (?, ?, ?, ?, '', NULL, ?, NULL)`,
    )
    .bind(run.id, run.departmentId, run.personId, clip(hideSecrets(run.command.trim()), COMMAND_MAX), now)
    .run();
  await db
    .prepare(
      `DELETE FROM shell_run WHERE person_id = ? AND id NOT IN (
         SELECT id FROM shell_run WHERE person_id = ? ORDER BY started_at DESC LIMIT ${KEEP}
       )`,
    )
    .bind(run.personId, run.personId)
    .run();
}

export async function finishShell(db: Env["DB"], id: string, output: string, exitCode: number | null) {
  await db
    .prepare("UPDATE shell_run SET output = ?, exit_code = ?, finished_at = ? WHERE id = ? AND finished_at IS NULL")
    .bind(clip(hideSecrets(output), OUTPUT_MAX), exitCode, Date.now(), id)
    .run();
}

export async function listShell(env: Env, personId: string): Promise<ShellRun[]> {
  const { results } = await env.DB
    .prepare(
      `SELECT id, command, output, exit_code, started_at, finished_at
       FROM shell_run WHERE person_id = ? ORDER BY started_at ASC, id ASC`,
    )
    .bind(personId)
    .all<Row>();
  const runs: ShellRun[] = [];
  for (const row of results) {
    let output = row.output;
    let exitCode = row.exit_code;
    let finishedAt = row.finished_at;
    if (finishedAt === null) {
      const live = await liveOutput(env, row.id);
      if (live) {
        output = live.text || output;
        if (live.done) {
          exitCode = live.exitCode;
          finishedAt = Date.now();
          await finishShell(env.DB, row.id, output, exitCode);
        }
      } else if (Date.now() - row.started_at > (BASH_MAX_SECONDS + 15) * 1000) {
        finishedAt = Date.now();
        if (!output) output = "脚本中断了，没有输出。";
        await finishShell(env.DB, row.id, output, null);
      }
    }
    runs.push({
      id: row.id,
      command: hideSecrets(row.command),
      output: hideSecrets(output),
      exitCode,
      startedAt: row.started_at,
      finishedAt,
    });
  }
  return runs;
}

async function liveOutput(env: Env, id: string) {
  const host = env.OFFICE_HOST?.trim();
  const token = env.OFFICE_HOST_TOKEN?.trim();
  if (!host || !token) return null;
  try {
    const response = await fetch(`${host}/bash-log`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ id }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { ok?: boolean; text?: string; done?: boolean; exitCode?: number };
    if (body.ok === false) return null;
    return { text: body.text ?? "", done: Boolean(body.done), exitCode: typeof body.exitCode === "number" ? body.exitCode : null };
  } catch {
    return null;
  }
}

function clip(value: string, max: number) {
  const chars = [...value];
  return chars.length > max ? chars.slice(0, max).join("") : value;
}

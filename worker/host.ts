import { spawn } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import path from "node:path";

const PORT = Number(process.env.OFFICE_HOST_PORT || 8788);
const ROOT = path.resolve("workspace");
const TOKEN = await tokenFromDevVars();
const APP = await devVar("OFFICE_APP");

const server = createServer((request, response) => {
  void handle(request, response).catch((error) => {
    send(response, 500, { ok: false, error: error instanceof Error ? error.message : "脚本工作区没写上。" });
  });
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(`office workspace on http://127.0.0.1:${PORT}`);
  if (!TOKEN) {
    console.error("定时不会跑：.dev.vars 里没有 OFFICE_HOST_TOKEN。");
    return;
  }
  const targets = tickTargets(APP);
  let preferred = targets[0];
  let complained = "";
  const tick = async () => {
    const order = [preferred, ...targets.filter((target) => target !== preferred)];
    for (const target of order) {
      try {
        const response = await fetch(`${target}/api/duties/tick`, {
          method: "POST",
          headers: { authorization: `Bearer ${TOKEN}` },
        });
        if (response.ok) {
          preferred = target;
          complained = "";
          return;
        }
        const note = `${target} 返回 ${response.status}`;
        if (complained !== note) {
          complained = note;
          console.error(`定时没跑起来：${note}`);
        }
        if (response.status === 401) return;
      } catch (error) {
        const note = `${target} ${error instanceof Error ? error.message : "连不上"}`;
        if (complained !== note) {
          complained = note;
          console.error(`定时没跑起来：${note}`);
        }
      }
    }
  };
  setTimeout(() => void tick(), 8_000);
  setInterval(() => void tick(), 30_000);
});

async function handle(request: IncomingMessage, response: import("node:http").ServerResponse) {
  if (request.method !== "POST") {
    send(response, 405, { ok: false, error: "只收 POST。" });
    return;
  }
  if (!TOKEN) {
    send(response, 401, { ok: false, error: "脚本工作区还没打开。在 .dev.vars 里写 OFFICE_HOST_TOKEN。" });
    return;
  }
  if (request.headers.authorization !== `Bearer ${TOKEN}`) {
    send(response, 401, { ok: false, error: "工作目录的口令不对。" });
    return;
  }
  const body = (await readJson(request)) as Record<string, unknown>;
  const action = request.url ?? "/";
  if (action === "/list") return list(response, body);
  if (action === "/read") return read(response, body);
  if (action === "/raw") return raw(response, body);
  if (action === "/write") return write(response, body);
  if (action === "/edit") return edit(response, body);
  if (action === "/bash") return bash(response, body);
  send(response, 404, { ok: false, error: "没有这个操作。" });
}

async function list(response: import("node:http").ServerResponse, body: Record<string, unknown>) {
  const folder = await locate(typeof body.path === "string" && body.path.trim() ? body.path : ".");
  if (!folder) return send(response, 400, { ok: false, error: "只能看工作目录里的文件夹。" });
  const info = await stat(folder).catch(() => null);
  if (!info?.isDirectory()) return send(response, 400, { ok: false, error: "这里不是文件夹。" });
  const names = await readdir(folder);
  const entries: { name: string; kind: "dir" | "file"; bytes: number }[] = [];
  for (const name of names) {
    const child = await stat(path.join(folder, name)).catch(() => null);
    if (!child) continue;
    entries.push({ name, kind: child.isDirectory() ? "dir" : "file", bytes: child.isDirectory() ? 0 : child.size });
  }
  entries.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "zh") : a.kind === "dir" ? -1 : 1));
  send(response, 200, { ok: true, entries });
}

async function raw(response: import("node:http").ServerResponse, body: Record<string, unknown>) {
  const file = await locate(body.path);
  if (!file) return send(response, 400, { ok: false, error: "只能拿工作目录里的文件。" });
  const info = await stat(file).catch(() => null);
  if (!info || info.isDirectory()) return send(response, 400, { ok: false, error: "这是文件夹。" });
  if (info.size > 2_000_000) return send(response, 400, { ok: false, error: "文件太大，屏幕里放不下。" });
  const data = await readFile(file);
  const name = path.basename(file).replace(/["\r\n]/g, "");
  response.writeHead(200, {
    "content-type": "application/octet-stream",
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
  });
  response.end(data);
}

async function read(response: import("node:http").ServerResponse, body: Record<string, unknown>) {
  const file = await locate(body.path);
  if (!file) return send(response, 400, { ok: false, error: "只能读工作目录里的文件。" });
  const text = await readFile(file, "utf8").catch(() => "");
  send(response, 200, { ok: true, text: clip(text, 12000) });
}

async function write(response: import("node:http").ServerResponse, body: Record<string, unknown>) {
  const file = await locate(body.path);
  if (!file || typeof body.content !== "string") return send(response, 400, { ok: false, error: "只能把文件写进工作目录。" });
  if ([...body.content].length > 100000) return send(response, 400, { ok: false, error: "文件太长。" });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, body.content, "utf8");
  send(response, 200, { ok: true, text: `已写入 ${String(body.path)}` });
}

async function edit(response: import("node:http").ServerResponse, body: Record<string, unknown>) {
  const file = await locate(body.path);
  if (!file || typeof body.old !== "string" || typeof body.new !== "string" || !body.old) {
    return send(response, 400, { ok: false, error: "修改要写明原句和新句。" });
  }
  const text = await readFile(file, "utf8").catch(() => null);
  if (text === null) return send(response, 404, { ok: false, error: "没有这个文件。" });
  const found = text.split(body.old).length - 1;
  if (found !== 1) return send(response, 400, { ok: false, error: found === 0 ? "原文对不上。" : "原文出现了不止一次。" });
  await writeFile(file, text.replace(body.old, body.new), "utf8");
  send(response, 200, { ok: true, text: `已修改 ${String(body.path)}` });
}

async function bash(response: import("node:http").ServerResponse, body: Record<string, unknown>) {
  const command = typeof body.command === "string" ? body.command.trim() : "";
  if (!command) return send(response, 400, { ok: false, error: "没有命令。" });
  await mkdir(ROOT, { recursive: true });
  const timeout = Math.min(30, Math.max(1, Number(body.timeout) || 20)) * 1000;
  const child = spawn(bashBin(), ["-lc", command], {
    cwd: ROOT,
    env: cleanEnv(),
  });
  let output = "";
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const finish = (body: unknown) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    send(response, 200, body);
  };
  const take = (chunk: Buffer) => {
    if (output.length < 8000) output += chunk.toString("utf8");
  };
  child.stdout?.on("data", take);
  child.stderr?.on("data", take);
  timer = setTimeout(() => child.kill("SIGKILL"), timeout);
  child.on("error", (error: NodeJS.ErrnoException) => {
    const missing = error.code === "ENOENT";
    finish({
      ok: false,
      error: missing ? "这台机器找不到 bash，脚本跑不了。" : "脚本没跑起来。",
    });
  });
  child.on("close", (code) => {
    finish({ ok: true, text: clip(output, 6000), exitCode: code ?? 1 });
  });
}

function bashBin() {
  const candidates =
    process.platform === "win32"
      ? ["C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Program Files\\Git\\usr\\bin\\bash.exe", "bash"]
      : ["/bin/bash", "/usr/bin/bash", "bash"];
  for (const bin of candidates) {
    if (bin === "bash") return bin;
    try {
      accessSync(bin, constants.X_OK);
      return bin;
    } catch {
      /* This path is not the shell. */
    }
  }
  return "bash";
}

async function locate(input: unknown) {
  if (typeof input !== "string") return null;
  const text = input.trim();
  if (!text || text.includes("\0") || text.split(/[\\/]/).includes("..")) return null;
  await mkdir(ROOT, { recursive: true });
  const abs = path.resolve(ROOT, text);
  const rel = path.relative(ROOT, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return abs;
}

function cleanEnv() {
  const env = { ...process.env };
  delete env.DEEPSEEK_API_KEY;
  delete env.TAVILY_API_KEY;
  delete env.OFFICE_HOST_TOKEN;
  return env;
}

function clip(text: string, max: number) {
  const chars = [...text];
  if (chars.length <= max) return text;
  return `${chars.slice(0, max).join("")}\n…后面省去了`;
}

function send(response: import("node:http").ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  return JSON.parse(text) as unknown;
}

function tickTargets(configured: string) {
  const targets = [configured, "http://localhost:5173", "http://127.0.0.1:5173"]
    .map((target) => target.trim().replace(/\/$/, ""))
    .filter((target) => target.startsWith("http://") || target.startsWith("https://"));
  return [...new Set(targets)];
}

async function tokenFromDevVars() {
  return devVar("OFFICE_HOST_TOKEN");
}

async function devVar(name: string) {
  const fromEnv = process.env[name]?.trim();
  if (fromEnv) return unquote(fromEnv);
  const text = await readFile(".dev.vars", "utf8").catch(() => "");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    if (trimmed.slice(0, eq).trim() === name) return unquote(trimmed.slice(eq + 1));
  }
  return "";
}

function unquote(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

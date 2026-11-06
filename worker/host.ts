import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import path from "node:path";

const PORT = Number(process.env.OFFICE_HOST_PORT || 8788);
const ROOT = path.resolve("workspace");
const TOKEN = await tokenFromDevVars();

const server = createServer((request, response) => {
  void handle(request, response).catch((error) => {
    send(response, 500, { ok: false, error: error instanceof Error ? error.message : "脚本工作区没写上。" });
  });
});
server.listen(PORT, "127.0.0.1", () => {
  console.log(`office workspace on http://127.0.0.1:${PORT}`);
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
  if (action === "/read") return read(response, body);
  if (action === "/write") return write(response, body);
  if (action === "/edit") return edit(response, body);
  if (action === "/bash") return bash(response, body);
  send(response, 404, { ok: false, error: "没有这个操作。" });
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

function bash(response: import("node:http").ServerResponse, body: Record<string, unknown>) {
  const command = typeof body.command === "string" ? body.command.trim() : "";
  if (!command) return send(response, 400, { ok: false, error: "没有命令。" });
  const timeout = Math.min(30, Math.max(1, Number(body.timeout) || 20)) * 1000;
  const child = spawn("bash", ["-lc", command], {
    cwd: ROOT,
    env: cleanEnv(),
  });
  let output = "";
  const take = (chunk: Buffer) => {
    if (output.length < 8000) output += chunk.toString("utf8");
  };
  child.stdout.on("data", take);
  child.stderr.on("data", take);
  const timer = setTimeout(() => child.kill("SIGKILL"), timeout);
  child.on("close", (code) => {
    clearTimeout(timer);
    send(response, 200, { ok: true, text: clip(output, 6000), exitCode: code ?? 1 });
  });
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

async function tokenFromDevVars() {
  if (process.env.OFFICE_HOST_TOKEN?.trim()) return process.env.OFFICE_HOST_TOKEN.trim();
  const text = await readFile(".dev.vars", "utf8").catch(() => "");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    if (trimmed.slice(0, eq).trim() === "OFFICE_HOST_TOKEN") return trimmed.slice(eq + 1).trim();
  }
  return "";
}

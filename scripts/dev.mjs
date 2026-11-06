import { spawn } from "node:child_process";
import process from "node:process";

const host = spawn(process.execPath, ["--experimental-strip-types", "worker/host.ts"], {
  stdio: "inherit",
  env: process.env,
});
const vite = spawn(process.execPath, ["node_modules/vite/bin/vite.js"], {
  stdio: "inherit",
  env: process.env,
});

let closed = false;
function shutdown(code) {
  if (closed) return;
  closed = true;
  if (!host.killed) host.kill("SIGTERM");
  if (!vite.killed) vite.kill("SIGTERM");
  setTimeout(() => process.exit(code ?? 0), 50);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
vite.on("exit", (code, signal) => {
  if (signal === "SIGTERM") return;
  shutdown(code ?? 0);
});
host.on("exit", (code, signal) => {
  if (signal === "SIGTERM" || closed) return;
  if (code) shutdown(code);
});

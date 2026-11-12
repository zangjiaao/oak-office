import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nodeBin = process.execPath;
const user = process.env.SUDO_USER || os.userInfo().username;
const major = Number(process.versions.node.split(".")[0]);

if (major < 22) {
  console.error("宿主需要 Node.js 22 或更新版本。");
  process.exit(1);
}

const unit = `[Unit]
Description=Oak Office host
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${user}
WorkingDirectory=${root}
ExecStart=${nodeBin} --experimental-strip-types ${path.join(root, "worker/host.ts")}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`;

const dir = mkdtempSync(path.join(os.tmpdir(), "oak-office-host-"));
const file = path.join(dir, "oak-office-host.service");
writeFileSync(file, unit);

const asRoot = (command, args) => {
  const privileged = typeof process.getuid === "function" && process.getuid() === 0;
  const result = privileged
    ? spawnSync(command, args, { stdio: "inherit" })
    : spawnSync("sudo", [command, ...args], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

asRoot("cp", [file, "/etc/systemd/system/oak-office-host.service"]);
asRoot("systemctl", ["daemon-reload"]);
asRoot("systemctl", ["enable", "--now", "oak-office-host"]);
rmSync(dir, { recursive: true, force: true });
console.log("oak-office-host 已安装并启动。日志：journalctl -u oak-office-host -f");

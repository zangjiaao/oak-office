import type { Cue } from "./types";

const s = (sec: number) => Math.round(sec * 1000);

export const SCRIPT: Cue[] = [
  { at: s(0.6), kind: "say", who: "user", text: "这周申报材料对得上吗？缺的直接列出来。" },
  { at: s(1.1), kind: "go", id: "lead", spot: "lead", pose: "think", label: "在听" },
  { at: s(1.3), kind: "go", id: "lin", spot: "lin", pose: "arrive", label: "进来了" },
  {
    at: s(3.2),
    kind: "say",
    who: "lead",
    text: "林可对清单，陈屿对口径。两个人一起看。",
  },
  { at: s(3.4), kind: "go", id: "lin", spot: "lin", pose: "read", label: "在对清单" },
  { at: s(3.5), kind: "go", id: "chen", spot: "chen", pose: "read", label: "在对口径" },
  { at: s(3.6), kind: "go", id: "lead", spot: "lead", pose: "idle", label: "等他们" },
  { at: s(7.2), kind: "go", id: "lin", spot: "lin", pose: "type", label: "在记缺项" },
  { at: s(7.4), kind: "go", id: "chen", spot: "chen", pose: "run", label: "在核条款" },
  { at: s(7.6), kind: "go", id: "song", spot: "song", pose: "wait", label: "等前两手" },
  { at: s(11.2), kind: "go", id: "lin", spot: "chen", pose: "handoff", label: "把清单递给陈屿" },
  { at: s(13.4), kind: "go", id: "lin", spot: "lin", pose: "done", label: "清单交完了" },
  { at: s(13.6), kind: "go", id: "chen", spot: "chen", pose: "error", label: "缺盖章页" },
  {
    at: s(15.2),
    kind: "say",
    who: "lead",
    text: "陈屿卡住了，盖章页不在卷里。宋麦先写已有的。",
  },
  { at: s(15.5), kind: "go", id: "chen", spot: "chen", pose: "wait", label: "等盖章页" },
  { at: s(15.6), kind: "go", id: "song", spot: "song", pose: "type", label: "在写能交的" },
  { at: s(15.7), kind: "go", id: "lead", spot: "lead", pose: "think", label: "在听汇报" },
  { at: s(20.4), kind: "go", id: "song", spot: "lead", pose: "report", label: "去跟主管说" },
  { at: s(22.8), kind: "go", id: "song", spot: "song", pose: "done", label: "稿子放这了" },
  {
    at: s(23.4),
    kind: "say",
    who: "lead",
    text: "能交的宋麦写完了。还差那页盖章件。你补，还是先出一版缺项说明？",
  },
  { at: s(23.6), kind: "go", id: "lead", spot: "lead", pose: "idle", label: "等你一句话" },
];

export const DURATION = s(27);

export type Pose =
  | "idle"
  | "arrive"
  | "think"
  | "read"
  | "type"
  | "run"
  | "wait"
  | "handoff"
  | "report"
  | "done"
  | "error";

export type SpotId = "door" | "lead" | "lin" | "chen" | "song" | "cooler";

export type HairStyle = "short" | "bun" | "crop";

export type Look = {
  hair: string;
  skin: string;
  shirt: string;
  pants: string;
  hairStyle: HairStyle;
};

export type Person = {
  id: string;
  name: string;
  role: string;
  look: Look;
  home: SpotId;
};

export type Cue =
  | { at: number; kind: "say"; who: "user" | "lead"; text: string }
  | {
      at: number;
      kind: "go";
      id: string;
      spot: SpotId;
      pose: Pose;
      label: string;
    };

export type Point = { x: number; y: number };

export type ActorFrame = {
  id: string;
  name: string;
  look: Look;
  pose: Pose;
  label: string;
  x: number;
  y: number;
  face: 1 | -1;
  walking: boolean;
};

export type ChatLine = {
  at: number;
  who: "user" | "lead";
  text: string;
};

export const POSE_NAME: Record<Pose, string> = {
  idle: "闲置",
  arrive: "到来",
  think: "在想",
  read: "在看",
  type: "在写",
  run: "在跑",
  wait: "等人",
  handoff: "递交",
  report: "回报",
  done: "做完",
  error: "卡住",
};

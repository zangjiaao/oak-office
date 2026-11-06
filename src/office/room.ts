export const ROOM_STYLES = ["wood", "brick", "glass"] as const;
export type RoomStyle = (typeof ROOM_STYLES)[number];

export const ROOM_STYLE_LABEL: Record<RoomStyle, string> = {
  wood: "木楼",
  brick: "砖楼",
  glass: "玻璃",
};

export type RoomLook = {
  style: RoomStyle;
  wall: string;
  ground: string;
  trim: string;
  wood: string;
};

export const DEFAULT_ROOM: RoomLook = {
  style: "wood",
  wall: "#243f36",
  ground: "#c4a574",
  trim: "#c6a15b",
  wood: "#6b4428",
};

export const ROOM_PRESETS: { name: string; look: RoomLook }[] = [
  { name: "橡木", look: DEFAULT_ROOM },
  {
    name: "夜班",
    look: { style: "wood", wall: "#1c2433", ground: "#4a4038", trim: "#c6a15b", wood: "#2c241c" },
  },
  {
    name: "砖楼",
    look: { style: "brick", wall: "#8c4a3a", ground: "#e4d2b0", trim: "#efe6d4", wood: "#6b4428" },
  },
  {
    name: "玻璃",
    look: { style: "glass", wall: "#16323c", ground: "#d5ddd8", trim: "#8ec8e6", wood: "#3d4f56" },
  },
];

const HEX = /^#[0-9a-f]{6}$/;

export function readRoomLook(body: Record<string, unknown>): RoomLook | null {
  const style =
    body.style === undefined
      ? DEFAULT_ROOM.style
      : typeof body.style === "string" && (ROOM_STYLES as readonly string[]).includes(body.style)
        ? (body.style as RoomStyle)
        : null;
  if (!style) return null;
  const color = (key: keyof Omit<RoomLook, "style">) => {
    const value = body[key];
    if (value === undefined) return DEFAULT_ROOM[key];
    if (typeof value !== "string" || !HEX.test(value.trim())) return null;
    return value.trim().toLowerCase();
  };
  const wall = color("wall");
  const ground = color("ground");
  const trim = color("trim");
  const wood = color("wood");
  if (!wall || !ground || !trim || !wood) return null;
  return { style, wall, ground, trim, wood };
}

export function sameRoom(a: RoomLook, b: RoomLook) {
  return a.style === b.style && a.wall === b.wall && a.ground === b.ground && a.trim === b.trim && a.wood === b.wood;
}

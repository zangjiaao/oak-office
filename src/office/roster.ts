import type { Person, Point, SpotId } from "./types";

export const ROOM = { w: 400, h: 240 };

export const SPOTS: Record<SpotId, Point> = {
  door: { x: 188, y: 78 },
  lead: { x: 200, y: 126 },
  lin: { x: 72, y: 188 },
  chen: { x: 200, y: 188 },
  song: { x: 328, y: 188 },
  cooler: { x: 362, y: 108 },
};

export const PEOPLE: Person[] = [
  {
    id: "lead",
    name: "周衡",
    role: "主管",
    home: "lead",
    look: {
      hair: "#2a211c",
      skin: "#e4b48f",
      shirt: "#1f3a32",
      pants: "#3a342c",
      hairStyle: "short",
    },
  },
  {
    id: "lin",
    name: "林可",
    role: "核对",
    home: "lin",
    look: {
      hair: "#4a2c24",
      skin: "#f0c2a0",
      shirt: "#c4654a",
      pants: "#3d342e",
      hairStyle: "bun",
    },
  },
  {
    id: "chen",
    name: "陈屿",
    role: "口径",
    home: "chen",
    look: {
      hair: "#6a5438",
      skin: "#d9a882",
      shirt: "#3d6f8c",
      pants: "#2e3640",
      hairStyle: "crop",
    },
  },
  {
    id: "song",
    name: "宋麦",
    role: "成稿",
    home: "song",
    look: {
      hair: "#1c1a22",
      skin: "#c9926e",
      shirt: "#c6a15b",
      pants: "#34302c",
      hairStyle: "short",
    },
  },
];

export const DESKS: SpotId[] = ["lin", "chen", "song", "lead"];

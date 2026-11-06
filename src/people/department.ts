import { petIds } from "../office/pets";
import { readRoomLook, type RoomLook } from "../office/room";

export const SEAT_CAP = 8;
export const FLOOR_MAX = 99;
export const NAME_MAX = 16;
export const RULES_MAX = 8000;

export type Department = RoomLook & {
  id: string;
  floor: number;
  name: string;
  rules: string;
  seats: number;
  pets: string;
  created_at: number;
  updated_at: number;
};

export type DepartmentDraft = RoomLook & {
  floor: number;
  name: string;
  rules: string;
  seats: number;
  pets: string;
};

export function parseDepartment(input: unknown): { ok: true; value: DepartmentDraft } | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "看不懂这一层。" };
  const body = input as Record<string, unknown>;
  const floor = whole(body.floor);
  const seats = whole(body.seats);
  const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
  const rules = typeof body.rules === "string" ? body.rules.replace(/\r\n/g, "\n").trim() : "";
  if (floor === null || floor < 1 || floor > FLOOR_MAX) return { ok: false, error: `楼层用 1 到 ${FLOOR_MAX} 的数字。` };
  if ([...name].length < 1 || [...name].length > NAME_MAX) return { ok: false, error: `部门名称用 1 到 ${NAME_MAX} 个字。` };
  if ([...rules].length > RULES_MAX) return { ok: false, error: "规章制度太长。" };
  if (seats === null || seats < 1 || seats > SEAT_CAP) return { ok: false, error: `工位用 1 到 ${SEAT_CAP} 的数字。` };
  const look = readRoomLook(body);
  if (!look) return { ok: false, error: "楼的颜色不对。" };
  const pets = petIds(body.pets);
  if (!pets) return { ok: false, error: "宠物不对。" };
  return { ok: true, value: { floor, name, rules, seats, pets: pets.join(","), ...look } };
}

function whole(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

export function staffFull(seats: number) {
  return `工位已满。这一层最多${seats}个员工。`;
}

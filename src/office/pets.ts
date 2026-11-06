export type PetKind = "cat" | "dog";

export type PetActivity = "walk" | "rest" | "sleep" | "play";

export type PetFrame = {
  id: string;
  kind: PetKind;
  coat: string;
  accent: string;
  x: number;
  y: number;
  face: 1 | -1;
  walking: boolean;
  activity: PetActivity;
  frame: number;
};

type Point = { x: number; y: number };

type PetRoute = {
  id: string;
  kind: PetKind;
  coat: string;
  accent: string;
  points: Point[];
  beats: Exclude<PetActivity, "walk">[];
  speed: number;
  phase: number;
};

const HOLD: Record<Exclude<PetActivity, "walk">, number> = {
  rest: 18,
  play: 28,
  sleep: 52,
};

function routes(roomH: number): PetRoute[] {
  const frontDesk = roomH > 260 ? 250 : 188;
  const fore = Math.min(roomH - 16, frontDesk + 30);
  return [
    {
      id: "cat-ginger",
      kind: "cat",
      coat: "#d07a45",
      accent: "#f2d2b0",
      points: [
        { x: 34, y: 116 },
        { x: 148, y: 116 },
        { x: 168, y: 132 },
        { x: 232, y: 132 },
        { x: 252, y: 116 },
        { x: 366, y: 116 },
        { x: 366, y: 130 },
        { x: 34, y: 130 },
      ],
      beats: ["sleep", "rest", "play", "rest"],
      speed: 2.4,
      phase: 0,
    },
    {
      id: "dog-cream",
      kind: "dog",
      coat: "#f4efe4",
      accent: "#8c5a32",
      points: [
        { x: 46, y: fore },
        { x: 200, y: fore },
        { x: 354, y: fore },
      ],
      beats: ["play", "rest", "sleep"],
      speed: 2.6,
      phase: 0,
    },
    {
      id: "cat-gray",
      kind: "cat",
      coat: "#5c646c",
      accent: "#d5dbe0",
      points: [
        { x: 320, y: fore },
        { x: 180, y: fore },
        { x: 60, y: fore },
      ],
      beats: ["rest", "play", "sleep"],
      speed: 1.7,
      phase: 70,
    },
  ];
}

function place(point: Point, roomH: number): Point {
  return { x: point.x, y: Math.min(point.y, roomH - 14) };
}

function walk(route: PetRoute, frame: number, roomH: number): PetFrame {
  const points = route.points.map((point) => place(point, roomH));
  const segments = points.map((from, index) => {
    const to = points[(index + 1) % points.length];
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    return { from, to, frames: Math.max(1, Math.round(length / route.speed)) };
  });
  const cycle = segments.reduce(
    (total, segment, index) => total + segment.frames + HOLD[route.beats[index % route.beats.length]],
    0,
  );
  let time = (frame + route.phase) % cycle;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    const beat = route.beats[index % route.beats.length];
    const face: 1 | -1 = segment.to.x >= segment.from.x ? 1 : -1;
    const hold = HOLD[beat];
    if (time < hold) {
      const hop = beat === "play" && Math.floor(time / 6) % 2 === 0 ? -3 : 0;
      const dart = beat === "play" ? (Math.floor(time / 6) % 2 === 0 ? 5 : -2) : 0;
      return {
        ...route,
        x: segment.from.x + dart * face,
        y: segment.from.y + hop,
        face,
        walking: false,
        activity: beat,
        frame,
      };
    }
    time -= hold;
    if (time < segment.frames) {
      const along = time / segment.frames;
      return {
        ...route,
        x: segment.from.x + (segment.to.x - segment.from.x) * along,
        y: segment.from.y + (segment.to.y - segment.from.y) * along,
        face,
        walking: true,
        activity: "walk",
        frame,
      };
    }
    time -= segment.frames;
  }
  const first = points[0];
  return { ...route, x: first.x, y: first.y, face: 1, walking: false, activity: "rest", frame };
}

export function petsAt(frame: number, roomH: number): PetFrame[] {
  return routes(roomH).map((route) => walk(route, frame, roomH));
}

export type PetKind = "cat" | "dog";

export type PetFrame = {
  id: string;
  kind: PetKind;
  coat: string;
  accent: string;
  x: number;
  y: number;
  face: 1 | -1;
  walking: boolean;
  frame: number;
};

type Point = { x: number; y: number };

type PetRoute = {
  id: string;
  kind: PetKind;
  coat: string;
  accent: string;
  points: Point[];
  speed: number;
  pause: number;
  phase: number;
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
      speed: 2.4,
      pause: 10,
      phase: 0,
    },
    {
      id: "dog-cream",
      kind: "dog",
      coat: "#f4efe4",
      accent: "#8c5a32",
      points: [
        { x: 46, y: fore },
        { x: 354, y: fore },
      ],
      speed: 2.6,
      pause: 12,
      phase: 20,
    },
    {
      id: "cat-gray",
      kind: "cat",
      coat: "#5c646c",
      accent: "#d5dbe0",
      points: [
        { x: 300, y: fore },
        { x: 70, y: fore },
      ],
      speed: 1.7,
      pause: 16,
      phase: 0,
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
  const cycle = segments.reduce((total, segment) => total + segment.frames + route.pause, 0);
  let time = (frame + route.phase) % cycle;
  for (const segment of segments) {
    const face: 1 | -1 = segment.to.x >= segment.from.x ? 1 : -1;
    if (time < route.pause) {
      return { ...route, x: segment.from.x, y: segment.from.y, face, walking: false, frame };
    }
    time -= route.pause;
    if (time < segment.frames) {
      const along = time / segment.frames;
      return {
        ...route,
        x: segment.from.x + (segment.to.x - segment.from.x) * along,
        y: segment.from.y + (segment.to.y - segment.from.y) * along,
        face,
        walking: true,
        frame,
      };
    }
    time -= segment.frames;
  }
  const first = points[0];
  return { ...route, x: first.x, y: first.y, face: 1, walking: false, frame };
}

export function petsAt(frame: number, roomH: number): PetFrame[] {
  return routes(roomH).map((route) => walk(route, frame, roomH));
}

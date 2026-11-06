import type { Agent } from "@earendil-works/pi-agent-core";

type Run = Agent;

type Held = {
  run: Run;
  releaseAt: number | null;
  timer?: ReturnType<typeof setTimeout>;
};

const crew = new Map<string, Held>();

export function liveCrew(id: string) {
  const held = crew.get(id);
  if (!held) return undefined;
  if (held.releaseAt !== null && Date.now() >= held.releaseAt) {
    releaseCrew(id);
    return undefined;
  }
  if (held.run.state.errorMessage) return undefined;
  return held.run;
}

export function keepCrew(id: string, run: Run) {
  const held = crew.get(id);
  if (held && held.run !== run) releaseCrew(id);
  const next = crew.get(id);
  if (next?.timer) clearTimeout(next.timer);
  crew.set(id, { run: next && next.run === run ? next.run : run, releaseAt: null });
}

export function armCrew(id: string, releaseAt: number) {
  const held = crew.get(id);
  if (!held) return;
  if (held.timer) clearTimeout(held.timer);
  held.releaseAt = releaseAt;
  held.timer = setTimeout(() => releaseCrew(id), Math.max(0, releaseAt - Date.now()));
}

export function releaseCrew(id: string) {
  const held = crew.get(id);
  if (!held) return;
  if (held.timer) clearTimeout(held.timer);
  crew.delete(id);
  held.run.abort();
}

export function unarmedCrew() {
  return [...crew.entries()].filter(([, held]) => held.releaseAt === null).map(([id]) => id);
}

export function crewUntil() {
  let until = 0;
  for (const held of crew.values()) {
    if (held.releaseAt !== null) until = Math.max(until, held.releaseAt);
  }
  return until;
}

import { CONFIG } from './config';

/**
 * Kausales Ereignisprotokoll.
 *
 * Jede relevante Zustandsänderung und jede Spielerentscheidung ist ein Ereignis.
 * Folgeereignisse verweisen über `causes` auf ihre Ursachen. Die Reihenfolge in
 * `causes` ist bedeutsam: Die erste Ursache ist die gewichtigste. Die Analyse folgt
 * diesem Hauptpfad bis zu einem Ereignis ohne Ursachen (der eigentlichen Ursache).
 */
export type Severity = 'info' | 'warning' | 'critical' | 'failure';

export interface SimEvent {
  id: string;
  day: number;
  type: string;
  severity: Severity;
  causes: string[];
  playerDecision: boolean;
  data: Record<string, number | string>;
}

export interface EventLogState {
  events: SimEvent[];
  nextId: number;
}

export function createEventLog(): EventLogState {
  return { events: [], nextId: 1 };
}

export interface EventInput {
  type: string;
  severity?: Severity;
  causes?: (string | undefined | null)[];
  playerDecision?: boolean;
  data?: Record<string, number | string>;
}

export function logEvent(log: EventLogState, day: number, input: EventInput): SimEvent {
  const causes: string[] = [];
  for (const c of input.causes ?? []) {
    if (c && !causes.includes(c)) causes.push(c);
  }
  const ev: SimEvent = {
    id: `e${log.nextId++}`,
    day,
    type: input.type,
    severity: input.severity ?? 'info',
    causes,
    playerDecision: input.playerDecision ?? false,
    data: input.data ?? {},
  };
  log.events.push(ev);
  return ev;
}

export function findEvent(log: EventLogState, id: string): SimEvent | undefined {
  // IDs sind fortlaufend, daher direkter Zugriff möglich
  const idx = Number(id.slice(1)) - 1;
  const ev = log.events[idx];
  return ev && ev.id === id ? ev : log.events.find((e) => e.id === id);
}

/** Hauptpfad: vom Ereignis über die jeweils erste Ursache zurück bis zum Ursprung. */
export function mainPath(log: EventLogState, id: string): SimEvent[] {
  const path: SimEvent[] = [];
  const seen = new Set<string>();
  let cur = findEvent(log, id);
  while (cur && !seen.has(cur.id)) {
    path.push(cur);
    seen.add(cur.id);
    cur = cur.causes.length ? findEvent(log, cur.causes[0]) : undefined;
  }
  return path;
}

/** Alle Ereignisse, die (transitiv) zum Ereignis beigetragen haben, nach Tag sortiert. */
export function causalClosure(log: EventLogState, id: string): SimEvent[] {
  const result = new Map<string, SimEvent>();
  const stack = [id];
  while (stack.length) {
    const cur = findEvent(log, stack.pop()!);
    if (!cur || result.has(cur.id)) continue;
    result.set(cur.id, cur);
    stack.push(...cur.causes);
  }
  return [...result.values()].sort((a, b) => a.day - b.day || Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

/** Auslöser = direkte erste Ursache des Scheiterns; Ursache = Ende des Hauptpfads. */
export function triggerAndRoot(log: EventLogState, failureId: string): { trigger?: SimEvent; root?: SimEvent } {
  const path = mainPath(log, failureId);
  return { trigger: path[1], root: path.length > 1 ? path[path.length - 1] : undefined };
}

/**
 * Ursachen-Register: gewichtete Zuordnung "welche Ereignisse tragen gerade zu
 * diesem Zustand bei". Gewichte können zerfallen (Halbwertszeit) oder sich
 * aufsummieren (z. B. Euro-Wirkung für die Finanzen).
 */
export type CauseTracker = Record<string, number>;

export function addCause(t: CauseTracker, eventId: string | undefined, weight: number): void {
  if (!eventId || !(weight > 0)) return;
  t[eventId] = (t[eventId] ?? 0) + weight;
}

export function decayCauses(t: CauseTracker, halfLifeDays: number): void {
  const f = Math.pow(CONFIG.causes.half, 1 / halfLifeDays);
  const floor = CONFIG.causes.dropBelow;
  for (const k of Object.keys(t)) {
    t[k] *= f;
    if (t[k] < floor) delete t[k];
  }
}

/** Die stärksten Ursachen, absteigend nach Gewicht. */
export function topCauses(t: CauseTracker, n: number = CONFIG.causes.maxCauses): string[] {
  const entries = Object.entries(t).sort((a, b) => b[1] - a[1] || Number(a[0].slice(1)) - Number(b[0].slice(1)));
  if (!entries.length) return [];
  const max = entries[0][1];
  return entries.filter(([, w]) => w >= max * CONFIG.causes.minRelativeWeight).slice(0, n).map(([k]) => k);
}

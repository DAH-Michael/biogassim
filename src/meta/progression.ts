import { UNLOCKS } from './unlocks.config';
import { decodeSaveCode, encodeSaveCode, CURRENT_VERSION } from './savecode';
import { flagsToKeys, keysToFlags } from './unlocks.config';
import type { UnlockKey } from '../sim/unlockKeys';

export interface RunOutcome {
  /** Ereignistyp des Scheiterns, z. B. failure_overflow; null bei Erfolg */
  failureType: string | null;
  tier: number | null;
}

/** Neue Freischaltungen nach einem Durchlauf. */
export function newUnlocks(current: readonly string[], outcome: RunOutcome): UnlockKey[] {
  const gained: UnlockKey[] = [];
  for (const u of UNLOCKS) {
    if (current.includes(u.key) || gained.includes(u.key)) continue;
    const t = u.trigger;
    if (t.kind === 'failure' && outcome.failureType === t.failureType) gained.push(u.key);
    if (t.kind === 'success' && outcome.failureType === null && outcome.tier !== null && outcome.tier >= t.minTier) gained.push(u.key);
  }
  return gained;
}

export function codeForKeys(keys: readonly string[]): string {
  return encodeSaveCode({ version: CURRENT_VERSION, flags: keysToFlags(keys) });
}

export function keysFromCode(code: string): UnlockKey[] | null {
  const r = decodeSaveCode(code);
  return r.ok ? flagsToKeys(r.payload.flags) : null;
}

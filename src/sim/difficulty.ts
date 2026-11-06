import { CONFIG, type Feature, type StaffRole, type BuildKind } from './config';
import type { GameState } from './types';
import { hasChp, type ScenarioId } from './plant';

export type DifficultyId = keyof typeof CONFIG.difficulty;
export const DIFFICULTIES = Object.keys(CONFIG.difficulty) as DifficultyId[];

/** Profil des Schwierigkeitsgrads eines Durchlaufs (Standard: normal). */
export function difficulty(state: { scenario: { difficulty?: DifficultyId } }): (typeof CONFIG.difficulty)[DifficultyId] {
  return CONFIG.difficulty[state.scenario.difficulty ?? 'normal'];
}

/** Ist diese Funktion in der Stufe des Durchlaufs verfügbar? */
export function hasFeature(state: { scenario: { difficulty?: DifficultyId } }, f: Feature): boolean {
  return difficulty(state).features.includes(f);
}

const EXPERT_ROLES: StaffRole[] = ['agrar', 'vermarkter'];
export function roleAvailable(state: { scenario: { id: ScenarioId; difficulty?: DifficultyId } }, role: StaffRole): boolean {
  // Der Energievermarkter vermarktet Strom; ohne BHKW gibt es nichts zu vermarkten
  if (role === 'vermarkter' && !hasChp(state)) return false;
  return EXPERT_ROLES.includes(role) ? hasFeature(state, 'personal_experten') : hasFeature(state, 'personal');
}

const EXTENDED_BUILDS: BuildKind[] = ['gasStorage', 'secondSilo'];
export function buildAvailable(state: { scenario: { id: ScenarioId; difficulty?: DifficultyId } }, kind: BuildKind): boolean {
  // Wärme fürs Dorf kommt aus dem BHKW
  if (kind === 'heatLine' && !hasChp(state)) return false;
  return !EXTENDED_BUILDS.includes(kind) || hasFeature(state, 'ausbau_erweitert');
}

export type { GameState };

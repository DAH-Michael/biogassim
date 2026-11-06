import { CONFIG, type Feature, type StaffRole, type BuildKind } from './config';
import type { GameState } from './types';

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
export function roleAvailable(state: { scenario: { difficulty?: DifficultyId } }, role: StaffRole): boolean {
  return EXPERT_ROLES.includes(role) ? hasFeature(state, 'personal_experten') : hasFeature(state, 'personal');
}

const EXTENDED_BUILDS: BuildKind[] = ['gasStorage', 'secondSilo'];
export function buildAvailable(state: { scenario: { difficulty?: DifficultyId } }, kind: BuildKind): boolean {
  return !EXTENDED_BUILDS.includes(kind) || hasFeature(state, 'ausbau_erweitert');
}

export type { GameState };

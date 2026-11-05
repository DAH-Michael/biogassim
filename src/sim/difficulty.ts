import { CONFIG } from './config';
import type { GameState } from './types';

export type DifficultyId = keyof typeof CONFIG.difficulty;
export const DIFFICULTIES = Object.keys(CONFIG.difficulty) as DifficultyId[];

/** Profil des Schwierigkeitsgrads eines Durchlaufs (Standard: normal). */
export function difficulty(state: { scenario: { difficulty?: DifficultyId } }): (typeof CONFIG.difficulty)[DifficultyId] {
  return CONFIG.difficulty[state.scenario.difficulty ?? 'normal'];
}

export type { GameState };

/** Schlüssel der Freischaltungen, die die Simulation kennt. Auslöser stehen in meta/unlocks.config.ts. */
export const UNLOCK_KEYS = [
  'labor',
  'grosses_lager',
  'abnahmevertraege',
  'buergerdialog',
  'abdeckung_guenstig',
  'wartungsvertrag',
  'kostenaufstellung',
  'eigene_felder',
  'waermeleitung_start',
  'schwieriger_standort',
] as const;
export type UnlockKey = (typeof UNLOCK_KEYS)[number];

import type { GameState, WorldMessage } from './types';

/**
 * Meldungen aus der Welt. Die Simulation erzeugt nur Schlüssel und Daten,
 * die Texte stehen in src/content/messages.de.ts. Meldungen erklären nie die Lösung.
 */
export function say(
  state: GameState,
  sender: WorldMessage['sender'],
  key: string,
  data: WorldMessage['data'] = {},
  eventId?: string,
): void {
  state.messages.push({ day: state.day, sender, key, data, eventId });
}

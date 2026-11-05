/**
 * Linien-Icons im Stil des Designsystems (2px Strich, runde Enden, 24px Raster).
 * Eigene, an Lucide angelehnte Formen; keine Emojis oder Unicode-Symbole.
 */
const icon = (body: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  pause: icon('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'),
  play: icon('<path d="M7 4l12 8-12 8z"/>'),
  faster: icon('<path d="M2 6l6 6-6 6z"/><path d="M9 6l6 6-6 6z"/><path d="M16 6l6 6-6 6z"/>'),
  fast: icon('<path d="M3 5l9 7-9 7z"/><path d="M12 5l9 7-9 7z"/>'),
  feed: icon('<path d="M3 4h18l-7 8v6l-4 2v-8z"/>'),
  truck: icon('<path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>'),
  field: icon('<path d="M2 20h20"/><path d="M6 20c0-5 2-9 6-12"/><path d="M12 20c0-6 1-10 4-13"/><path d="M18 20c0-4-1-7-3-9"/>'),
  wrench: icon('<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/>'),
  users: icon('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14a6.5 6.5 0 0 1 3.5 6"/>'),
  droplet: icon('<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>'),
  build: icon('<path d="M3 21h18"/><path d="M5 21V10l7-5 7 5v11"/><path d="M10 21v-6h4v6"/>'),
  coins: icon('<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 15v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.7-2.7-3-6-3"/>'),
  close: icon('<path d="M6 6l12 12M18 6L6 18"/>'),
  up: icon('<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>'),
  down: icon('<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>'),
  flat: icon('<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>'),
  plus: icon('<path d="M12 5v14M5 12h14"/>'),
  minus: icon('<path d="M5 12h14"/>'),
  fit: icon('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  flame: icon('<path d="M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 1.5 1 2.5 2.5 2.5 4.5C13 9 12 6 12 3z"/>'),
  flask: icon('<path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3"/><path d="M7.5 15h9"/>'),
  thermo: icon('<path d="M10 4a2 2 0 0 1 4 0v10a4 4 0 1 1-4 0z"/><path d="M12 9v7"/>'),
  dome: icon('<path d="M3 19h18"/><path d="M4 19v-5a8 8 0 0 1 16 0v5"/><path d="M8 12a4 4 0 0 1 4-3"/>'),
  silo: icon('<path d="M2 20h20"/><path d="M4 20V9l8-4 8 4v11"/><path d="M8 20v-6h8v6"/>'),
  tank: icon('<ellipse cx="12" cy="6" rx="8" ry="2.5"/><path d="M4 6v12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V6"/><path d="M4 12c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5"/>'),
  euro: icon('<path d="M17 6a7 7 0 1 0 0 12"/><path d="M4 10h9M4 14h9"/>'),
  heart: icon('<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>'),
  chart: icon('<path d="M4 4v16h16"/><path d="M7 15l4-5 3 3 5-7"/>'),
  alert: icon('<path d="M12 3l10 18H2z"/><path d="M12 10v5"/><path d="M12 18v.5"/>'),
  message: icon('<path d="M4 5h16v11H8l-4 4z"/>'),
};
export type IconName = keyof typeof ICONS;

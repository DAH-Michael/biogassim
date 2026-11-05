/**
 * Linien-Icons im Stil des Designsystems (2px Strich, runde Enden, 24px Raster).
 * Eigene, an Lucide angelehnte Formen; keine Emojis oder Unicode-Symbole.
 */
const icon = (body: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICONS = {
  pause: icon('<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>'),
  play: icon('<path d="M7 4l12 8-12 8z"/>'),
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
  message: icon('<path d="M4 5h16v11H8l-4 4z"/>'),
};
export type IconName = keyof typeof ICONS;

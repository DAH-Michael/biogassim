import dropUrl from '../assets/logos/dah-tropfen-farbig.svg?url';

/**
 * Porträt der DAH-Beraterin: flache Illustration einer lächelnden Frau mit Schutzhelm,
 * auf dem Helm der DAH-Tropfen. Eigene Zeichnung, keine reale Person. Farben aus dem
 * Designsystem (Helm weiß, Kleidung dunkelgrün, Hintergrund cream); Haut- und Haarton
 * sind für eine Figur nötig und kommen nicht aus der CI.
 */
export function advisorPortrait(size = 72): string {
  return `
<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="DAH-Beraterin mit Schutzhelm">
  <defs><clipPath id="adv-clip"><circle cx="60" cy="60" r="58"/></clipPath></defs>
  <circle cx="60" cy="60" r="58" fill="var(--cream)" stroke="var(--dunkelgruen)" stroke-width="3"/>
  <g clip-path="url(#adv-clip)">
    <!-- Haare hinten -->
    <path d="M30 62 C26 90 32 108 40 118 L80 118 C88 108 94 90 90 62 Z" fill="#6b4a35"/>
    <!-- Kleidung: Arbeitsjacke -->
    <path d="M18 120 C22 100 38 92 60 92 C82 92 98 100 102 120 Z" fill="var(--dunkelgruen)"/>
    <path d="M52 92 L60 104 L68 92 Z" fill="var(--white)"/>
    <rect x="73" y="102" width="12" height="6" rx="1.5" fill="var(--gelb)"/>
    <!-- Hals und Gesicht -->
    <rect x="53" y="80" width="14" height="14" rx="5" fill="#e8b996"/>
    <ellipse cx="60" cy="66" rx="21" ry="24" fill="#f1c7a5"/>
    <!-- Haare vorne -->
    <path d="M38 58 C40 46 50 42 60 42 C70 42 80 46 82 58 C76 52 68 50 60 51 C52 50 44 52 38 58 Z" fill="#7a5640"/>
    <!-- Augen, Brauen, Lächeln, Wangen -->
    <path d="M47 62 q5 -4 9 0" stroke="#3b2a20" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M64 62 q5 -4 9 0" stroke="#3b2a20" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M46 56 q6 -3 11 -1" stroke="#5a3e2e" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M63 55 q5 -2 11 1" stroke="#5a3e2e" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M50 74 q10 9 20 0" stroke="#9c4a3a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <circle cx="46" cy="72" r="3.5" fill="#e9a08a" opacity="0.55"/>
    <circle cx="74" cy="72" r="3.5" fill="#e9a08a" opacity="0.55"/>
    <!-- Schutzhelm -->
    <path d="M33 50 C33 30 45 20 60 20 C75 20 87 30 87 50 Z" fill="var(--white)" stroke="var(--k40)" stroke-width="1.5"/>
    <rect x="27" y="47" width="66" height="7" rx="3.5" fill="var(--white)" stroke="var(--k40)" stroke-width="1.5"/>
    <path d="M58 21 L62 21 L62 47 L58 47 Z" fill="var(--k10)"/>
    <image href="${dropUrl}" x="49" y="27" width="13" height="21"/>
  </g>
</svg>`;
}

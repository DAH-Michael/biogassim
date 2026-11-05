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
    <!-- Haare hinten: reichen bis unter die Helmkrempe -->
    <path d="M31 50 C25 86 32 108 40 118 L80 118 C88 108 95 86 89 50 Z" fill="#6b4a35"/>
    <!-- Kleidung: Arbeitsjacke -->
    <path d="M18 120 C22 100 38 92 60 92 C82 92 98 100 102 120 Z" fill="var(--dunkelgruen)"/>
    <path d="M52 92 L60 104 L68 92 Z" fill="var(--white)"/>
    <rect x="73" y="102" width="12" height="6" rx="1.5" fill="var(--gelb)"/>
    <!-- Hals und Gesicht -->
    <rect x="53" y="80" width="14" height="14" rx="5" fill="#e8b996"/>
    <ellipse cx="60" cy="67" rx="21" ry="23" fill="#f1c7a5"/>
    <!-- Haare vorne: Pony direkt unter der Krempe, seitlich bis zu den Wangen -->
    <path d="M37 51 C36 60 37 66 39 72 C40 63 43 58 48 56 C54 59 63 58 70 55 C76 57 80 62 81 72 C83 66 84 60 83 51 Z" fill="#7a5640"/>
    <!-- Augen offen, mit Lichtpunkt -->
    <ellipse cx="51.5" cy="65" rx="3" ry="3.6" fill="#3b2a20"/>
    <ellipse cx="68.5" cy="65" rx="3" ry="3.6" fill="#3b2a20"/>
    <circle cx="52.6" cy="63.8" r="1" fill="var(--white)"/>
    <circle cx="69.6" cy="63.8" r="1" fill="var(--white)"/>
    <!-- Brauen, Lächeln, Wangen -->
    <path d="M46.5 59 q5 -3 10 -0.5" stroke="#5a3e2e" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M63.5 58.5 q5 -2.5 10 0.5" stroke="#5a3e2e" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path d="M51 75 q9 8 18 0" stroke="#9c4a3a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <circle cx="45.5" cy="72" r="3.5" fill="#e9a08a" opacity="0.55"/>
    <circle cx="74.5" cy="72" r="3.5" fill="#e9a08a" opacity="0.55"/>
    <!-- Schutzhelm mit DAH-Tropfen mittig -->
    <path d="M33 50 C33 30 45 20 60 20 C75 20 87 30 87 50 Z" fill="var(--white)" stroke="var(--k40)" stroke-width="1.5"/>
    <rect x="27" y="47" width="66" height="7" rx="3.5" fill="var(--white)" stroke="var(--k40)" stroke-width="1.5"/>
    <image href="${dropUrl}" x="53.6" y="25" width="12.8" height="21"/>
  </g>
</svg>`;
}

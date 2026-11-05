/**
 * Erzeugt src/styles/tokens.css aus design/tokens.json (Export des DAH Designsystems).
 * Aufruf: npm run tokens. Die Datei wird eingecheckt, damit der Build ohne diesen Schritt läuft.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface Tok { name: string; value: unknown }
const root = join(import.meta.dirname, '..');
const t = JSON.parse(readFileSync(join(root, 'design/tokens.json'), 'utf8'));
const lines: string[] = ['/* Generiert aus design/tokens.json (DAH Designsystem). Nicht von Hand ändern: npm run tokens */', ':root {'];

const val = (v: unknown): string => {
  if (typeof v === 'object' && v !== null) v = (v as Record<string, string>).light ?? Object.values(v)[0];
  const s = String(v);
  const alias = s.match(/^\{(.+)\}$/);
  return alias ? `var(--${alias[1]})` : s;
};

for (const [family, group] of Object.entries(t)) {
  if (family === 'type' || typeof group !== 'object' || !group || !('tokens' in (group as object))) continue;
  lines.push(`  /* ${family} */`);
  for (const tok of (group as { tokens: Tok[] }).tokens) lines.push(`  --${tok.name}: ${val(tok.value)};`);
}
lines.push('  /* type */');
for (const [k, v] of Object.entries(t.type.families as Record<string, string>)) lines.push(`  --font-${k}: ${v};`);
lines.push('}');
writeFileSync(join(root, 'src/styles/tokens.css'), lines.join('\n') + '\n');
console.log(`tokens.css: ${lines.length} Zeilen`);

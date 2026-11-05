/**
 * Speichercode für die Metaprogression.
 *
 * Inhalt: Version und freigeschaltete Elemente als Bitfeld, kein laufender Spielstand.
 * Alphabet: 31 Zeichen ohne verwechselbare Zeichen (kein 0, O, 1, I, L).
 * Weil ohne diese Zeichen nur 31 Zeichen übrig bleiben, wird in Basis 31 kodiert
 * (echtes Base32 bräuchte 32 Zeichen).
 * Aufbau (54 Bit): 6 Bit Version | 32 Bit Freischaltungen | 16 Bit Prüfsumme (CRC-16).
 * 12 Zeichen, angezeigt in Vierergruppen. Gegen Manipulation nicht geschützt (nicht nötig).
 */
export const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const CODE_LENGTH = 12;
export const CURRENT_VERSION = 1;
const BASE = BigInt(ALPHABET.length);
const VERSION_BITS = 6n;
const FLAG_BITS = 32n;
const CRC_BITS = 16n;

export interface SavePayload {
  version: number;
  /** Bitfeld der Freischaltungen (Index aus der Liste der Freischaltungsschlüssel) */
  flags: number;
}

function crc16(bytes: number[]): number {
  // CRC-16/CCITT-FALSE
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

function payloadBytes(version: number, flags: number): number[] {
  return [version & 0x3f, (flags >>> 24) & 0xff, (flags >>> 16) & 0xff, (flags >>> 8) & 0xff, flags & 0xff];
}

export function encodeSaveCode(p: SavePayload): string {
  const flags = p.flags >>> 0;
  const crc = crc16(payloadBytes(p.version, flags));
  let n = (BigInt(p.version & 0x3f) << (FLAG_BITS + CRC_BITS)) | (BigInt(flags) << CRC_BITS) | BigInt(crc);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    out = ALPHABET[Number(n % BASE)] + out;
    n /= BASE;
  }
  return out;
}

export function formatSaveCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, '$1 ');
}

export type DecodeResult =
  | { ok: true; payload: SavePayload }
  | { ok: false; reason: 'laenge' | 'zeichen' | 'pruefsumme' | 'version' };

/** Normalisiert Eingaben: Kleinbuchstaben, Leerzeichen und Bindestriche sind erlaubt. */
export function normalizeSaveCode(input: string): string {
  return input.toUpperCase().replace(/[\s\-_.]/g, '');
}

export function decodeSaveCode(input: string): DecodeResult {
  const code = normalizeSaveCode(input);
  if (code.length !== CODE_LENGTH) return { ok: false, reason: 'laenge' };
  let n = 0n;
  for (const ch of code) {
    const v = ALPHABET.indexOf(ch);
    if (v < 0) return { ok: false, reason: 'zeichen' };
    n = n * BASE + BigInt(v);
  }
  if (n >> (VERSION_BITS + FLAG_BITS + CRC_BITS) !== 0n) return { ok: false, reason: 'pruefsumme' };
  const crc = Number(n & ((1n << CRC_BITS) - 1n));
  const flags = Number((n >> CRC_BITS) & ((1n << FLAG_BITS) - 1n));
  const version = Number(n >> (FLAG_BITS + CRC_BITS));
  if (crc16(payloadBytes(version, flags)) !== crc) return { ok: false, reason: 'pruefsumme' };
  if (version < 1 || version > CURRENT_VERSION) return { ok: false, reason: 'version' };
  return { ok: true, payload: { version, flags } };
}

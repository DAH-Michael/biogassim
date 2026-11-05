import { describe, expect, it } from 'vitest';
import { ALPHABET, CODE_LENGTH, decodeSaveCode, encodeSaveCode, formatSaveCode } from '../src/meta/savecode';
import { codeForKeys, keysFromCode, newUnlocks } from '../src/meta/progression';
import { UNLOCK_KEYS } from '../src/sim/unlockKeys';

describe('Speichercode', () => {
  it('enthält keine verwechselbaren Zeichen', () => {
    for (const ch of '0O1IL') expect(ALPHABET.includes(ch)).toBe(false);
    expect(new Set(ALPHABET).size).toBe(ALPHABET.length);
  });

  it('Hin- und Rückweg für alle einzelnen Freischaltungen und Kombinationen', () => {
    const sets: string[][] = [[], [...UNLOCK_KEYS]];
    for (const k of UNLOCK_KEYS) sets.push([k]);
    sets.push(['labor', 'eigene_felder'], ['buergerdialog', 'wartungsvertrag', 'kostenaufstellung']);
    for (const keys of sets) {
      const code = codeForKeys(keys);
      expect(code).toHaveLength(CODE_LENGTH);
      expect(new Set(keysFromCode(code))).toEqual(new Set(keys));
    }
  });

  it('wird in Vierergruppen angezeigt und so auch wieder gelesen', () => {
    const code = codeForKeys(['labor']);
    const shown = formatSaveCode(code);
    expect(shown).toMatch(/^.{4} .{4} .{4}$/);
    expect(keysFromCode(shown)).toEqual(['labor']);
    expect(keysFromCode(shown.toLowerCase())).toEqual(['labor']);
    expect(keysFromCode(shown.replace(/ /g, '-'))).toEqual(['labor']);
  });

  it('erkennt jeden einzelnen Tippfehler', () => {
    const code = codeForKeys(['labor', 'grosses_lager', 'eigene_felder']);
    let detected = 0;
    let total = 0;
    for (let i = 0; i < code.length; i++) {
      for (const ch of ALPHABET) {
        if (ch === code[i]) continue;
        total++;
        const typo = code.slice(0, i) + ch + code.slice(i + 1);
        if (!decodeSaveCode(typo).ok) detected++;
      }
    }
    expect(detected).toBe(total);
  });

  it('erkennt vertauschte Nachbarzeichen', () => {
    const code = codeForKeys(['buergerdialog', 'wartungsvertrag']);
    for (let i = 0; i < code.length - 1; i++) {
      if (code[i] === code[i + 1]) continue;
      const swapped = code.slice(0, i) + code[i + 1] + code[i] + code.slice(i + 2);
      expect(decodeSaveCode(swapped).ok).toBe(false);
    }
  });

  it('lehnt ungültige Eingaben mit Grund ab', () => {
    expect(decodeSaveCode('ABC')).toEqual({ ok: false, reason: 'laenge' });
    expect(decodeSaveCode('0000 0000 0000')).toEqual({ ok: false, reason: 'zeichen' });
    expect(decodeSaveCode('ZZZZ ZZZZ ZZZZ').ok).toBe(false);
  });

  it('enthält ein Versionsfeld', () => {
    const code = encodeSaveCode({ version: 1, flags: 5 });
    const r = decodeSaveCode(code);
    expect(r.ok && r.payload.version).toBe(1);
    // unbekannte zukünftige Version wird abgelehnt statt falsch gelesen
    expect(decodeSaveCode(encodeSaveCode({ version: 9, flags: 5 }))).toEqual({ ok: false, reason: 'version' });
  });
});

describe('Freischaltungen', () => {
  it('sind an die Art des Scheiterns gekoppelt', () => {
    expect(newUnlocks([], { failureType: 'failure_biology', tier: null })).toEqual(['labor']);
    expect(newUnlocks([], { failureType: 'failure_overflow', tier: null })).toEqual(['grosses_lager', 'abnahmevertraege']);
    expect(newUnlocks([], { failureType: 'failure_acceptance', tier: null })).toEqual(['buergerdialog', 'abdeckung_guenstig']);
    expect(newUnlocks([], { failureType: 'failure_technical', tier: null })).toEqual(['wartungsvertrag']);
    expect(newUnlocks([], { failureType: 'failure_insolvency', tier: null })).toEqual(['kostenaufstellung']);
  });
  it('Erfolg und hohe Bewertung schalten Szenarien frei, nur einmal', () => {
    expect(newUnlocks([], { failureType: null, tier: 0 })).toEqual(['eigene_felder']);
    expect(newUnlocks(['eigene_felder'], { failureType: null, tier: 3 })).toEqual(['waermeleitung_start', 'schwieriger_standort']);
    expect(newUnlocks(['labor'], { failureType: 'failure_biology', tier: null })).toEqual([]);
  });
});

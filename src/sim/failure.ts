import { CONFIG } from './config';
import { logEvent } from './eventlog';
import { recentComplaints } from './acceptance';
import type { FailureKind, GameState } from './types';

/**
 * Scheiterbedingungen. Jede erzeugt ein Ereignis der Stufe "failure", das über
 * seine Ursachen bis zur eigentlichen Ursache zurückverfolgt werden kann.
 */
export function checkFailure(state: GameState): void {
  if (state.failure) return;
  const day = state.day;
  const fail = (kind: FailureKind, type: string, causes: (string | undefined)[], data: Record<string, number | string>) => {
    const ev = logEvent(state.log, day, { type, severity: 'failure', causes, data });
    state.failure = { kind, eventId: ev.id, day };
  };

  // Behördliche Stilllegung: übergelaufenes Gärrestlager
  if (state.digestate.overflowed && state.digestate.overflowEvent) {
    fail('behoerde', 'failure_overflow', [state.digestate.overflowEvent], { m3: Math.round(state.digestate.m3) });
    return;
  }
  // Behördliche Stilllegung: Akzeptanz dauerhaft kritisch und wiederholte Beschwerden
  const A = CONFIG.acceptance;
  const complaints = recentComplaints(state);
  if (state.acceptance.daysCritical >= A.shutdownDays && complaints.length >= A.shutdownComplaints) {
    fail('behoerde', 'failure_acceptance', [state.acceptance.levelEvent, state.acceptance.authorityEvent, ...complaints.slice(-2)], {
      acceptance: Math.round(state.acceptance.value),
      complaints: complaints.length,
    });
    return;
  }
  // Biologischer Totalausfall
  const bio = state.bio;
  if (bio.tipped && bio.tippedDay !== null && day - bio.tippedDay >= CONFIG.biology.recoveryDeadlineDays) {
    fail('biologie', 'failure_biology', [bio.tippedEvent], { days: day - bio.tippedDay, fosTac: Math.round(bio.fosTac * 100) / 100 });
    return;
  }
  // Technischer Totalschaden ohne Geld für Ersatz
  if (state.chp.destroyedEvent) {
    fail('technik', 'failure_technical', [state.chp.destroyedEvent], { balance: Math.round(state.finance.balance) });
    return;
  }
  // Insolvenz
  if (state.finance.daysOverLimit >= CONFIG.finance.insolvencyDays) {
    fail('insolvenz', 'failure_insolvency', [state.finance.overLimitEvent], {
      balance: Math.round(state.finance.balance),
      days: state.finance.daysOverLimit,
    });
  }
}

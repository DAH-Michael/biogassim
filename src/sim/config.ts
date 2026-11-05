/**
 * Zentrale Balancing-Konfiguration.
 *
 * Alle Zahlenwerte der Simulation stehen hier, jeweils mit Einheit und Herkunft.
 * Alle Werte sind Platzhalter für den Prototyp und werden mit dem Fachbereich der
 * DAH abgestimmt. Kennzeichnung: "Richtwert, fachlich prüfen".
 *
 * Konvention: Ein Tick ist ein Spieltag. Massen in Tonnen Frischmasse (t FM),
 * Gasmengen in Normkubikmetern (m³), Geld in Euro.
 */

export type SubstrateId = 'mais' | 'gruenroggen' | 'guelle' | 'reststoff';
export const SUBSTRATES: readonly SubstrateId[] = ['mais', 'gruenroggen', 'guelle', 'reststoff'];

/** Kalender-Monat und Tag, z. B. [10, 1] für 1. Oktober. */
export type MonthDay = readonly [number, number];
export interface DateWindow { from: MonthDay; to: MonthDay }

export const CONFIG = {
  /** Einheiten und Umrechnungen (physikalisch, keine Balancing-Werte). */
  units: {
    hoursPerDay: 24,
    daysPerYear: 365,
    monthsPerYear: 12,
    kgPerTonne: 1000,
    /** ppm-Bezug */
    ppm: 1_000_000,
    /** Dichte Biogas, t pro m³ (rund 1,2 kg/m³), Literaturwert */
    biogasDensityTPerM3: 0.0012,
    percent: 100,
    /** Rechengenauigkeit für Flächenvergleiche */
    epsilon: 1e-9,
    /** Nachkommastellen für Preise im Protokoll */
    priceDigits: 3,
    /** Monatslängen ohne Schaltjahr */
    monthLengths: [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as readonly number[],
  },

  /** Zeit und Ablauf */
  time: {
    /** Länge eines Durchlaufs in Spieltagen (1. August bis 31. Juli) */
    runDays: 365,
    /** Starttag: 1. August, aus der Arbeitsanweisung */
    startDate: [8, 1] as MonthDay,
    /** Echtzeit-Sekunden pro Spieltag bei einfacher Geschwindigkeit (10 min pro Jahr), Vorgabe */
    realSecondsPerDayAt1x: 600 / 365,
    /** Wählbare Geschwindigkeiten */
    speeds: [0, 1, 2] as readonly number[],
    /** Maximaler Zeitraffer im Debug-Modus */
    debugMaxSpeed: 50,
    /** Anzahl Tage für die Vorlaufsimulation der Biologie beim Start (stationärer Zustand) */
    biologyWarmupDays: 200,
  },

  /** Anlage, Größenordnung 500 kW elektrisch */
  plant: {
    /** kW elektrisch, Vorgabe. Richtwert, fachlich prüfen */
    chpPowerKwEl: 500,
    /** Elektrischer Wirkungsgrad BHKW. Richtwert, fachlich prüfen */
    chpEtaEl: 0.40,
    /** Thermischer Wirkungsgrad BHKW. Richtwert, fachlich prüfen */
    chpEtaTh: 0.43,
    /** kWh Heizwert pro m³ Methan. Richtwert, fachlich prüfen */
    methaneKwhPerM3: 10,
    /** Eigenstrombedarf der Anlage als Anteil der Erzeugung. Richtwert, fachlich prüfen */
    ownPowerShare: 0.07,
    /** Arbeitsvolumen Hauptfermenter, m³. Richtwert, fachlich prüfen */
    fermenterVolumeM3: 3600,
    /** Arbeitsvolumen Nachgärer, m³. Richtwert, fachlich prüfen */
    postDigesterVolumeM3: 2500,
    /** Gasspeicher (Haube auf dem Nachgärer), m³ Biogas. Richtwert, fachlich prüfen */
    gasStorageM3: 2000,
    /** Füllung Gasspeicher beim Start, Anteil */
    gasStartShare: 0.5,
    /** Mindestfüllung Gasspeicher, unter der das BHKW nicht startet, Anteil. Richtwert, fachlich prüfen */
    gasStorageMinShare: 0.05,
    /** Fahrsilo Kapazität, t FM. Richtwert, fachlich prüfen */
    siloCapacityT: 8000,
    /** Gärrestlager Kapazität der Altanlage, m³ (rund 5,5 Monate). Richtwert, fachlich prüfen */
    digestateCapacityM3: 9500,
    /** Oberfläche Gärrestlager pro m³ Kapazität (für Regeneintrag), m² pro m³. Richtwert, fachlich prüfen */
    digestateAreaPerM3: 0.17,
    /** Vorlagebehälter Reststoffe, t. Richtwert, fachlich prüfen */
    residueTankT: 400,
    /** Volumen pro Tonne Input im Fermenter, m³/t (vereinfacht). Richtwert, fachlich prüfen */
    inputVolumeM3PerT: 1.0,
  },

  /**
   * Substrate. ch4PerT = Methanpotenzial in m³ CH4 pro t FM bei vollständigem Abbau.
   * Herkunft: Vorgabe Arbeitsanweisung Abschnitt 9 (Biogasertrag mal Methananteil).
   */
  substrates: {
    mais: {
      /** Trockensubstanz-Anteil. Richtwert, fachlich prüfen */
      ts: 0.33,
      /** organischer Anteil der TS. Richtwert, fachlich prüfen */
      ots: 0.95,
      /** 200 m³ Biogas/t mal 52 % CH4. Richtwert, fachlich prüfen */
      ch4PerT: 104,
      ch4Share: 0.52,
      /** Hydrolysekonstante pro Tag. Richtwert, fachlich prüfen */
      kHyd: 0.12,
      /** Pufferbeitrag (Index, Gülle = 1). Richtwert, fachlich prüfen */
      buffer: 0.0,
      /** Spurenelementbeitrag (Index, Gülle = 1). Richtwert, fachlich prüfen */
      traceElements: 0.0,
      /** H2S-Bildung relativ (Mais = 1). Richtwert, fachlich prüfen */
      h2s: 1.0,
    },
    gruenroggen: {
      ts: 0.30, ots: 0.92,
      /** 170 m³ Biogas/t mal 53 % CH4. Richtwert, fachlich prüfen */
      ch4PerT: 90, ch4Share: 0.53,
      kHyd: 0.10, buffer: 0.05, traceElements: 0.2, h2s: 1.5,
    },
    guelle: {
      ts: 0.09, ots: 0.80,
      /** 22 m³ Biogas/t mal 57 % CH4. Richtwert, fachlich prüfen */
      ch4PerT: 12.5, ch4Share: 0.57,
      kHyd: 0.05, buffer: 1.0, traceElements: 1.0, h2s: 3.0,
    },
    reststoff: {
      ts: 0.20, ots: 0.90,
      /** Mittelwert 150 m³ Biogas/t mal 60 % CH4, stark schwankend. Richtwert, fachlich prüfen */
      ch4PerT: 90, ch4Share: 0.60,
      kHyd: 0.30, buffer: 0.1, traceElements: 0.3, h2s: 4.0,
    },
  } satisfies Record<SubstrateId, SubstrateConfig>,

  /** Fermenterbiologie (vereinfachtes Zweistufenmodell: Säurebildung und Methanbildung) */
  biology: {
    /** Solltemperatur mesophil, °C. Richtwert, fachlich prüfen */
    setpointC: 40,
    /** Optimalbereich mesophil, °C (unten, oben). Richtwert, fachlich prüfen */
    optimumC: [37, 43] as const,
    /** Temperatur, bei der die Methanbildner nur noch minimal arbeiten, °C. Richtwert, fachlich prüfen */
    lowLimitC: 25,
    /** Restaktivität bei lowLimitC. Richtwert, fachlich prüfen */
    lowLimitFactor: 0.3,
    /** Obergrenze mesophil, oberhalb fällt die Aktivität, °C. Richtwert, fachlich prüfen */
    highLimitC: 48,
    /** Hydrolyse ist weniger temperaturempfindlich: Anteil der Temperaturwirkung. Richtwert, fachlich prüfen */
    hydrolysisTempSensitivity: 0.5,
    /** Startkapazität vor der Vorlaufsimulation, Anteil der Maximalkapazität */
    initialCapacityShare: 0.5,
    /** Anteil der Vorlaufsimulation mit festgehaltener Gleichgewichtskapazität */
    warmupPinnedShare: 0.75,
    /** Teilschritte pro Tag für die Säureumsetzung (numerische Integration) */
    acidSubsteps: 24,
    /** Bremsung der Hydrolyse bei starker Versäuerung: Untergrenze des Faktors */
    hydrolysisInhibitionFloor: 0.3,
    /** Halbsättigung der Säureumsetzung, m³ CH4-Äquivalent pro m³ Fermenter. Richtwert, fachlich prüfen */
    acidHalfSaturationPerM3: 0.09,
    /** Kapazitätsreserve, die die Methanbildner im Gleichgewicht aufbauen (Faktor über Bedarf). Richtwert, fachlich prüfen */
    capacityHeadroom: 1.35,
    /** Maximale Kapazität pro m³ Fermenter, ausgedrückt als Raumbelastung kg oTS/(m³·d) Maisäquivalent. Richtwert, fachlich prüfen */
    capacityMaxOlr: 4.4,
    /** Maximales Wachstum der Methanbildner pro Tag (relativ). Erzeugt Anpassungszeit von Wochen. Richtwert, fachlich prüfen */
    growthMaxPerDay: 0.015,
    /** Rückgang ungenutzter Kapazität pro Tag (relativ zur Differenz). Richtwert, fachlich prüfen */
    decayPerDay: 0.02,
    /** Glättung des Säureangebots für die Kapazitätsanpassung (Anteil pro Tag). Richtwert, fachlich prüfen */
    demandSmoothing: 0.3,
    /** Zusätzliches Absterben bei hohem FOS/TAC: pro Punkt über criticalFosTac pro Tag. Richtwert, fachlich prüfen */
    acidKillPerDay: 0.12,
    /** FOS-Anteil, der ohne Säurestau gemessen wird (Grundrauschen). Richtwert, fachlich prüfen */
    fosBase: 0.12,
    /** Umrechnung Säurestau (m³ CH4-Äq. pro m³) in FOS/TAC-Punkte. Richtwert, fachlich prüfen */
    fosPerAcid: 0.885,
    /** FOS/TAC unauffällig, Warnung, kritisch, gekippt. Vorgabe Abschnitt 9. Richtwert, fachlich prüfen */
    fosTacNormal: 0.4,
    fosTacWarning: 0.5,
    fosTacCritical: 0.6,
    fosTacTipped: 0.8,
    /** Obergrenze des Kennwerts (Puffer vollständig aufgezehrt) */
    fosTacMax: 2.5,
    /** Hemmung der Methanbildung: ab diesem FOS/TAC beginnt sie. Richtwert, fachlich prüfen */
    inhibitionStart: 0.45,
    /** FOS/TAC, bei dem nur noch inhibitionFloor Aktivität bleibt. Richtwert, fachlich prüfen */
    inhibitionFull: 0.9,
    inhibitionFloor: 0.15,
    /** Puffer (TAC-Index): Grundwert und Beitrag aus Input. Richtwert, fachlich prüfen */
    bufferBase: 0.85,
    bufferFromInput: 0.5,
    /** Spurenelemente: benötigter Index, darunter sinkt die Leistung. Richtwert, fachlich prüfen */
    traceElementsNeeded: 0.15,
    /** Leistungsfaktor bei völligem Spurenelementmangel. Richtwert, fachlich prüfen */
    traceElementsFloor: 0.85,
    /** Verdünnungsgeschwindigkeit der Spurenelemente relativ zur Verweilzeit. Richtwert, fachlich prüfen */
    traceElementsDilution: 0.8,
    /** Belastung durch abrupte Substratwechsel: Leistungsverlust bei vollem Wechsel. Richtwert, fachlich prüfen */
    shiftStress: 0.5,
    /** Anpassungszeitkonstante der Mikroorganismen an neue Zusammensetzung, Tage. Richtwert, fachlich prüfen */
    adaptationTauDays: 21,
    /** Abbaukonstante im Nachgärer pro Tag. Richtwert, fachlich prüfen */
    postDigesterK: 0.06,
    /** Raumbelastung, bis zu der der Prozess als stabil gilt, kg oTS/(m³·d). Vorgabe Abschnitt 9. Richtwert, fachlich prüfen */
    olrStable: 3.0,
    /** Raumbelastung, ab der es kritisch wird. Vorgabe Abschnitt 9. Richtwert, fachlich prüfen */
    olrCritical: 4.0,
    /** Temperaturwirkung unter lowLimitC: Abnahme pro °C und Untergrenze. Richtwert, fachlich prüfen */
    belowLowSlopePerC: 0.03,
    minTempFactor: 0.05,
    /** Restaktivität an highLimitC. Richtwert, fachlich prüfen */
    highLimitFactor: 0.3,
    /** Kapazität der Methanbildner fällt nie unter diesen Anteil der Maximalkapazität. Richtwert, fachlich prüfen */
    capacityFloorShare: 0.02,
    /** Nachgärer ist kühler als der Fermenter, °C. Richtwert, fachlich prüfen */
    postDigesterTempOffsetC: 3,
    /** Gekippt, wenn FOS/TAC so viele Tage über fosTacTipped liegt. Richtwert, fachlich prüfen */
    tipDays: 3,
    /** Erholt, wenn FOS/TAC so viele Tage unter fosTacWarning liegt. Richtwert, fachlich prüfen */
    recoveryDays: 7,
    /** Frist zum Wiederhochfahren nach dem Kippen, Tage. Richtwert, fachlich prüfen */
    recoveryDeadlineDays: 45,
    /** Rauschen und Verzug der FOS/TAC-Messung je Messniveau */
    measurement: {
      /** externes Labor ohne Personal: wöchentliche Probe, 3 Tage Verzug. Richtwert, fachlich prüfen */
      external: { intervalDays: 7, delayDays: 3, noise: 0.05, costEur: 150 },
      /** mit Biologin: zweimal pro Woche, 1 Tag Verzug */
      biologist: { intervalDays: 3, delayDays: 1, noise: 0.03, costEur: 150 },
      /** eigenes Labor (Freischaltung): täglich, ohne Verzug */
      lab: { intervalDays: 1, delayDays: 0, noise: 0.01, costEur: 20 },
    },
    /** Biologin bemerkt steigenden FOS/TAC so viel unter der Warnschwelle */
    biologistNoticeMargin: 0.08,
    /** Anzahl Messwerte für die Trendanzeige */
    trendSamples: 4,
    /** Schwelle für ein Ereignis "abrupter Substratwechsel" (Anteil Zusammensetzung). Richtwert, fachlich prüfen */
    shiftEventThreshold: 0.12,
    /** Schwelle für ein Ereignis "Belastungssprung" (kg oTS/(m³·d) innerhalb von 7 Tagen). Richtwert, fachlich prüfen */
    loadJumpThreshold: 0.35,
    loadJumpWindowDays: 7,
    /** Halbwertszeit der Ursachen-Gewichte in der Biologie, Tage */
    causeHalfLifeDays: 21,
    /** Temperatur, unter der ein Ereignis "Fermenter kühlt aus" entsteht, °C. Richtwert, fachlich prüfen */
    coldEventC: 36,
    /** Gewichte im Ursachenregister je Belastungsart (dimensionslos) */
    causeWeights: { overload: 0.5, trace: 2, cold: 2, residue: 0.5, shift: 1, buffer: 0.5 },
    /** Puffer, unter dem der Gülleanteil als Belastung gilt (TAC-Index) */
    bufferReference: 1.0,
    /** Schwelle Spurenelementfaktor für Ereignis Mangel */
    traceDeficitEventFactor: 0.97,
  },

  /** Wärme und Temperatur */
  heat: {
    /** Erwärmung pro Tag bei ausreichender Heizleistung, °C. Richtwert, fachlich prüfen */
    heatUpPerDayC: 0.8,
    /** Wärmeverlust-Koeffizient über die Behälterwand pro Tag. Richtwert, fachlich prüfen */
    wallLossPerDay: 0.012,
    /** Abkühlung durch kalten Input: Faktor auf (Durchsatz/Volumen)·ΔT. Richtwert, fachlich prüfen */
    inputCoolingFactor: 1.0,
    /** Heizbedarf als Anteil der BHKW-Volllast bei 15 °C Außentemperatur. Richtwert, fachlich prüfen */
    needShareAt15C: 0.15,
    /** Zusätzlicher Heizbedarf pro °C unter 15 °C. Richtwert, fachlich prüfen */
    needSharePerDegree: 0.01,
    needReferenceC: 15,
  },

  /** Gasspeicher, BHKW und Entschwefelung */
  chp: {
    /** Startverschleiß der Altanlage (0 neu, 1 irreparabel). Richtwert, fachlich prüfen */
    startWear: 0.5,
    /** Betriebsstunden seit letzter Wartung beim Start (leichter Wartungsstau). Richtwert, fachlich prüfen */
    startHoursSinceService: 2200,
    /** Betriebsstunden gesamt beim Start. Richtwert, fachlich prüfen */
    startOperatingHours: 61000,
    /** Kleine Wartung alle ... Betriebsstunden. Vorgabe Abschnitt 9. Richtwert, fachlich prüfen */
    serviceIntervalH: 2000,
    /** Grundverschleiß pro Betriebsjahr (8.000 h). Richtwert, fachlich prüfen */
    wearPerYear: 0.18,
    wearReferenceHours: 8000,
    /** Verschleißzuschlag pro Wartungsintervall Überziehung. Richtwert, fachlich prüfen */
    overdueWearFactor: 1.5,
    /** Verschleißzuschlag pro 100 ppm H2S im Reingas. Richtwert, fachlich prüfen */
    h2sWearPer100ppm: 1.2,
    /** Ausfallwahrscheinlichkeit pro Tag im Normalzustand. Richtwert, fachlich prüfen */
    failureBasePerDay: 0.004,
    /** Zuschlag pro Wartungsintervall Überziehung. Richtwert, fachlich prüfen */
    failureOverdueFactor: 3,
    /** Zuschlag pro Verschleißpunkt über failureWearThreshold. Richtwert, fachlich prüfen */
    failureWearFactor: 4,
    failureWearThreshold: 0.5,
    /** Ausfalldauer in Tagen (min, max). Richtwert, fachlich prüfen */
    failureDowntimeDays: [2, 6] as const,
    /** Reparaturkosten je Ausfall in Euro (min, max). Richtwert, fachlich prüfen */
    failureRepairEur: [8000, 25000] as const,
    /** Zusätzlicher Verschleiß je Ausfall. Richtwert, fachlich prüfen */
    failureWear: 0.04,
    /** Kleine Wartung: Kosten, Stillstand, Verschleißminderung. Richtwert, fachlich prüfen */
    smallService: { costEur: 5500, downtimeDays: 1, wearReduction: 0.02 },
    /** Instandsetzung: Kosten, Stillstand, Verschleißminderung. Richtwert, fachlich prüfen */
    majorService: { costEur: 65000, downtimeDays: 8, wearReduction: 0.25 },
    /** Ersatz-BHKW bei Totalschaden: Kosten und Lieferzeit. Richtwert, fachlich prüfen */
    replacement: { costEur: 480000, downtimeDays: 30 },
    /** Ab diesem Verschleiß ist das BHKW irreparabel */
    wearLimit: 1.0,
    /** Gewicht des Grundverschleißes der Altanlage im Ursachenregister */
    wearOriginWeight: 1,
    /** Betriebsleiter meldet fällige Wartung ab ... Stunden vor Fälligkeit */
    serviceNoticeHoursBefore: 100,
  },

  desulfurization: {
    /** Rohgas H2S-Gehalt bei reinem Mais, ppm. Richtwert, fachlich prüfen */
    rawPpmPerUnit: 400,
    /** Biologische Entschwefelung (Luftdosierung) entfernt immer diesen Anteil. Richtwert, fachlich prüfen */
    biologicalRemoval: 0.6,
    /** Mit Verbrauchsmittel (Eisenhydroxid/Aktivkohle) verbleibender Anteil. Richtwert, fachlich prüfen */
    withMediumResidual: 0.05,
    /** Vorrat Verbrauchsmittel in "Tagen bei Referenzlast". Richtwert, fachlich prüfen */
    mediumCapacityDays: 120,
    /** Vorrat beim Start (knapp). Richtwert, fachlich prüfen */
    startMediumDays: 25,
    /** Referenzlast: rawPpmPerUnit bei Volllast-Gasmenge */
    refillCostEur: 6000,
    /** Betriebsleiter meldet sich unter ... Tagen Vorrat */
    lowNoticeDays: 7,
  },

  /** Lager und Logistik */
  silo: {
    /** Walzkapazität pro Tag (gut verdichtete Tonnen), t/d. Richtwert, fachlich prüfen */
    compactionCapacityTPerDay: 700,
    /** Grundverlust Silage pro Jahr bei guter Verdichtung, Anteil. Richtwert, fachlich prüfen */
    baseLossPerYear: 0.08,
    /** Zusatzverlust pro Jahr bei schlechter Verdichtung (Qualität 0). Richtwert, fachlich prüfen */
    poorCompactionLossPerYear: 0.25,
    /** Startvorrat Maissilage, t (knapp, rund 7 Wochen). Richtwert, fachlich prüfen */
    startMaizeT: 1300,
    startMaizeQuality: 0.85,
    /** Überschuss bei vollem Silo wird zu diesem Preis abgegeben, €/t. Richtwert, fachlich prüfen */
    overflowSalePricePerT: 15,
    /** Qualitätsverlust durch schlechte Verdichtung: Anteil bei Verdichtung 0. Richtwert, fachlich prüfen */
    compactionQualityWeight: 0.6,
    /** Verdichtung, unter der ein Ereignis entsteht */
    poorCompactionThreshold: 0.8,
    /** Minderung des Methanpotenzials bei Silagequalität 0. Richtwert, fachlich prüfen */
    qualityCh4Penalty: 0.3,
    /** Halbwertszeit Ursachen der Verdichtung, Tage */
    causeHalfLifeDays: 30,
    /** Qualitätsschwelle für Ereignis "hohe Silageverluste" */
    poorQualityEventThreshold: 0.75,
    /** Betriebsleiter meldet sich bei Reichweite unter ... Tagen */
    lowStockNoticeDays: 20,
    /** Zweites Fahrsilo: zusätzliche Kapazität, t. Richtwert, fachlich prüfen */
    secondSiloT: 4000,
  },

  digestate: {
    /** Füllstand beim Start, Anteil. Richtwert, fachlich prüfen */
    startFillShare: 0.45,
    /** Gesetzliche Auflage Lagerkapazität, Monate. Vorgabe Abschnitt 9. Richtwert, fachlich prüfen */
    requiredMonths: 9,
    /** Sperrfrist Ackerland, vereinfacht. Vorgabe Abschnitt 9. Richtwert, fachlich prüfen */
    blackout: { from: [10, 1], to: [1, 31] } as DateWindow,
    /** Ausbringleistung Güllefass mit Schleppschlauch, m³/d. Richtwert, fachlich prüfen */
    spreadCapacityM3PerDay: 400,
    /** Kosten Ausbringung, €/m³ plus Transport pro km. Richtwert, fachlich prüfen */
    spreadCostPerM3: 1.5,
    spreadCostPerM3Km: 0.15,
    /** Mittlere Entfernung zu Abnehmern, km. Richtwert, fachlich prüfen */
    regionalDistanceKm: 5,
    /** Regionale Nachfrage der Landwirte nach Jahreszeit, m³/d. Richtwert, fachlich prüfen */
    regionalDemand: [
      { window: { from: [2, 1], to: [4, 30] } as DateWindow, m3PerDay: 250 },
      { window: { from: [5, 1], to: [6, 30] } as DateWindow, m3PerDay: 120 },
      { window: { from: [7, 15], to: [9, 30] } as DateWindow, m3PerDay: 160 },
    ],
    /** Füllstand, ab dem ein Ereignis "Lager hoch" entsteht, und Rückstellabstand */
    highShare: 0.85,
    highHysteresis: 0.1,
    /** Füllstand zu Beginn der Sperrfrist, ab dem ein Ereignis entsteht */
    blackoutStartHighShare: 0.5,
    /** Nachgasen im offenen Lager: Anteil Restpotenzial pro Tag bei 20 °C. Richtwert, fachlich prüfen */
    residualGasPerDay: 0.012,
    residualGasRefC: 20,
    /** Regen: m³ pro m² und mm */
    rainM3PerM2PerMm: 0.001,
    /** Abnahmeverträge (Freischaltung): Kosten €/m³ und Menge m³/d. Richtwert, fachlich prüfen */
    offtake: { costPerM3: 6, m3PerDay: 60 },
    /** Temperaturwirkung beim Nachgasen: Grenzen des Faktors */
    residualTempFactorRange: [0.2, 1.5] as const,
    /** Halbwertszeit Ursachen des Zuflusses, Tage */
    causeHalfLifeDays: 60,
    /** Liegt die Tagesmenge so viel über der Ausgangsfütterung, gilt die Fütterung als Hauptursache für ein volles Lager */
    volumeIncreaseShare: 0.1,
    /** Mindestanteil der verfügbaren Nachfrage, der vor der Sperrfrist genutzt sein sollte, damit der Spieler nicht als Hauptursache gilt */
    blackoutUsedShare: 0.5,
  },

  /** Felder und Landwirtschaft */
  fields: {
    list: [
      { id: 'f1', name: 'Feld am Hof', ha: 22, distanceKm: 1, throughVillage: false },
      { id: 'f2', name: 'Feld an der Kreisstraße', ha: 38, distanceKm: 4, throughVillage: true },
      { id: 'f3', name: 'Feld am Waldrand', ha: 55, distanceKm: 7, throughVillage: true },
    ],
    /** Pacht €/ha und Jahr. Richtwert, fachlich prüfen */
    leaseEurPerHa: 600,
    /** Felder werden nach der Ernte des Vorpächters frei */
    leaseAvailableFrom: [10, 15] as MonthDay,
    /** Anbaukosten €/ha. Richtwert, fachlich prüfen */
    cultivationEurPerHa: { mais: 900, gruenroggen: 450 },
    /** Erträge t FM/ha. Vorgabe Abschnitt 9 (Mais 40 bis 50). Richtwert, fachlich prüfen */
    yieldTPerHa: { mais: 45, gruenroggen: 28, maisNachRoggen: 36 },
    /** Ertragsstreuung (relativ, Wetter). Richtwert, fachlich prüfen */
    yieldNoise: 0.08,
    /** Saat- und Erntefenster. Richtwert, fachlich prüfen */
    windows: {
      maisSow: { from: [4, 20], to: [5, 20] } as DateWindow,
      maisHarvest: { from: [9, 1], to: [10, 15] } as DateWindow,
      roggenSow: { from: [9, 20], to: [11, 5] } as DateWindow,
      roggenHarvest: { from: [4, 25], to: [5, 25] } as DateWindow,
      zweitmaisSowBy: [6, 10] as MonthDay,
    },
    /** Optimaler Erntetag liegt so viele Tage nach Fensterbeginn (± Zufall). Richtwert, fachlich prüfen */
    optimumOffsetDays: { mais: 18, gruenroggen: 12 },
    optimumJitterDays: 5,
    /** Ertragsverlust pro Tag Abstand zum Optimum. Richtwert, fachlich prüfen */
    yieldLossPerDayFromOptimum: 0.006,
    /** Siloqualität sinkt bei Ernte vor dem Optimum (zu nass) pro Tag. Richtwert, fachlich prüfen */
    qualityLossPerDayEarly: 0.008,
    /** Siloqualität sinkt bei Ernte nach dem Optimum (zu trocken) pro Tag. Richtwert, fachlich prüfen */
    qualityLossPerDayLate: 0.006,
    /** Standard-Erntetag ohne Entscheidung: Tage nach Fensterbeginn */
    defaultHarvestOffsetDays: 10,
    /** Häckselleistung, ha pro Tag. Richtwert, fachlich prüfen */
    harvestHaPerDay: 25,
    /** Nicht bis Fensterende geerntete Fläche verliert diesen Ertragsanteil. Richtwert, fachlich prüfen */
    lateHarvestLoss: 0.5,
    /** Gärrestbedarf eigener Felder, m³/ha je Fenster. Richtwert, fachlich prüfen */
    digestateDemand: [
      { window: { from: [2, 1], to: [3, 31] } as DateWindow, crop: 'gruenroggen', m3PerHa: 20 },
      { window: { from: [3, 1], to: [5, 15] } as DateWindow, crop: 'mais', m3PerHa: 30 },
      { window: { from: [5, 20], to: [6, 15] } as DateWindow, crop: 'zweikultur', m3PerHa: 20 },
      { window: { from: [8, 1], to: [9, 30] } as DateWindow, crop: 'stoppel', m3PerHa: 15 },
    ],
    /** Last pro Anhänger, t (für Fahrten und Verkehr) */
    trailerT: 20,
    /** Siloqualität bei optimalem Erntetag eigener Felder, Lieferverträgen und Nachkauf (0 bis 1). Richtwert, fachlich prüfen */
    baseQuality: 0.9,
    contractQuality: 0.85,
    spotQuality: 0.8,
    /** Wachstumsdauer für die Darstellung, wenn kein Erntefenster im Durchlauf liegt, Tage */
    displayGrowthDays: 140,
    /** Wachstumsstand und Alter des stehenden Maises im Szenario mit eigenen Feldern */
    startGrowth: 0.85,
    startGrowthAgeDays: 100,
    /** Gärrestbedarf eines Fensters wird über so viele Tage verteilt abgerufen */
    digestateSpreadDays: 10,
  },

  /** Verträge und Märkte */
  contracts: {
    /** Transportkosten Silage, €/(t·km) plus Grundbetrag €/t. Richtwert, fachlich prüfen */
    silageTransportEurPerTKm: 0.30,
    silageHandlingEurPerT: 1.0,
    /** Transportkosten Gülle, €/(t·km) plus Grundbetrag €/t. Richtwert, fachlich prüfen */
    guelleTransportEurPerTKm: 0.25,
    guelleHandlingEurPerT: 0.8,
    /** Maislieferverträge, Angebot im August (Abschluss bis 31. August). Richtwert, fachlich prüfen */
    maizeOfferDeadline: [8, 31] as MonthDay,
    maizeOffers: [
      { id: 'lw_wendt', name: 'Hof Wendt', distanceKm: 3, maxT: 1500, priceEurPerT: 46, throughVillage: false, deliveryTPerDay: 350 },
      { id: 'lw_brandt', name: 'Hof Brandt', distanceKm: 4, maxT: 2500, priceEurPerT: 44, throughVillage: false, deliveryTPerDay: 450 },
      { id: 'lw_lindner', name: 'Hof Lindner', distanceKm: 7, maxT: 3000, priceEurPerT: 42, throughVillage: true, deliveryTPerDay: 500 },
      { id: 'ag_heidekamp', name: 'Agrargenossenschaft Heidekamp', distanceKm: 16, maxT: 5000, priceEurPerT: 38, throughVillage: true, deliveryTPerDay: 700 },
    ],
    /** Grünroggenverträge, Angebot im Herbst für Lieferung im Mai. Richtwert, fachlich prüfen */
    ryeOfferWindow: { from: [9, 15], to: [10, 31] } as DateWindow,
    ryeOffers: [
      { id: 'lw_brandt_r', name: 'Hof Brandt', distanceKm: 4, maxT: 1500, priceEurPerT: 36, throughVillage: false, deliveryTPerDay: 300 },
      { id: 'ag_heidekamp_r', name: 'Agrargenossenschaft Heidekamp', distanceKm: 16, maxT: 3000, priceEurPerT: 33, throughVillage: true, deliveryTPerDay: 500 },
    ],
    /** Lieferbeginn der Landwirte: Tage nach Fensterbeginn (min, max), zufällig. Richtwert, fachlich prüfen */
    deliveryStartOffsetDays: [3, 20] as const,
    /** Gülle-Lieferanten (Tierhalter). Richtwert, fachlich prüfen */
    guelleSuppliers: [
      { id: 'th_haase', name: 'Milchhof Haase', distanceKm: 2, maxTPerDay: 15, throughVillage: false },
      { id: 'th_koenig', name: 'Rinderhof König', distanceKm: 6, maxTPerDay: 25, throughVillage: true },
      { id: 'th_seidel', name: 'Milchviehanlage Seidel', distanceKm: 14, maxTPerDay: 40, throughVillage: true },
    ],
    /** Beim Start bestehende Gülleverträge des Vorbesitzers */
    startGuelleContracts: ['th_haase', 'th_koenig'],
    /** Vorlauf bis ein neuer Gülle-Vertrag liefert, Tage */
    guelleActivationDays: 7,
    /** Gülle pro LKW, t */
    guelleTruckT: 25,
    /** Nachkauf Mais am Markt. Richtwert, fachlich prüfen */
    spot: {
      basePriceEurPerT: 52,
      /** Aufschlag außerhalb der Ernte */
      offSeasonFactor: 1.3,
      /** Aufschlag im Dürrejahr. Vorgabe: Preise steigen stark */
      droughtFactor: 1.9,
      distanceKm: 20,
      deliveryDays: 3,
      maxTPerOrder: 300,
    },
    /** Agrarberaterin: Preisnachlass bei Vertragsabschluss */
    advisorPriceDiscount: 0.05,
  },

  /** Reststoffmarkt */
  residues: {
    /** Streuung des Angebotsabstands (Faktor min, max) */
    offerIntervalSpread: [0.5, 1.5] as const,
    /** Erstes Angebot am Spieltag */
    firstOfferDay: 3,
    /** Mittlerer Abstand zwischen Angeboten, Tage. Richtwert, fachlich prüfen */
    offerIntervalDays: 6,
    offerValidDays: 4,
    lotT: [80, 250] as const,
    /** Preis €/t (negativ: Abgeber zahlt). Richtwert, fachlich prüfen */
    priceEurPerT: [-8, 22] as const,
    /** Qualität relativ zum Mittelwert, Streuung (lognormal). Richtwert, fachlich prüfen */
    qualitySigma: 0.35,
    /** Wahrscheinlichkeit für Störstoffe je Partie. Richtwert, fachlich prüfen */
    contaminantChance: 0.12,
    /** Reparatur nach Störstoffen, € (min, max) und Tage mit halber Feststoffzufuhr. Richtwert, fachlich prüfen */
    contaminantRepairEur: [6000, 15000] as const,
    contaminantDays: 3,
    distanceKm: 25,
    transportEurPerTKm: 0.12,
    /** Lieferzeit, Tage */
    deliveryDays: 2,
    /** Anteil der Feststoffzufuhr während der Störstoffreparatur */
    contaminantFeedFactor: 0.5,
  },

  /** Personal. Kosten inklusive Nebenkosten, €/Monat, anteilig für diese Anlage (Teilzeit oder geteilt mit Nachbaranlagen, Annahme). Richtwert, fachlich prüfen */
  staff: {
    roles: {
      biologin: { salaryEurPerMonth: 3000 },
      techniker: { salaryEurPerMonth: 3500 },
      agrar: { salaryEurPerMonth: 2500 },
      vermarkter: { salaryEurPerMonth: 2500 },
    },
    /** Einarbeitung bis zur Wirkung, Tage */
    onboardingDays: 14,
    /** Kündigungsfrist, Monatsgehälter */
    severanceMonths: 1,
    /** Biologin: maximale Änderung der tatsächlichen Mischung pro Tag (sanfter Wechsel) */
    biologistRampPerDay: 0.1,
    /** Biologin: Spurenelementdosierung, € pro t oTS */
    traceDosingEurPerTots: 4,
    /** Techniker: Faktor auf Ausfallwahrscheinlichkeit, Verschleiß und Stillstandsdauer */
    technicianFailureFactor: 0.55,
    technicianWearFactor: 0.85,
    technicianDowntimeFactor: 0.5,
    /** Techniker beauftragt kleine Wartung ... Stunden vor Fälligkeit */
    technicianServiceLeadH: 100,
    /** Techniker füllt Entschwefelung nach unter ... Tagen Vorrat */
    technicianRefillDays: 10,
    /** Agrarberaterin: Ertragsplus, Gärrestnachfrage plus */
    advisorYieldBonus: 0.08,
    advisorDemandBonus: 0.35,
    /** Energievermarkter: Zusatzerlös €/kWh plus je Stunde Gasspeicher über Referenz */
    marketerBaseEurPerKwh: 0.016,
    marketerPerStorageHourEurPerKwh: 0.0015,
    marketerReferenceStorageHours: 6,
  },

  /** Akzeptanz im Dorf, 0 bis 100 */
  acceptance: {
    start: 52,
    /** Ruhewert, zu dem die Akzeptanz ohne Störungen langsam zurückkehrt. Richtwert, fachlich prüfen */
    baseline: 60,
    recoveryPerDay: 0.02,
    /** Bonus auf den Ruhewert bei aktiver Wärmeversorgung und nach Bürgerdialog */
    heatBaselineBonus: 12,
    dialogBaselineBonus: 8,
    dialogImmediate: 6,
    dialogCostEur: 3000,
    dialogCooldownDays: 60,
    /** Faire Verträge mit nahen Landwirten (bis km) geben einmalig Akzeptanz */
    localContractKm: 8,
    localContractBonus: 2,
    /** Geruchsquellen: Akzeptanzverlust pro Tag bei voller Ausprägung. Richtwert, fachlich prüfen */
    smell: {
      openDigestate: 0.15,
      residualGas: 0.3,
      silageLoss: 0.35,
      processUpset: 0.4,
      residueDelivery: 0.15,
      spreading: 0.1,
    },
    /** Verkehr: tolerierte Fahrten durch das Dorf pro Tag und Verlust je weitere Fahrt */
    trafficTolerance: 12,
    trafficPerTrip: 0.03,
    /** Fackel: Verlust pro Tag mit Fackelbetrieb */
    flarePerDay: 0.6,
    /** Halbwertszeit der Ursachen, Tage */
    causeHalfLifeDays: 30,
    /** Nachgasen: Bezug für volle Geruchswirkung, Anteil der Volllast-Methanmenge */
    residualGasReference: 0.1,
    /** Silage riecht erst unterhalb dieser Qualität; Verstärkung je Qualitätspunkt darunter */
    silageGoodQuality: 0.85,
    silageLossScale: 4,
    /** Rückkehr in eine bessere Stufe erst so viele Punkte über der Schwelle */
    levelHysteresis: 5,
    /** Ausfall der Wärmeversorgung bei aktiver Wärmeleitung, pro Tag im Winter */
    heatOutagePerDay: 0.8,
    /** Belastungsindex, ab dem Beschwerden möglich sind; Wahrscheinlichkeit pro Indexpunkt */
    complaintThreshold: 0.35,
    complaintChancePerPoint: 0.25,
    complaintCooldownDays: 5,
    /** Kritischer Bereich und Warnbereich */
    warningLevel: 30,
    criticalLevel: 20,
    /** Stilllegung: so viele Tage im kritischen Bereich und mindestens so viele Beschwerden im Fenster */
    shutdownDays: 30,
    shutdownComplaints: 4,
    shutdownComplaintWindowDays: 90,
    /** Behörde meldet sich nach so vielen Beschwerden im Fenster */
    authorityNoticeComplaints: 3,
  },

  /** Finanzen */
  finance: {
    startBalanceEur: 120000,
    /** Kreditrahmen (Kontokorrent), Zinssatz p. a. Richtwert, fachlich prüfen */
    creditLimitEur: 400000,
    interestRatePa: 0.07,
    /** Insolvenz: so viele Tage durchgehend unter dem Kreditrahmen */
    insolvencyDays: 30,
    /** EEG-Vergütung der Altanlage, €/kWh. Richtwert, fachlich prüfen */
    eegEurPerKwh: 0.21,
    /** Marktwert Strom, €/kWh: Mittel, Jahresgang, Streuung. Richtwert, fachlich prüfen */
    marketEurPerKwh: 0.085,
    marketSeasonalAmplitude: 0.015,
    marketNoise: 0.006,
    /** Wärmeerlös bei Wärmeleitung, €/kWh. Richtwert, fachlich prüfen */
    heatEurPerKwh: 0.06,
    /** Wärmeabnahme Dorf: kW Mittel und Jahresgang (Winter höher). Richtwert, fachlich prüfen */
    villageHeatKwMean: 140,
    villageHeatKwAmplitude: 90,
    villageHeatPeakDoy: 15,
    /** Anteil der BHKW-Wärme, der nach Fermenterheizung für das Dorf bleibt. Richtwert, fachlich prüfen */
    heatShareAvailable: 0.7,
    /** Wärmeausfall gilt ab diesem Wärmebedarf des Dorfs als spürbar, kW */
    heatOutageNoticeKw: 150,
    /** Rückkehr des Marktpreises zum Jahresgang pro Tag */
    marketReversion: 0.1,
    /** Mindererzeugung unter diesem Anteil wird keiner Ursache zugeordnet */
    shortfallTolerance: 0.05,
    /** Fixkosten pro Monat: Betriebsleiter, Hilfskraft, Versicherung, Sonstiges. Richtwert, fachlich prüfen */
    fixedCostsEurPerMonth: 8500,
    /** Kreditrahmen-Warnung durch Bank */
    bankNoticeShare: 0.8,
  },

  /** Maisdeckel: Höchstanteil Mais an der Inputmasse. OFFENER PUNKT: aktuelle EEG-Regelung klären. Richtwert, fachlich prüfen */
  maizeCap: {
    maxShare: 0.40,
    /** Bei Überschreitung wird der Monat nur zum Marktwert vergütet (Annahme) */
    penaltyToMarketValue: true,
  },

  /** Fütterung */
  feeding: {
    /** Startfütterung des Vorbesitzers, t/d. Richtwert, fachlich prüfen */
    start: { mais: 25, gruenroggen: 0, guelle: 40, reststoff: 0 },
    /** Spurenelementindex der Altanlage beim Start */
    startTraceElements: 0.5,
    /** Außentemperatur für die Vorlaufsimulation, °C */
    warmupAmbientC: 15,
    /** Fehlmenge, ab der ein Engpass gilt, t */
    shortageToleranceT: 0.5,
    /** Engpass gilt als behoben, wenn der Vorrat wieder so viele Tage reicht */
    refillDays: 7,
    /** Senkt eine Entscheidung den Gülleanteil (Masse) um mindestens diesen Wert, gilt sie als Ursache für Puffer- und Spurenelementmangel */
    lowBufferShareDrop: 0.1,
    /** Obergrenze je Regler, t/d */
    maxPerSubstrate: { mais: 60, gruenroggen: 60, guelle: 120, reststoff: 30 },
  },

  /** Beiläufige Meldungen aus der Welt ohne eigene Kausalität */
  messages: {
    /** Landwirt bietet Stoppelflächen für Gärrest an */
    stubbleDigestate: [8, 6] as MonthDay,
  },

  /** Startszenarien. Faktoren wirken auf Gülleangebot, Transportwege, Verkehrstoleranz und Akzeptanz. */
  scenarios: {
    altanlage: { fieldsOwned: false, guelleSupply: 1, guelleDistance: 1, trafficTolerance: 1, acceptanceStart: 0, acceptanceBaseline: 0 },
    eigene_felder: { fieldsOwned: true, guelleSupply: 1, guelleDistance: 1, trafficTolerance: 1, acceptanceStart: 0, acceptanceBaseline: 0 },
    /** Schwieriger Standort: weniger und entferntere Gülle, Dorf näher an der Zufahrt. Richtwert */
    schwieriger_standort: { fieldsOwned: false, guelleSupply: 0.7, guelleDistance: 1.4, trafficTolerance: 0.6, acceptanceStart: -10, acceptanceBaseline: -5 },
  },

  /** Ausbauten: Kosten, Bauzeit, Wirkung. Richtwert, fachlich prüfen */
  builds: {
    digestateStorage: { costEur: 180000, days: 56, addM3: 5000 },
    gasStorage: { costEur: 45000, days: 28, addM3: 1500 },
    cover: { costEur: 60000, costEurUnlocked: 35000, days: 21 },
    heatLine: { costEur: 220000, days: 56 },
    secondSilo: { costEur: 120000, days: 42 },
    /** Anzahlung bei Auftrag, Rest bei Fertigstellung */
    downPaymentShare: 0.5,
  },

  /** Wartungsvertrag (Freischaltung) */
  maintenanceContract: {
    eurPerMonth: 2800,
    failureFactor: 0.7,
    repairCoverShare: 0.5,
  },

  /** Wetter */
  weather: {
    /** Mitteltemperatur, Amplitude, Tag des Maximums im Kalenderjahr. Richtwert, fachlich prüfen */
    tempMeanC: 9.5,
    tempAmplitudeC: 9.5,
    tempPeakDoy: 200,
    tempNoiseC: 2.5,
    tempPersistence: 0.7,
    /** Regenwahrscheinlichkeit nach trockenem bzw. nassem Tag */
    rainAfterDry: 0.25,
    rainAfterRain: 0.6,
    rainMeanMm: 5,
    /** Dürrejahr: Wahrscheinlichkeit, Regenminderung, Ertragsfaktor */
    droughtChance: 0.15,
    droughtRainFactor: 0.5,
    droughtYieldFactor: { mais: 0.7, gruenroggen: 0.8 },
    /** Felder nicht befahrbar ab mm Regen am Tag oder nach so vielen Regentagen in Folge */
    wetDayMm: 8,
    wetStreakDays: 3,
    /** Boden gefroren unter °C */
    frostC: -1,
  },

  /** Jahresbilanz und Bewertung */
  rating: {
    /** Reichweite Silovorrat bis zur nächsten Maisernte, Tage (31. Juli bis Mitte September) */
    supplyDaysNeeded: 45,
    /** Punkte je Kennzahl, Schwellen (gut, sehr gut). Richtwert */
    profitEur: [0, 80000] as const,
    acceptance: [45, 65] as const,
    gasLossShare: [0.05, 0.02] as const,
    bioErrorShare: [0.1, 0.03] as const,
    /** Stufen: Mindestpunkte. Namen in content */
    tiers: [0, 3, 6, 9] as const,
    /** Höchstpunktzahl: vier Kennzahlen mit je zwei Punkten, Vorrat und Maisdeckel mit je einem */
    maxPoints: 10,
  },

  /** Ereignisprotokoll */
  causes: {
    /** Maximale Anzahl Ursachen je Ereignis */
    maxCauses: 3,
    /** Halbwertszeit-Basis und Schwelle, unter der eine Ursache aus dem Register fällt */
    half: 0.5,
    dropBelow: 1e-4,
    /** Mindestgewicht, damit eine Ursache genannt wird (relativ zum stärksten) */
    minRelativeWeight: 0.15,
  },
} as const;

export interface SubstrateConfig {
  ts: number;
  ots: number;
  ch4PerT: number;
  ch4Share: number;
  kHyd: number;
  buffer: number;
  traceElements: number;
  h2s: number;
}

export type Config = typeof CONFIG;
export type StaffRole = keyof typeof CONFIG.staff.roles;
export const STAFF_ROLES = Object.keys(CONFIG.staff.roles) as StaffRole[];
export type BuildKind = keyof typeof CONFIG.builds extends infer K ? Exclude<K, 'downPaymentShare'> : never;

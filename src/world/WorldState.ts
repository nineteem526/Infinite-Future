import type { EraId } from './types';

/**
 * Deterministic game state shared by all systems. M1 only needs the active
 * era and its switch serial; later milestones add flags, unique items and
 * causal state here so every system communicates through one authority.
 */
export class WorldState {
  private era: EraId;
  private serial = 0;
  private readonly flags = new Map<string, boolean>();

  constructor(initialEra: EraId = '2026') {
    this.era = initialEra;
  }

  get currentEra(): EraId {
    return this.era;
  }

  get switchSerial(): number {
    return this.serial;
  }

  /** Commit a new active era. Called only by TimeShift inside a transaction. */
  setEra(era: EraId): void {
    if (era === this.era) return;
    this.era = era;
    this.serial += 1;
  }

  flag(name: string): boolean {
    return this.flags.get(name) ?? false;
  }

  setFlag(name: string, value: boolean): void {
    this.flags.set(name, value);
  }

  snapshot(): { era: EraId; serial: number; flags: Record<string, boolean> } {
    return {
      era: this.era,
      serial: this.serial,
      flags: Object.fromEntries(this.flags),
    };
  }
}

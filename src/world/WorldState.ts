import { initialCausality, reduceCausality } from '../m2/causality';
import type { CausalityState, InteractionAction, InteractionOutcome } from '../m2/types';
import type { EraId } from './types';

/**
 * Deterministic game state shared by all systems: the active era, the M1
 * serial/flags and the M2 causal chain. Every item/mechanism change goes
 * through applyInteraction, which delegates to the pure reducer; no other
 * system may mutate causal state.
 */
export class WorldState {
  private era: EraId;
  private serial = 0;
  private causalityState: CausalityState = initialCausality();
  private readonly flags = new Map<string, boolean>();

  constructor(initialEra: EraId = '2026') {
    this.era = initialEra;
  }

  get causality(): Readonly<CausalityState> {
    return this.causalityState;
  }

  applyInteraction(action: InteractionAction, era: EraId): InteractionOutcome {
    const result = reduceCausality(this.causalityState, action, { era });
    if (result.outcome.changed) {
      this.causalityState = result.state;
    }
    return result.outcome;
  }

  resetCausality(): void {
    this.causalityState = initialCausality();
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

  snapshot(): {
    era: EraId;
    serial: number;
    flags: Record<string, boolean>;
    causality: CausalityState;
  } {
    return {
      era: this.era,
      serial: this.serial,
      flags: Object.fromEntries(this.flags),
      causality: this.causalityState,
    };
  }
}

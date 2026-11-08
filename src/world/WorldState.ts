import { initialCausality, reduceCausality } from '../m2/causality';
import type { CausalityState, InteractionAction, InteractionOutcome } from '../m2/types';
import { initialStory, reduceStory } from '../m3/story';
import type { StoryAction, StoryOutcome, StoryState } from '../m3/types';
import type { EraId } from './types';

/**
 * Deterministic game state shared by all systems: the active era, the M1
 * serial/flags, the M2 causal chain and the M3 mainline stage. Every item,
 * mechanism and story change goes through a pure reducer here; no other system
 * may mutate causal or story state.
 */
export class WorldState {
  private era: EraId;
  private serial = 0;
  private causalityState: CausalityState = initialCausality();
  private storyState: StoryState = initialStory();
  private readonly flags = new Map<string, boolean>();

  constructor(initialEra: EraId = '2026') {
    this.era = initialEra;
  }

  get causality(): Readonly<CausalityState> {
    return this.causalityState;
  }

  get story(): Readonly<StoryState> {
    return this.storyState;
  }

  applyInteraction(action: InteractionAction, era: EraId): InteractionOutcome {
    const result = reduceCausality(this.causalityState, action, { era });
    if (result.outcome.changed) {
      this.causalityState = result.state;
    }
    return result.outcome;
  }

  applyStoryAction(action: StoryAction, era: EraId): StoryOutcome {
    const result = reduceStory(this.storyState, action, {
      era,
      causality: this.causalityState,
    });
    if (result.outcome.changed) {
      this.storyState = result.state;
    }
    return result.outcome;
  }

  resetCausality(): void {
    this.causalityState = initialCausality();
  }

  resetStory(): void {
    this.storyState = initialStory();
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
    story: StoryState;
  } {
    return {
      era: this.era,
      serial: this.serial,
      flags: Object.fromEntries(this.flags),
      causality: this.causalityState,
      story: this.storyState,
    };
  }
}

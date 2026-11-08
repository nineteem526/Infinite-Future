import type { EraId } from '../world/types';

/** The only hand-held item in M2; its ID is the single source of item identity. */
export const CRYSTAL_ITEM_ID = 'crystal-01';

export type CrystalAnchor = 'pedestal-2126';
export type GeneratorSocket = 'generator-2026';

/**
 * A crystal exists in exactly one place at any time. This discriminated union
 * makes "world / held / socket" mutually exclusive by construction, so no code
 * path can duplicate or lose it.
 */
export type CrystalPlacement =
  | { readonly kind: 'world'; readonly era: '2126'; readonly anchor: CrystalAnchor }
  | { readonly kind: 'inventory' }
  | { readonly kind: 'socket'; readonly socket: GeneratorSocket };

export interface CausalityState {
  readonly crystal: CrystalPlacement;
  readonly generatorEnergized: boolean;
  readonly pastDeviceActivated: boolean;
  readonly futureGateOpen: boolean;
  readonly chamberVisited: boolean;
  /** Deterministic mutation counter; only successful mutations increment it. */
  readonly revision: number;
}

export type TargetId =
  | 'crystal-2126'
  | 'generator-2026'
  | 'past-device-2026'
  | 'future-gate-2126';

export interface InteractionTarget {
  readonly id: TargetId;
  readonly era: EraId;
  readonly anchor: { readonly x: number; readonly y: number; readonly z: number };
  readonly radius: number;
}

export type InteractionAction =
  | { readonly type: 'pickup-crystal'; readonly target: 'crystal-2126'; readonly itemId: typeof CRYSTAL_ITEM_ID }
  | { readonly type: 'insert-crystal'; readonly target: 'generator-2026'; readonly itemId: typeof CRYSTAL_ITEM_ID }
  | { readonly type: 'operate-past-device'; readonly target: 'past-device-2026' }
  | { readonly type: 'enter-chamber'; readonly target: 'future-chamber-2126' };

export type InteractionTone = 'success' | 'info' | 'error';

export interface InteractionOutcome {
  readonly changed: boolean;
  readonly ok: boolean;
  readonly message: string;
  readonly tone: InteractionTone;
}

export interface TargetDescription {
  /** Player-facing prompt while standing next to this target. */
  readonly prompt: string;
  /** Null means F only shows information; no state mutation is attempted. */
  readonly action: InteractionAction | null;
}

export interface ObjectiveView {
  readonly step: number;
  readonly total: number;
  readonly title: string;
  readonly done: boolean;
}

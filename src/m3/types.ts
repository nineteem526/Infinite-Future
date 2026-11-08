import type { Vec3 } from '../core/types';
import type { CausalityState } from '../m2/types';
import type { EraId } from '../world/types';

/** Deterministic mainline stages for the re-planned M3 route. */
export type StoryStage =
  | 'gallery-intro'
  | 'street'
  | 'bridge'
  | 'corridor'
  | 'workshop'
  | 'archive'
  | 'terminal'
  | 'return-gallery'
  | 'complete';

export interface StoryState {
  readonly stage: StoryStage;
  readonly timeDeviceAcquired: boolean;
  readonly airborneShiftUsed: boolean;
  readonly archiveRead: boolean;
  readonly lockdownClosed: boolean;
  readonly firstStrokePainted: boolean;
  readonly revision: number;
}

export type StoryAction =
  | { readonly type: 'enter-frame' }
  | { readonly type: 'acquire-time-device' }
  | { readonly type: 'record-airborne-shift' }
  | { readonly type: 'complete-bridge' }
  | { readonly type: 'cross-corridor' }
  | { readonly type: 'enter-archive' }
  | { readonly type: 'read-archive' }
  | { readonly type: 'close-lockdown' }
  | { readonly type: 'paint-first-stroke' };

export type StoryTone = 'success' | 'info' | 'error';

export interface StoryOutcome {
  readonly changed: boolean;
  readonly ok: boolean;
  readonly message: string;
  readonly subtitle?: string;
  readonly tone: StoryTone;
}

export interface StoryReductionContext {
  readonly era: EraId;
  readonly causality: CausalityState;
}

/** Exactly three gallery frames: past painting, future painting, blank canvas. */
export type StoryTargetId =
  | 'painting-2026'
  | 'painting-2126'
  | 'time-device'
  | 'archive-record'
  | 'terminal-core'
  | 'blank-canvas';

export interface StoryTarget {
  readonly id: StoryTargetId;
  readonly era: EraId;
  readonly anchor: Vec3;
  readonly radius: number;
}

export interface StoryTargetDescription {
  readonly prompt: string;
  /** Null means F only shows information; no state mutation is attempted. */
  readonly action: StoryAction | null;
}

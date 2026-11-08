import type { Vec3 } from '../core/types';
import type { CausalityState } from '../m2/types';
import type { EraId } from '../world/types';

/** Deterministic mainline stages for M3. */
export type StoryStage =
  | 'gallery-intro'
  | 'district'
  | 'workshop'
  | 'archive'
  | 'terminal'
  | 'return-gallery'
  | 'complete';

export type PaintingId = 'painting-2026' | 'painting-2126' | 'painting-gallery';

export interface StoryState {
  readonly stage: StoryStage;
  readonly paintingsViewed: readonly PaintingId[];
  readonly galleryDoorOpen: boolean;
  readonly shiftLearned: boolean;
  readonly archiveRead: boolean;
  readonly lockdownClosed: boolean;
  readonly firstStrokePainted: boolean;
  readonly revision: number;
}

export type StoryAction =
  | { readonly type: 'view-painting'; readonly painting: PaintingId }
  | { readonly type: 'enter-frame' }
  | { readonly type: 'learn-shift' }
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

export type StoryTargetId =
  | 'painting-2026'
  | 'painting-2126'
  | 'painting-gallery'
  | 'gallery-frame'
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

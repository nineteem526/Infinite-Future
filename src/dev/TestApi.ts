import * as THREE from 'three';
import type { PoseSnapshot } from '../core/types';
import type { Game } from '../core/Game';
import type { PresentationSnapshot } from '../m2/CausalitySystem';
import { M2_TARGETS } from '../m2/layout';
import {
  CRYSTAL_ITEM_ID,
  type CausalityState,
  type InteractionOutcome,
  type InteractionTarget,
  type ObjectiveView,
} from '../m2/types';
import { FRAME_DESTINATION, FRAME_DESTINATION_LABEL, STORY_TARGETS } from '../m3/layout';
import type { StoryPresentationSnapshot } from '../m3/StorySystem';
import type { StoryOutcome, StoryState, StoryTarget } from '../m3/types';
import { type EraId } from '../world/types';

export interface M1TestState {
  ready: boolean;
  era: EraId;
  eraName: string;
  pose: PoseSnapshot;
  switchCount: number;
  rejectionCount: number;
  lastRejectionReason: string;
  eraSerial: number;
  visibleEra: EraId | null;
  environment: {
    background: string | null;
    fogColor: string | null;
    fogDensity: number | null;
    exposure: number;
  };
  audio: {
    started: boolean;
    disabled: boolean;
    era: EraId;
    contextState: string;
  };
  hud: {
    badge: string;
    hint: string;
    toast: string;
    overlayVisible: boolean;
    objective: string;
    objectiveEyebrow: string;
    held: string;
    interactionPrompt: string;
  };
  render: {
    calls: number;
    triangles: number;
    frames: number;
  };
  colliders: {
    era2026: number;
    era2126: number;
  };
  queuedSwitches: number;
  errors: string[];
}

export interface M2TestState extends M1TestState {
  causality: CausalityState;
  heldItemId: string | null;
  crystalItemId: string;
  objective: ObjectiveView;
  objectiveStatus: string;
  interactionPromptText: string | null;
  presentation: PresentationSnapshot;
  interactionTargets: readonly InteractionTarget[];
  gateCollision: {
    era: '2126';
    colliderHandle: number;
    closed: boolean;
    blocksMovement: boolean;
  };
  m2Colliders: {
    static2026: number;
    static2126: number;
    gateHandle: number;
  };
}

export interface M3TestState extends M2TestState {
  story: StoryState;
  storyObjective: ObjectiveView;
  storyStatus: string;
  storySubtitle: string;
  storyPresentation: StoryPresentationSnapshot;
  storyTargets: readonly StoryTarget[];
  storyOutcome: StoryOutcome | null;
  frameDestination: { readonly x: number; readonly y: number; readonly z: number };
  frameDestinationSafe: boolean;
  facingBlankCanvas: boolean;
}

export interface ObstructionProbe {
  blocked: boolean;
  hits: number;
}

export interface M1TestApi {
  state(): M1TestState;
  press(code: string): void;
  release(code: string): void;
  look(dx: number, dy: number): void;
  switchEra(): void;
  teleport(x: number, y: number, z: number, yaw?: number, pitch?: number): void;
  step(frames?: number): Promise<void>;
  probe(era: EraId, x: number, y: number, z: number): ObstructionProbe;
}

export interface M2TestApi extends M1TestApi {
  state(): M2TestState;
  interact(): InteractionOutcome | null;
  resetRun(): void;
  objective(): ObjectiveView;
  interactionPrompt(): string | null;
}

export interface M3TestApi extends M2TestApi {
  state(): M3TestState;
  storyInteract(): StoryOutcome | null;
  storyObjective(): ObjectiveView;
  storySubtitleText(): string;
  storyStatus(): string;
  storyPresentation(): StoryPresentationSnapshot;
  frameTeleportInfo(): {
    destination: { readonly x: number; readonly y: number; readonly z: number };
    label: string;
    safe: boolean;
  };
  blankCanvasFacing(): boolean;
}

declare global {
  interface Window {
    __M1_READY__?: boolean;
    __M1_TEST__?: M1TestApi;
    __M2_TEST__?: M2TestApi;
    __M3_TEST__?: M3TestApi;
  }
}

function colorHex(color: THREE.ColorRepresentation | THREE.Color | THREE.Texture | null): string | null {
  return color instanceof THREE.Color ? `#${color.getHexString()}` : null;
}

/**
 * Browser acceptance helper, installed only when the page is opened with
 * `?test=1`. Exposed as both `__M2_TEST__` and (M1-compatible) `__M1_TEST__`;
 * all checks run against the real game loop, physics and WorldState.
 */
export function installTestApi(game: Game, errors: string[]): void {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('test')) return;

  game.input.setLookEventsAllowed(true);

  const press = (code: string): void => {
    window.dispatchEvent(
      new KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }),
    );
  };

  const release = (code: string): void => {
    window.dispatchEvent(
      new KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }),
    );
  };

  const api: M3TestApi = {
    state(): M3TestState {
      const era = game.worldState.currentEra;
      const eraObj = game.eras.get(era);
      const fog = game.scene.fog;
      const badge = document.querySelector('.era-badge-title')?.textContent ?? '';
      const hint = document.querySelector('.hint')?.textContent ?? '';
      const objectiveTitle = document.querySelector('.objective-title')?.textContent ?? '';
      const objectiveEyebrow = document.querySelector('.objective-eyebrow')?.textContent ?? '';
      const objectiveStatusText = document.querySelector('.objective-status')?.textContent ?? '';
      const heldText = document.querySelector('.held')?.textContent ?? '';
      const promptText = document.querySelector('.interact-prompt')?.textContent ?? '';
      const visibleEra = [...game.eras.values()].find((candidate) => candidate.group.visible)?.id ?? null;
      const stats = game.renderStats();
      const causality = game.worldState.causality;
      return {
        ready: window.__M1_READY__ === true,
        era,
        eraName: eraObj?.name ?? '',
        pose: game.player.snapshot(),
        switchCount: game.timeShift.switchCount,
        rejectionCount: game.timeShift.rejectionCount,
        lastRejectionReason: game.timeShift.lastRejectionReason,
        eraSerial: game.worldState.switchSerial,
        visibleEra,
        environment: {
          background: colorHex(game.scene.background),
          fogColor: fog instanceof THREE.FogExp2 ? `#${fog.color.getHexString()}` : null,
          fogDensity: fog instanceof THREE.FogExp2 ? fog.density : null,
          exposure: game.renderer.toneMappingExposure,
        },
        audio: game.audio.state,
        hud: {
          badge,
          hint,
          toast: game.hud.currentToastText(),
          overlayVisible: game.hud.isOverlayVisible,
          objective: objectiveTitle,
          objectiveEyebrow,
          held: heldText,
          interactionPrompt: promptText,
        },
        render: stats,
        colliders: {
          era2026: game.physics.countColliders('2026'),
          era2126: game.physics.countColliders('2126'),
        },
        queuedSwitches: game.input.queuedSwitches,
        errors: [...errors],
        causality,
        heldItemId: causality.crystal.kind === 'inventory' ? CRYSTAL_ITEM_ID : null,
        crystalItemId: CRYSTAL_ITEM_ID,
        objective: game.story.objectiveView(),
        objectiveStatus: objectiveStatusText,
        interactionPromptText: promptText.length > 0 ? promptText : null,
        presentation: game.causality.presentation(),
        interactionTargets: M2_TARGETS,
        gateCollision: (() => {
          const gate = game.causality.gateCollision();
          return {
            era: gate.era,
            colliderHandle: gate.colliderHandle,
            closed: gate.closed,
            blocksMovement: gate.blocksMovement,
          };
        })(),
        m2Colliders: {
          static2026: game.m2Content.staticSolids2026,
          static2126: game.m2Content.staticSolids2126,
          gateHandle: game.m2Content.gateColliderHandle,
        },
        story: game.worldState.story,
        storyObjective: game.story.objectiveView(),
        storyStatus: game.story.statusLine(),
        storySubtitle: game.story.subtitle(),
        storyPresentation: game.story.presentation(),
        storyTargets: STORY_TARGETS,
        storyOutcome: game.story.lastOutcome,
        frameDestination: FRAME_DESTINATION,
        frameDestinationSafe: game.story.frameDestinationSafe(),
        facingBlankCanvas: game.story.facesBlankCanvas(),
      };
    },

    press,
    release,

    look(dx: number, dy: number): void {
      const event = new MouseEvent('mousemove', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'movementX', { value: dx });
      Object.defineProperty(event, 'movementY', { value: dy });
      document.dispatchEvent(event);
    },

    switchEra(): void {
      press('KeyE');
      release('KeyE');
    },

    interact(): InteractionOutcome | null {
      // Mirrors the in-game F routing: story targets first, then M2 targets.
      // The story outcome is available via state().storyOutcome/storyInteract().
      if (game.story.interact()) return null;
      return game.causality.interact();
    },

    resetRun(): void {
      // Direct reset; press('KeyR') exercises the queued input path instead.
      game.story.resetRun();
    },

    storyInteract(): StoryOutcome | null {
      const handled = game.story.interact();
      return handled ? game.story.lastOutcome : null;
    },

    storyObjective(): ObjectiveView {
      return game.story.objectiveView();
    },

    storySubtitleText(): string {
      return game.story.subtitle();
    },

    storyStatus(): string {
      return game.story.statusLine();
    },

    storyPresentation(): StoryPresentationSnapshot {
      return game.story.presentation();
    },

    frameTeleportInfo(): {
      destination: { readonly x: number; readonly y: number; readonly z: number };
      label: string;
      safe: boolean;
    } {
      return {
        destination: game.story.frameDestination(),
        label: FRAME_DESTINATION_LABEL,
        safe: game.story.frameDestinationSafe(),
      };
    },

    blankCanvasFacing(): boolean {
      return game.story.facesBlankCanvas();
    },

    teleport(x: number, y: number, z: number, yaw?: number, pitch?: number): void {
      game.player.teleport(x, y, z, yaw, pitch);
      game.player.syncCamera();
    },

    step(frames = 1): Promise<void> {
      const total = Math.max(1, Math.floor(frames));
      return new Promise((resolve) => {
        let remaining = total;
        const next = (): void => {
          remaining -= 1;
          if (remaining <= 0) {
            resolve();
            return;
          }
          requestAnimationFrame(next);
        };
        requestAnimationFrame(next);
      });
    },

    probe(era: EraId, x: number, y: number, z: number): ObstructionProbe {
      return game.physics.isCapsuleObstructed(era, { x, y, z });
    },

    objective(): ObjectiveView {
      return game.story.objectiveView();
    },

    interactionPrompt(): string | null {
      return game.story.effectivePrompt();
    },
  };

  window.__M3_TEST__ = api;
  window.__M2_TEST__ = api;
  window.__M1_TEST__ = api;
}

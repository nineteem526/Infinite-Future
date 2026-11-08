import * as THREE from 'three';
import type { PoseSnapshot } from '../core/types';
import type { Game } from '../core/Game';
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

declare global {
  interface Window {
    __M1_READY__?: boolean;
    __M1_TEST__?: M1TestApi;
  }
}

function colorHex(color: THREE.ColorRepresentation | THREE.Color | THREE.Texture | null): string | null {
  return color instanceof THREE.Color ? `#${color.getHexString()}` : null;
}

/**
 * Browser acceptance helper, installed only when the page is opened with
 * `?test=1`. It exposes deterministic state and synthetic input so the
 * acceptance owner can script real-browser checks without a custom client.
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

  const api: M1TestApi = {
    state(): M1TestState {
      const era = game.worldState.currentEra;
      const eraObj = game.eras.get(era);
      const fog = game.scene.fog;
      const badge = document.querySelector('.era-badge-title')?.textContent ?? '';
      const hint = document.querySelector('.hint')?.textContent ?? '';
      const visibleEra = [...game.eras.values()].find((candidate) => candidate.group.visible)?.id ?? null;
      const stats = game.renderStats();
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
        },
        render: stats,
        colliders: {
          era2026: game.physics.countColliders('2026'),
          era2126: game.physics.countColliders('2126'),
        },
        queuedSwitches: game.input.queuedSwitches,
        errors: [...errors],
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
  };

  window.__M1_TEST__ = api;
}

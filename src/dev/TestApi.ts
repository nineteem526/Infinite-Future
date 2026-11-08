import * as THREE from 'three';
import type { PoseSnapshot } from '../core/types';
import type { Game } from '../core/Game';
import type { PresentationSnapshot } from '../m2/CausalitySystem';
import type { CrystalAssetStats } from '../m2/crystalAsset';
import { crystalAssetDiagnostics } from '../m2/crystalAsset';
import { chronoKeyAssetDiagnostics } from '../m2/chronoKeyAsset';
import { galleryFrameAssetDiagnostics } from '../m2/galleryFrameAsset';
import type { NormalizedAssetStats } from '../m2/gameAsset';
import { M2_LAYOUT, M2_TARGETS } from '../m2/layout';
import {
  CRYSTAL_ITEM_ID,
  type CausalityState,
  type InteractionOutcome,
  type InteractionTarget,
  type ObjectiveView,
} from '../m2/types';
import { FRAME_DESTINATION, FRAME_DESTINATION_LABEL, STORY_TARGETS, STREET } from '../m3/layout';
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
  crystalVisual: {
    source: 'glb' | 'placeholder';
    stats: CrystalAssetStats | null;
    diagnostics: readonly string[];
  };
  m2Colliders: {
    static2026: number;
    static2126: number;
    gateHandle: number;
  };
}

export interface M3TestState extends M2TestState {
  story: StoryState;
  chronoKeyVisual: {
    source: 'glb' | 'placeholder';
    stats: NormalizedAssetStats | null;
    diagnostics: readonly string[];
  };
  galleryFrameVisual: {
    source: 'glb' | 'placeholder';
    stats: NormalizedAssetStats | null;
    diagnostics: readonly string[];
  };
  galleryArtwork: {
    source2026: 'texture' | 'fallback';
    source2126: 'texture' | 'fallback';
    diagnostics: readonly string[];
  };
  storyObjective: ObjectiveView;
  storyStatus: string;
  storySubtitle: string;
  storyPresentation: StoryPresentationSnapshot;
  storyTargets: readonly StoryTarget[];
  storyOutcome: StoryOutcome | null;
  frameDestination: { readonly x: number; readonly y: number; readonly z: number };
  frameDestinationSafe: boolean;
  facingBlankCanvas: boolean;
  timeDeviceAcquired: boolean;
  canSwitchEra: boolean;
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
        crystalVisual: {
          source: game.m2Content.crystalVisualSource,
          stats: game.m2Content.crystalAssetStats,
          diagnostics: crystalAssetDiagnostics(),
        },
        m2Colliders: {
          static2026: game.m2Content.staticSolids2026,
          static2126: game.m2Content.staticSolids2126,
          gateHandle: game.m2Content.gateColliderHandle,
        },
        story: game.worldState.story,
        chronoKeyVisual: {
          source: game.storyContent.chronoKeyVisualSource,
          stats: game.storyContent.chronoKeyAssetStats,
          diagnostics: chronoKeyAssetDiagnostics(),
        },
        galleryFrameVisual: {
          source: game.storyContent.galleryFrameVisualSource,
          stats: game.storyContent.galleryFrameAssetStats,
          diagnostics: galleryFrameAssetDiagnostics(),
        },
        galleryArtwork: {
          source2026: game.storyContent.galleryArtwork2026,
          source2126: game.storyContent.galleryArtwork2126,
          diagnostics: game.storyContent.galleryArtworkDiagnostics,
        },
        storyObjective: game.story.objectiveView(),
        storyStatus: game.story.statusLine(),
        storySubtitle: game.story.subtitle(),
        storyPresentation: game.story.presentation(),
        storyTargets: STORY_TARGETS,
        storyOutcome: game.story.lastOutcome,
        frameDestination: FRAME_DESTINATION,
        frameDestinationSafe: game.story.frameDestinationSafe(),
        facingBlankCanvas: game.story.facesBlankCanvas(),
        timeDeviceAcquired: game.worldState.story.timeDeviceAcquired,
        canSwitchEra: game.story.canSwitchEra(),
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

  // ?test=1-only acceptance control. It drives the existing test API through the
  // same deterministic story/causality interactions as a normal playthrough.
  const panel = document.createElement('div');
  panel.dataset.testAcceptance = 'crystal-2126';
  panel.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:16px',
    'z-index:2147483000',
    'width:310px',
    'padding:10px 12px',
    'border:1px solid #8fe8ff',
    'border-radius:8px',
    'background:rgba(8,14,20,0.92)',
    'color:#dff7ff',
    'font:12px/1.45 system-ui,sans-serif',
    'box-shadow:0 4px 18px rgba(0,0,0,0.45)',
  ].join(';');
  const title = document.createElement('div');
  title.textContent = 'ART-003 验收：2126 晶体';
  title.style.cssText = 'font-weight:700;letter-spacing:0.04em;color:#9fe8ff;margin-bottom:4px';
  const hint = document.createElement('div');
  hint.textContent = '按正常规则重置并取得折时仪，传送到晶体前；按 F 拾取，按 E 跨时代，再前往 2026 插槽。';
  hint.style.cssText = 'color:#a9c5cf;margin-bottom:8px';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '定位到 2126 晶体前';
  button.style.cssText = [
    'width:100%',
    'padding:7px 10px',
    'border:1px solid #4fd8f0',
    'border-radius:6px',
    'background:#123241',
    'color:#dff7ff',
    'font-weight:600',
    'cursor:pointer',
  ].join(';');
  const status = document.createElement('div');
  status.style.cssText = 'margin-top:8px;color:#c7dce4;min-height:2.9em;white-space:pre-wrap';
  status.textContent = '等待点击。此按钮只在 ?test=1 下出现。';

  const galleryDivider = document.createElement('div');
  galleryDivider.style.cssText = 'height:1px;background:rgba(143,232,255,0.25);margin:10px 0 8px';
  const galleryTitle = document.createElement('div');
  galleryTitle.textContent = '画廊三幅画验收';
  galleryTitle.style.cssText = 'font-weight:700;letter-spacing:0.04em;color:#ffd9a0;margin-bottom:4px';
  const galleryHint = document.createElement('div');
  galleryHint.textContent = '仅测试：站到画前并正对画面，不改变剧情/交互状态。';
  galleryHint.style.cssText = 'color:#a9c5cf;margin-bottom:6px';
  const galleryRow = document.createElement('div');
  galleryRow.style.cssText = 'display:flex;gap:5px';
  const makeGalleryButton = (label: string): HTMLButtonElement => {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.style.cssText = [
      'flex:1',
      'padding:6px 4px',
      'border:1px solid #c9a15a',
      'border-radius:6px',
      'background:#2c2416',
      'color:#ffe7c4',
      'font-weight:600',
      'font-size:11px',
      'cursor:pointer',
    ].join(';');
    return element;
  };
  const pastButton = makeGalleryButton('左：过去画');
  const futureButton = makeGalleryButton('右：未来画');
  const blankButton = makeGalleryButton('中央：空白');
  galleryRow.append(pastButton, futureButton, blankButton);
  const galleryStatus = document.createElement('div');
  galleryStatus.style.cssText = 'margin-top:6px;color:#c7dce4;min-height:1.5em;white-space:pre-wrap';
  galleryStatus.textContent = '等待画前定位。';

  panel.append(
    title,
    hint,
    button,
    status,
    galleryDivider,
    galleryTitle,
    galleryHint,
    galleryRow,
    galleryStatus,
  );
  document.body.append(panel);

  const prepareCrystalInspection = async (): Promise<void> => {
    button.disabled = true;
    status.textContent = '正在按确定性规则准备：重置 → 画框 → 折时仪 → 2126 晶体…';
    try {
      api.resetRun();
      await api.step(8);

      let state = api.state();
      if (state.story.stage === 'gallery-intro') {
        const painting = STORY_TARGETS.find((target) => target.id === 'painting-2026');
        if (!painting) throw new Error('找不到过去画框验收目标');
        api.teleport(painting.anchor.x, 0.94, painting.anchor.z, 0, 0);
        await api.step(3);
        api.interact();
        await api.step(4);
      }

      state = api.state();
      if (!state.timeDeviceAcquired) {
        api.teleport(STREET.timeDevice.x + 1.6, 1.2, STREET.timeDevice.z, 0, 0);
        await api.step(3);
        api.interact();
        await api.step(4);
      }

      state = api.state();
      if (!state.timeDeviceAcquired) {
        throw new Error(`折时仪未取得（stage=${state.story.stage}）`);
      }
      if (state.era === '2026') {
        api.teleport(0, 1.2, 10, 0, 0);
        await api.step(3);
        api.switchEra();
        await api.step(10);
      }

      state = api.state();
      if (state.era !== '2126') {
        throw new Error(`未能安全切到 2126（拒绝原因：${state.lastRejectionReason || '未知'}）`);
      }

      api.teleport(
        M2_LAYOUT.crystalWorld.x,
        1.2,
        M2_LAYOUT.crystalWorld.z + 2.2,
        0,
        0.24,
      );
      await api.step(5);

      state = api.state();
      const prompt = state.interactionPromptText ?? state.hud.interactionPrompt;
      if (!prompt || !/晶体|拾取/.test(prompt)) {
        throw new Error(`晶体交互提示未出现（prompt=${prompt ?? 'null'}）`);
      }
      status.textContent = [
        `已就位：${state.era} · 晶体 ${state.causality.crystal.kind}`,
        `准星提示：${prompt}`,
        '按 F 拾取；拾取后按 E 回 2026，发电机插槽在 (10, 1.9, 1.02)。',
      ].join('\n');
    } catch (error) {
      status.textContent = `验收点准备失败：${error instanceof Error ? error.message : String(error)}`;
      console.error('[ART-003 acceptance]', error);
    } finally {
      button.disabled = false;
    }
  };

  button.addEventListener('click', () => {
    void prepareCrystalInspection();
  });

  const focusGalleryView = async (kind: 'past' | 'future' | 'blank'): Promise<void> => {
    for (const element of [pastButton, futureButton, blankButton]) element.disabled = true;
    galleryStatus.textContent = '仅测试：正在安全定位…';
    try {
      let state = api.state();
      if (state.era !== '2026') {
        api.teleport(0, 1.2, 20, 0, 0);
        await api.step(3);
        if (!api.state().canSwitchEra) {
          throw new Error('当前剧情锁定了 E；请先回到 2026 画廊再试');
        }
        api.switchEra();
        await api.step(10);
        state = api.state();
        if (state.era !== '2026') {
          throw new Error(`无法安全回到 2026（${state.lastRejectionReason || 'E 被拒绝'}）`);
        }
      }

      const view = kind === 'past'
        ? { label: '过去画（左）', x: 50.8, z: 22, yaw: Math.PI / 2, pitch: 0.28 }
        : kind === 'future'
          ? { label: '未来画（右）', x: 55.2, z: 22, yaw: -Math.PI / 2, pitch: 0.28 }
          : { label: '中央空白画布', x: 53, z: 24.2, yaw: Math.PI, pitch: 0.28 };

      api.teleport(view.x, 1.2, view.z, view.yaw, view.pitch);
      await api.step(4);
      state = api.state();
      galleryStatus.textContent = `已就位：${view.label}｜${state.era}｜坐标 (${view.x.toFixed(1)}, ${view.z.toFixed(1)})｜仅测试定位，剧情未改。`;
    } catch (error) {
      galleryStatus.textContent = `定位失败：${error instanceof Error ? error.message : String(error)}`;
      console.error('[gallery acceptance]', error);
    } finally {
      for (const element of [pastButton, futureButton, blankButton]) element.disabled = false;
    }
  };

  pastButton.addEventListener('click', () => {
    void focusGalleryView('past');
  });
  futureButton.addEventListener('click', () => {
    void focusGalleryView('future');
  });
  blankButton.addEventListener('click', () => {
    void focusGalleryView('blank');
  });
}

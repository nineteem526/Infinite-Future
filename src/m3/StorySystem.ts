import { EYE_HEIGHT, PLAYER_TOTAL_HALF_HEIGHT } from '../core/constants';
import type { CausalitySystem } from '../m2/CausalitySystem';
import type { ObjectiveView } from '../m2/types';
import type { Player } from '../player/Player';
import type { Physics } from '../physics/Physics';
import type { WorldState } from '../world/WorldState';
import type { StoryContent } from './content';
import { describeStoryTarget, resolveStoryTarget } from './interaction';
import {
  areaLabel,
  FRAME_DESTINATION,
  FRAME_DESTINATION_LABEL,
  FRAME_DESTINATION_YAW,
  STORY_LAYOUT,
  STORY_TARGETS,
} from './layout';
import { STORY_INTRO_SUBTITLE, storyObjectiveView } from './story';
import type { StoryAction, StoryOutcome, StoryState, StoryTarget } from './types';

/** Minimum view-direction dot product for accepting the blank-canvas paint. */
const BLANK_CANVAS_FACING_DOT = 0.55;

export interface StoryHudPort {
  showToast(message: string, kind: 'error' | 'info'): void;
  setObjective(objective: ObjectiveView, status: string): void;
  setInteractionPrompt(text: string | null): void;
  setStorySubtitle(text: string | null): void;
}

export interface StoryDeps {
  readonly worldState: WorldState;
  readonly player: Player;
  readonly physics: Physics;
  readonly hud: StoryHudPort;
  readonly content: StoryContent;
  readonly causality: CausalitySystem;
}

export interface StoryPresentationSnapshot {
  readonly galleryDoorCanvas: boolean;
  readonly galleryDoorObstacle: boolean;
  readonly galleryDoorHandle: number;
  readonly terminalBarrier: boolean;
  readonly terminalBarrierObstacle: boolean;
  readonly terminalBarrierHandle: number;
  readonly paintStroke: boolean;
  readonly lockdownClosed: boolean;
  readonly coreEmissive: string;
}

/**
 * M3 mainline controller. It owns the deterministic stage machine, story
 * interactions, narrative subtitles and the two story-gated dynamic colliders.
 * Item/causality state stays in WorldState (M2); this controller only submits
 * StoryActions and reflects the resulting state in presentation and HUD.
 */
export class StorySystem {
  private readonly worldState: WorldState;
  private readonly player: Player;
  private readonly physics: Physics;
  private readonly hud: StoryHudPort;
  private readonly content: StoryContent;
  private readonly causality: CausalitySystem;

  private subtitleText: string = STORY_INTRO_SUBTITLE;
  private lastObjectiveKey = '';
  private lastPrompt: string | null = null;
  private lastSubtitle: string | null = null;
  private districtSerialBaseline = 0;
  private outcome: StoryOutcome | null = null;

  constructor(deps: StoryDeps) {
    this.worldState = deps.worldState;
    this.player = deps.player;
    this.physics = deps.physics;
    this.hud = deps.hud;
    this.content = deps.content;
    this.causality = deps.causality;

    // Story-gated, protected dynamic obstacles: gallery frame door (2026) and
    // terminal lockdown barrier (2126). Physics includes them in movement and
    // time-shift safety queries while their story flag is closed.
    deps.physics.registerDynamicCollider(
      this.content.galleryDoorCollider,
      '2026',
      () => !this.worldState.story.galleryDoorOpen,
      true,
    );
    deps.physics.registerDynamicCollider(
      this.content.terminalBarrierCollider,
      '2126',
      () => !this.worldState.story.archiveRead,
      true,
    );

    this.syncPresentation();
    this.updateHud(true);
    this.setSubtitle(STORY_INTRO_SUBTITLE);
  }

  get state(): Readonly<StoryState> {
    return this.worldState.story;
  }

  get lastOutcome(): StoryOutcome | null {
    return this.outcome;
  }

  objectiveView(): ObjectiveView {
    return storyObjectiveView(this.worldState.story, this.worldState.causality);
  }

  subtitle(): string {
    return this.subtitleText;
  }

  area(): string {
    return areaLabel(this.worldState.currentEra, this.player.position);
  }

  statusLine(): string {
    const story = this.worldState.story;
    const area = this.area();
    switch (story.stage) {
      case 'gallery-intro':
        return `地点：最后的画廊 · 已观察 ${story.paintingsViewed.length}/3`;
      case 'district':
        return `地点：${area} · 按 E 切换时代`;
      case 'workshop':
      case 'archive':
        return `地点：${area} · ${this.causality.status()}`;
      case 'terminal':
        return `地点：${area} · 时间封锁：维持中`;
      case 'return-gallery':
        return `地点：${area} · 中央画布等待第一笔颜色`;
      case 'complete':
        return '主线完成 · The future is not written.';
    }
  }

  targets(): readonly StoryTarget[] {
    return STORY_TARGETS;
  }

  /** Fixed painting-teleport destination (deterministic, never player-chosen). */
  frameDestination(): { readonly x: number; readonly y: number; readonly z: number } {
    return FRAME_DESTINATION;
  }

  /** True when the fixed destination is an unobstructed, supported landing. */
  frameDestinationSafe(): boolean {
    const report = this.physics.isCapsuleObstructed('2026', FRAME_DESTINATION);
    return !report.blocked && this.physics.hasSupport('2026', FRAME_DESTINATION);
  }

  /**
   * Ending-only orientation gate: the player must actually face the blank
   * canvas to receive the paint prompt / accept F. This deliberately applies to
   * the blank canvas only; all other story interactions keep proximity rules.
   */
  facesBlankCanvas(): boolean {
    if (this.worldState.story.stage !== 'return-gallery') return false;
    const target = resolveStoryTarget(this.worldState.currentEra, this.player.position);
    if (!target || target.id !== 'blank-canvas') return false;

    const eyeX = this.player.position.x;
    const eyeY = this.player.position.y - PLAYER_TOTAL_HALF_HEIGHT + EYE_HEIGHT;
    const eyeZ = this.player.position.z;
    const dx = STORY_LAYOUT.blankCanvas.x - eyeX;
    const dy = STORY_LAYOUT.blankCanvas.y - eyeY;
    const dz = STORY_LAYOUT.blankCanvas.z - eyeZ;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < 1e-6) return false;

    const cosPitch = Math.cos(this.player.pitch);
    const forwardX = -Math.sin(this.player.yaw) * cosPitch;
    const forwardY = Math.sin(this.player.pitch);
    const forwardZ = -Math.cos(this.player.yaw) * cosPitch;
    const alignment = (dx * forwardX + dy * forwardY + dz * forwardZ) / distance;
    return alignment >= BLANK_CANVAS_FACING_DOT;
  }

  storyPrompt(): string | null {
    const target = resolveStoryTarget(this.worldState.currentEra, this.player.position);
    if (!target) return null;
    if (
      target.id === 'blank-canvas'
      && this.worldState.story.stage === 'return-gallery'
      && !this.facesBlankCanvas()
    ) {
      return '转过身，面向中央空白画布，按 F 落笔';
    }
    return describeStoryTarget(target, this.worldState.story, this.worldState.causality).prompt;
  }

  /** HUD prompt: story targets take precedence, otherwise M2's prompt is kept. */
  effectivePrompt(): string | null {
    return this.storyPrompt() ?? this.causality.promptForCurrentPosition();
  }

  presentation(): StoryPresentationSnapshot {
    return {
      galleryDoorCanvas: this.content.galleryDoorCanvas.visible,
      galleryDoorObstacle: !this.worldState.story.galleryDoorOpen,
      galleryDoorHandle: this.content.galleryDoorHandle,
      terminalBarrier: this.content.terminalBarrierMesh.visible,
      terminalBarrierObstacle: !this.worldState.story.archiveRead,
      terminalBarrierHandle: this.content.terminalBarrierHandle,
      paintStroke: this.content.paintStroke.visible,
      lockdownClosed: this.worldState.story.lockdownClosed,
      coreEmissive: `#${this.content.coreCanvasMaterial.emissive.getHexString()}`,
    };
  }

  /** F priority: returns true when a story target handled the interaction. */
  interact(): boolean {
    const target = resolveStoryTarget(this.worldState.currentEra, this.player.position);
    if (!target) return false;

    // Ending interaction: proximity alone is not enough; the camera must point
    // at the blank canvas, otherwise F only gives natural guidance.
    if (
      target.id === 'blank-canvas'
      && this.worldState.story.stage === 'return-gallery'
      && !this.facesBlankCanvas()
    ) {
      this.hud.showToast('先转过身，面向中央空白画布，再按 F 落笔', 'info');
      this.updateHud(true);
      return true;
    }

    const description = describeStoryTarget(
      target,
      this.worldState.story,
      this.worldState.causality,
    );
    if (description.action === null) {
      this.hud.showToast(description.prompt, 'info');
      this.updateHud(true);
      return true;
    }

    // The central-frame painting teleport validates its fixed destination before
    // committing any state. A blocked/unsupported destination aborts the whole
    // transaction (door stays closed, stage unchanged) and reports where it was
    // trying to go. This is a painting interaction, not an E time-shift.
    if (description.action.type === 'enter-frame') {
      if (!this.frameDestinationSafe()) {
        this.hud.showToast(
          `画框传送失败：目的地【${FRAME_DESTINATION_LABEL}】被占据或悬空，请先清理落点`,
          'error',
        );
        this.updateHud(true);
        return true;
      }
      const outcome = this.applyAction(description.action, false);
      this.outcome = outcome;
      if (outcome.changed) {
        this.teleportThroughFrame();
      }
      return true;
    }

    this.outcome = this.applyAction(description.action, false);
    return true;
  }

  /** Deterministic painting-teleport arrival; only used by enter-frame. */
  private teleportThroughFrame(): void {
    this.player.teleport(
      FRAME_DESTINATION.x,
      FRAME_DESTINATION.y,
      FRAME_DESTINATION.z,
      FRAME_DESTINATION_YAW,
      0,
    );
    this.player.syncCamera();
    this.districtSerialBaseline = this.worldState.switchSerial;
    this.updateHud(true);
  }

  /** Per-fixed-step hook: deterministic stage transitions and HUD refresh. */
  tick(): void {
    for (let guard = 0; guard < 4; guard += 1) {
      const story = this.worldState.story;

      if (story.stage === 'district' && this.worldState.switchSerial > this.districtSerialBaseline) {
        this.applyAction({ type: 'learn-shift' }, true);
        continue;
      }

      if (story.stage === 'workshop' && this.worldState.causality.chamberVisited) {
        this.applyAction({ type: 'enter-archive' }, true);
        continue;
      }

      break;
    }

    this.updateHud(false);
  }

  /** Restart the whole mainline from the gallery intro. */
  resetRun(): void {
    this.causality.resetRun();
    this.worldState.resetStory();
    this.districtSerialBaseline = this.worldState.switchSerial;
    this.outcome = null;
    this.syncPresentation();
    this.setSubtitle(STORY_INTRO_SUBTITLE);
    this.updateHud(true);
    this.hud.showToast('已重新开始主线：回到最后的画廊', 'info');
  }

  private applyAction(action: StoryAction, silent: boolean): StoryOutcome {
    const outcome = this.worldState.applyStoryAction(action, this.worldState.currentEra);
    if (outcome.changed) {
      this.syncPresentation();
      if (outcome.subtitle !== undefined) {
        this.setSubtitle(outcome.subtitle);
      }
    }
    if (!silent) {
      this.hud.showToast(outcome.message, outcome.tone === 'error' ? 'error' : 'info');
    }
    this.updateHud(true);
    return outcome;
  }

  private setSubtitle(text: string): void {
    this.subtitleText = text;
    if (text !== this.lastSubtitle) {
      this.hud.setStorySubtitle(text);
      this.lastSubtitle = text;
    }
  }

  private syncPresentation(): void {
    const story = this.worldState.story;
    this.content.galleryDoorCanvas.visible = !story.galleryDoorOpen;
    this.content.terminalBarrierMesh.visible = !story.archiveRead;
    this.content.paintStroke.visible = story.firstStrokePainted;
    this.content.archiveGlyphMaterial.emissiveIntensity = story.archiveRead ? 1.0 : 0.55;
    this.content.archiveGlyphMaterial.needsUpdate = true;
    this.content.setLockdownClosed(story.lockdownClosed);
  }

  private updateHud(force: boolean): void {
    const objective = this.objectiveView();
    const status = this.statusLine();
    const objectiveKey = `${objective.step}/${objective.total}/${objective.title}/${objective.done}/${status}`;
    if (force || objectiveKey !== this.lastObjectiveKey) {
      this.hud.setObjective(objective, status);
      this.lastObjectiveKey = objectiveKey;
    }

    const prompt = this.effectivePrompt();
    if (force || prompt !== this.lastPrompt) {
      this.hud.setInteractionPrompt(prompt);
      this.lastPrompt = prompt;
    }
  }
}

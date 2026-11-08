import type { EraId } from '../world/types';
import { EYE_HEIGHT, PLAYER_TOTAL_HALF_HEIGHT } from '../core/constants';
import type { CausalitySystem } from '../m2/CausalitySystem';
import type { ObjectiveView } from '../m2/types';
import type { Player } from '../player/Player';
import type { Physics } from '../physics/Physics';
import type { SwitchOutcome } from '../time/TimeShift';
import type { WorldState } from '../world/WorldState';
import type { StoryContent } from './content';
import { describeStoryTarget, resolveStoryTarget } from './interaction';
import {
  FRAME_DESTINATION,
  FRAME_DESTINATION_LABEL,
  FRAME_DESTINATION_YAW,
  GALLERY,
  STORY_TARGETS,
  STREET,
} from './layout';
import { STORY_INTRO_SUBTITLE, storyObjectiveView, storyStatusView } from './story';
import type { StoryAction, StoryOutcome, StoryState, StoryTarget } from './types';

const BLANK_CANVAS_FACING_DOT = 0.55;

export interface StoryHudPort {
  playTeleportEffect?(era: EraId): void;
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
  readonly terminalBarrier: boolean;
  readonly terminalBarrierObstacle: boolean;
  readonly terminalBarrierHandle: number;
  readonly paintStroke: boolean;
  readonly lockdownClosed: boolean;
  readonly coreEmissive: string;
}

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
  private passageOpenNotified = false;
  private outcome: StoryOutcome | null = null;

  constructor(deps: StoryDeps) {
    this.worldState = deps.worldState;
    this.player = deps.player;
    this.physics = deps.physics;
    this.hud = deps.hud;
    this.content = deps.content;
    this.causality = deps.causality;

    deps.physics.registerDynamicCollider(
      this.content.terminalBarrierCollider,
      '2126',
      () => !this.worldState.story.archiveRead,
      true,
    );
    deps.physics.registerDynamicCollider(
      this.content.bridgeWallCollider,
      '2126',
      () => true,
      true,
    );
    deps.physics.registerDynamicCollider(
      this.content.corridorCollapseCollider,
      '2126',
      () => true,
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

  statusLine(): string {
    return storyStatusView(this.worldState.story.stage);
  }

  targets(): readonly StoryTarget[] {
    return STORY_TARGETS;
  }

  frameDestination(): { readonly x: number; readonly y: number; readonly z: number } {
    return FRAME_DESTINATION;
  }

  frameDestinationSafe(): boolean {
    const report = this.physics.isCapsuleObstructed('2026', FRAME_DESTINATION);
    return !report.blocked && this.physics.hasSupport('2026', FRAME_DESTINATION);
  }

  /** E is locked only while the player is in the street before the device. */
  canSwitchEra(): boolean {
    return this.worldState.story.stage !== 'street';
  }

  rejectEraSwitch(): void {
    this.hud.showToast('折时仪尚未取得：无法稳定切换时代', 'info');
    this.updateHud(true);
  }

  /** Kept for Game API compatibility; also records the airborne bridge switch. */
  notifyEraSwitch(outcome: SwitchOutcome, airborne: boolean): void {
    if (!outcome.ok || !airborne) return;
    if (this.worldState.story.stage !== 'bridge') return;
    if (this.worldState.currentEra !== '2126') return;
    const { x, z } = this.player.position;
    if (x < 40 || x > 48 || z < 8 || z > 14) return;
    this.applyAction({ type: 'record-airborne-shift' }, true);
  }

  private inStreetGap(): boolean {
    const { x, z } = this.player.position;
    return x >= STREET.bridge.gap.minX
      && x <= STREET.bridge.gap.maxX
      && z >= 8
      && z <= 14;
  }

  private inBridgeLandingZone(): boolean {
    const { x, z } = this.player.position;
    return x >= 40 && x <= 42.3 && z >= 8 && z <= 14;
  }

  private inCorridorCheckpoint(): boolean {
    const { x, z } = this.player.position;
    return x <= 33.5 && z >= 8 && z <= 14;
  }

  private tryRecoverFromFall(): boolean {
    if (this.worldState.story.stage !== 'bridge') return false;
    if (!this.player.grounded) return false;
    if (this.player.position.y > 1.2) return false;
    if (!this.inStreetGap()) return false;

    this.player.teleport(STREET.bridge.retryX, 1.52, 11, Math.PI / 2, 0);
    this.player.syncCamera();
    this.hud.showToast('跌落：回到桥边重试', 'info');
    this.setSubtitle('你跌回了街道。');
    this.updateHud(true);
    return true;
  }

  facesBlankCanvas(): boolean {
    if (this.worldState.story.stage !== 'return-gallery') return false;
    const target = resolveStoryTarget(this.worldState.currentEra, this.player.position);
    if (!target || target.id !== 'blank-canvas') return false;

    const eyeX = this.player.position.x;
    const eyeY = this.player.position.y - PLAYER_TOTAL_HALF_HEIGHT + EYE_HEIGHT;
    const eyeZ = this.player.position.z;
    const dx = GALLERY.blankCanvas.x - eyeX;
    const dy = GALLERY.blankCanvas.y - eyeY;
    const dz = GALLERY.blankCanvas.z - eyeZ;
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

  effectivePrompt(): string | null {
    return this.storyPrompt() ?? this.causality.promptForCurrentPosition();
  }

  presentation(): StoryPresentationSnapshot {
    return {
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

    if (description.action.type === 'enter-frame') {
      if (!this.frameDestinationSafe()) {
        this.hud.showToast(
          `画框传送失败：目的地【${FRAME_DESTINATION_LABEL}】被占据或悬空`,
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

  private teleportThroughFrame(): void {
    this.hud.playTeleportEffect?.(this.worldState.currentEra);
    this.player.teleport(
      FRAME_DESTINATION.x,
      FRAME_DESTINATION.y,
      FRAME_DESTINATION.z,
      FRAME_DESTINATION_YAW,
      0,
    );
    this.player.syncCamera();
    this.updateHud(true);
  }

  tick(): void {
    this.tryRecoverFromFall();

    const story = this.worldState.story;
    if (story.stage === 'bridge' && story.airborneShiftUsed && this.inBridgeLandingZone()) {
      this.applyAction({ type: 'complete-bridge' }, true);
    }
    if (this.worldState.story.stage === 'corridor' && this.inCorridorCheckpoint()) {
      this.applyAction({ type: 'cross-corridor' }, true);
    }

    if (
      this.worldState.story.stage === 'workshop'
      && this.worldState.causality.futureGateOpen
      && !this.worldState.causality.chamberVisited
      && !this.passageOpenNotified
    ) {
      this.passageOpenNotified = true;
      this.setSubtitle('西侧通道已打开。');
    }

    if (this.worldState.story.stage === 'workshop' && this.worldState.causality.chamberVisited) {
      this.applyAction({ type: 'enter-archive' }, true);
    }

    this.updateHud(false);
  }

  resetRun(): void {
    this.causality.resetRun();
    this.worldState.resetStory();
    this.outcome = null;
    this.passageOpenNotified = false;
    this.syncPresentation();
    this.setSubtitle(STORY_INTRO_SUBTITLE);
    this.updateHud(true);
    this.hud.showToast('已重新开始主线：回到画廊', 'info');
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
    this.content.terminalBarrierMesh.visible = !story.archiveRead;
    this.content.paintStroke.visible = story.firstStrokePainted;
    this.content.archiveGlyphMaterial.emissiveIntensity = story.archiveRead ? 1.0 : 0.55;
    this.content.archiveGlyphMaterial.needsUpdate = true;
    this.content.setArchiveRead(story.archiveRead);
    this.content.setPassageOpen(this.worldState.causality.futureGateOpen);
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



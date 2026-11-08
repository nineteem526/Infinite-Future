import type { Collider } from '@dimforge/rapier3d-compat';
import type { Vec3 } from '../core/types';
import type { Player, PlayerSpawn } from '../player/Player';
import type { TimeShift } from '../time/TimeShift';
import type { EraId } from '../world/types';
import type { WorldState } from '../world/WorldState';
import { heldItemLabel, objectiveView, statusView } from './causality';
import type { M2Content } from './content';
import { describeTarget, resolveInteractionTarget } from './interaction';
import { M2_LAYOUT } from './layout';
import type {
  CausalityState,
  InteractionAction,
  InteractionOutcome,
  ObjectiveView,
} from './types';

export interface CausalityHudPort {
  showToast(message: string, kind: 'error' | 'info'): void;
  setObjective(objective: ObjectiveView, status: string): void;
  setHeld(text: string): void;
  setInteractionPrompt(text: string | null): void;
}

export interface CausalityDeps {
  readonly worldState: WorldState;
  readonly player: Player;
  readonly timeShift: TimeShift;
  readonly hud: CausalityHudPort;
  readonly content: M2Content;
  readonly spawn: PlayerSpawn;
}

export interface PresentationSnapshot {
  readonly worldCrystal: boolean;
  readonly carriedCrystal: boolean;
  readonly socketCrystal: boolean;
  readonly generatorGlow: boolean;
  readonly gateSlab: boolean;
  readonly gateOpenGlow: boolean;
  readonly chamberMarker: boolean;
  readonly gateObstacle: boolean;
  readonly visibleCrystalVisuals: readonly string[];
}

/**
 * Integration contract for the dynamic 2126 gate collider. The gate is closed
 * exactly when `futureGateOpen === false`; `blocksMovement` is the authoritative
 * open-state flag. Integration should include the collider in target-era
 * collision queries (TimeShift safety probe, protected-mechanism checks) only
 * while closed.
 */
export interface GateCollisionInfo {
  readonly era: '2126';
  readonly colliderHandle: number;
  readonly collider: Collider;
  readonly closed: boolean;
  readonly blocksMovement: boolean;
}

function isInsideChamber(position: Vec3): boolean {
  const { chamber } = M2_LAYOUT;
  return (
    position.x >= chamber.minX
    && position.x <= chamber.maxX
    && position.z >= chamber.minZ
    && position.z <= chamber.maxZ
  );
}

/**
 * M2 controller: resolves interaction intents (read-only), delegates every state
 * change to WorldState's pure reducer, then commits presentation atomically.
 *
 * The dynamic future gate slab collider is owned here rather than by Physics, so
 * M1's time-shift/safety code stays untouched. It is included in player movement
 * via Player.setExtraObstacleFilter while the gate is closed; the slab footprint
 * overlaps 2026's fountain basin, so no legal 2026 standing spot can switch into
 * the closed slab. No safety-probe change is required for this layout.
 */
export class CausalitySystem {
  private readonly worldState: WorldState;
  private readonly player: Player;
  private readonly timeShift: TimeShift;
  private readonly hud: CausalityHudPort;
  private readonly content: M2Content;
  private readonly spawn: PlayerSpawn;

  private lastObjectiveKey = '';
  private lastHeld = '';
  private lastPrompt: string | null = null;

  constructor(deps: CausalityDeps) {
    this.worldState = deps.worldState;
    this.player = deps.player;
    this.timeShift = deps.timeShift;
    this.hud = deps.hud;
    this.content = deps.content;
    this.spawn = deps.spawn;

    this.player.setExtraObstacleFilter(this.dynamicObstacleFilter);
    this.syncPresentation();
    this.updateHud(true);
  }

  /** Dynamic-obstacle predicate used by Player movement. */
  readonly dynamicObstacleFilter = (collider: Collider, era: EraId): boolean => {
    if (era !== '2126') return false;
    if (this.worldState.causality.futureGateOpen) return false;
    return collider.handle === this.content.gateColliderHandle;
  };

  get state(): Readonly<CausalityState> {
    return this.worldState.causality;
  }

  objective(): ObjectiveView {
    return objectiveView(this.worldState.causality);
  }

  status(): string {
    return statusView(this.worldState.causality);
  }

  held(): string {
    return heldItemLabel(this.worldState.causality);
  }

  promptForCurrentPosition(): string | null {
    const target = resolveInteractionTarget(this.worldState.currentEra, this.player.position);
    if (!target) return null;
    return describeTarget(target, this.worldState.causality).prompt;
  }

  gateObstacleActive(): boolean {
    return !this.worldState.causality.futureGateOpen;
  }

  /** Public hook for TimeShift / protected-mechanism integration. */
  gateCollision(): GateCollisionInfo {
    const closed = !this.worldState.causality.futureGateOpen;
    return {
      era: '2126',
      colliderHandle: this.content.gateColliderHandle,
      collider: this.content.gateCollider,
      closed,
      blocksMovement: closed,
    };
  }

  presentation(): PresentationSnapshot {
    const visibleCrystalVisuals: string[] = [];
    if (this.content.worldCrystal.visible) visibleCrystalVisuals.push('world');
    if (this.content.carriedCrystal.visible) visibleCrystalVisuals.push('inventory');
    if (this.content.socketCrystal.visible) visibleCrystalVisuals.push('socket');
    return {
      worldCrystal: this.content.worldCrystal.visible,
      carriedCrystal: this.content.carriedCrystal.visible,
      socketCrystal: this.content.socketCrystal.visible,
      generatorGlow: this.content.generatorGlow.visible,
      gateSlab: this.content.gateSlab.visible,
      gateOpenGlow: this.content.gateOpenGlow.visible,
      chamberMarker: this.content.chamberMarker.visible,
      gateObstacle: this.gateObstacleActive(),
      visibleCrystalVisuals,
    };
  }

  /** F interaction: resolve nearest target for the active era, then apply. */
  interact(): InteractionOutcome | null {
    const era = this.worldState.currentEra;
    const target = resolveInteractionTarget(era, this.player.position);
    if (!target) {
      this.hud.showToast('附近没有可交互的目标', 'info');
      return null;
    }

    const description = describeTarget(target, this.worldState.causality);
    if (description.action === null) {
      this.hud.showToast(description.prompt, 'info');
      return null;
    }

    return this.applyAction(description.action, era);
  }

  /** Per-fixed-step hook: chamber entry detection and HUD refresh. */
  tick(): void {
    const state = this.worldState.causality;
    if (
      this.worldState.currentEra === '2126'
      && state.futureGateOpen
      && !state.chamberVisited
      && isInsideChamber(this.player.position)
    ) {
      this.applyAction({ type: 'enter-chamber', target: 'future-chamber-2126' }, '2126');
    }
    this.updateHud(false);
  }

  /** Reset the whole run's causal state and return to the initial spawn/era. */
  resetRun(): void {
    this.player.teleport(
      this.spawn.position.x,
      this.spawn.position.y,
      this.spawn.position.z,
      this.spawn.yaw,
      this.spawn.pitch,
    );

    if (this.worldState.currentEra !== '2026') {
      const outcome = this.timeShift.request('2026');
      if (!outcome.ok) {
        throw new Error('重置失败：无法安全返回 2026');
      }
    }

    this.worldState.resetCausality();
    this.syncPresentation();
    this.updateHud(true);
    this.hud.showToast('已重置：因果链回到初始状态', 'info');
  }

  private applyAction(action: InteractionAction, era: EraId): InteractionOutcome {
    const outcome = this.worldState.applyInteraction(action, era);
    if (outcome.changed) {
      this.syncPresentation();
    }
    this.hud.showToast(outcome.message, outcome.tone === 'error' ? 'error' : 'info');
    this.updateHud(true);
    return outcome;
  }

  /** Visual state always follows WorldState; collider gating follows the same flag. */
  private syncPresentation(): void {
    const state = this.worldState.causality;
    this.content.worldCrystal.visible = state.crystal.kind === 'world';
    this.content.carriedCrystal.visible = state.crystal.kind === 'inventory';
    this.content.socketCrystal.visible = state.crystal.kind === 'socket';
    this.content.generatorGlow.visible = state.generatorEnergized;
    this.content.gateSlab.visible = !state.futureGateOpen;
    this.content.gateOpenGlow.visible = state.futureGateOpen;
    this.content.chamberMarker.visible = state.futureGateOpen;
  }

  private updateHud(force: boolean): void {
    const state = this.worldState.causality;
    const objective = objectiveView(state);
    const status = statusView(state);
    const held = heldItemLabel(state);

    const objectiveKey = `${objective.step}/${objective.total}/${objective.title}/${objective.done}/${status}`;
    if (force || objectiveKey !== this.lastObjectiveKey) {
      this.hud.setObjective(objective, status);
      this.lastObjectiveKey = objectiveKey;
    }

    if (force || held !== this.lastHeld) {
      this.hud.setHeld(held);
      this.lastHeld = held;
    }

    const target = resolveInteractionTarget(this.worldState.currentEra, this.player.position);
    const prompt = target ? describeTarget(target, state).prompt : null;
    if (force || prompt !== this.lastPrompt) {
      this.hud.setInteractionPrompt(prompt);
      this.lastPrompt = prompt;
    }
  }
}

import type * as THREE from 'three';
import type { Physics } from '../physics/Physics';
import type { Player } from '../player/Player';
import type { Era } from '../world/Era';
import type { EraId } from '../world/types';
import type { WorldState } from '../world/WorldState';

export interface HudPort {
  setEra(era: EraId, name: string, description: string): void;
  showToast(message: string, kind: 'error' | 'info'): void;
  setSwitchStats(switches: number, rejections: number): void;
}

export interface AudioPort {
  ensureStarted(): void;
  setEra(era: EraId): void;
}

export interface SwitchOutcome {
  ok: boolean;
  from: EraId;
  to: EraId;
  reason?: string;
  adjusted?: boolean;
}

/**
 * Transactional era switch.
 *
 * Invariants enforced here:
 *  - The target position (the player's current capsule) is probed against the
 *    target era's structural colliders before anything changes.
 *  - If blocked, a nearby safe landing is selected; if none exists, nothing changes (no visual, collision, light or audio
 *    state is committed).
 *  - On success render visibility, collision ownership, scene environment
 *    (background/fog/exposure) and ambience switch in the same synchronous
 *    transaction. View and velocity are preserved; position changes only when necessary.
 */
export class TimeShift {
  switchCount = 0;
  rejectionCount = 0;
  lastRejectionReason = '';

  private readonly worldState: WorldState;
  private readonly eras: ReadonlyMap<EraId, Era>;
  private readonly physics: Physics;
  private readonly player: Player;
  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly hud: HudPort;
  private readonly audio: AudioPort;

  constructor(
    worldState: WorldState,
    eras: ReadonlyMap<EraId, Era>,
    physics: Physics,
    player: Player,
    scene: THREE.Scene,
    renderer: THREE.WebGLRenderer,
    hud: HudPort,
    audio: AudioPort,
  ) {
    this.worldState = worldState;
    this.eras = eras;
    this.physics = physics;
    this.player = player;
    this.scene = scene;
    this.renderer = renderer;
    this.hud = hud;
    this.audio = audio;
  }

  request(target: EraId): SwitchOutcome {
    const from = this.worldState.currentEra;
    if (target === from) {
      return { ok: true, from, to: target };
    }

    this.audio.ensureStarted();

    const pose = this.player.snapshot();
    const report = this.physics.isCapsuleObstructed(target, pose.position);

    let adjusted = false;
    if (report.blocked) {
      const landing = report.protectedObstacle
        ? null
        : this.physics.findSafeLanding(from, target, pose.position, pose.grounded);
      if (!landing) {
        const reason = '附近没有安全落点，请稍微移动后再试';
        this.rejectionCount += 1;
        this.lastRejectionReason = reason;
        this.hud.showToast(reason, 'info');
        this.hud.setSwitchStats(this.switchCount, this.rejectionCount);
        return { ok: false, from, to: target, reason };
      }
      // Reposition without Player.teleport(), which deliberately clears velocity.
      this.player.body.setTranslation(landing, true);
      this.player.body.setNextKinematicTranslation(landing);
      this.player.position.set(landing.x, landing.y, landing.z);
      this.player.syncCamera();
      adjusted = true;
    }

    this.apply(target);
    this.switchCount += 1;
    this.hud.setSwitchStats(this.switchCount, this.rejectionCount);
    if (adjusted) this.hud.showToast('已避开时空障碍', 'info');
    return { ok: true, from, to: target, adjusted };
  }

  private apply(target: EraId): void {
    const fromEra = this.eras.get(this.worldState.currentEra);
    const targetEra = this.eras.get(target);
    if (!fromEra || !targetEra) {
      throw new Error(`Unknown era in time shift: ${target}`);
    }

    // Collision ownership follows WorldState, so movement queries use the
    // target era from the very next fixed step.
    this.worldState.setEra(target);

    fromEra.setActive(false);
    targetEra.setActive(true);
    targetEra.applyEnvironment(this.scene, this.renderer);

    this.audio.setEra(target);
    this.hud.setEra(target, targetEra.name, targetEra.description);
  }
}

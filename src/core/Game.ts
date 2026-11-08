import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {
  DEFAULT_PITCH,
  DEFAULT_YAW,
  FIXED_DT,
  MAX_FRAME_TIME,
  MAX_SUBSTEPS,
  VOID_Y,
} from '../core/constants';
import { Ambience } from '../audio/Ambience';
import { Input } from '../input/Input';
import { CausalitySystem } from '../m2/CausalitySystem';
import { createM2Content, type M2Content } from '../m2/content';
import { createStoryContent, type StoryContent } from '../m3/content';
import { STORY_SPAWN } from '../m3/layout';
import { StorySystem } from '../m3/StorySystem';
import { Player, type PlayerSpawn } from '../player/Player';
import { Physics } from '../physics/Physics';
import { TimeShift } from '../time/TimeShift';
import { Hud } from '../ui/Hud';
import { Era } from '../world/Era';
import { createEra2026 } from '../world/eras/era2026';
import { createEra2126 } from '../world/eras/era2126';
import { otherEra, type EraId } from '../world/types';
import { WorldState } from '../world/WorldState';

export interface RenderStats {
  calls: number;
  triangles: number;
  frames: number;
}

/**
 * Application shell: renderer, fixed-step loop, era pre-loading and wiring.
 * Everything is local to this process: both eras, all colliders and all lights
 * are built once at start; switches never load assets, fetch or reload.
 */
export class Game {
  readonly scene = new THREE.Scene();
  readonly worldState = new WorldState('2026');
  readonly audio = new Ambience();

  readonly renderer: THREE.WebGLRenderer;
  readonly physics: Physics;
  readonly eras: ReadonlyMap<EraId, Era>;
  readonly player: Player;
  readonly input: Input;
  readonly hud: Hud;
  readonly timeShift: TimeShift;
  readonly m2Content: M2Content;
  readonly causality: CausalitySystem;
  readonly storyContent: StoryContent;
  readonly story: StorySystem;

  private readonly spawn: PlayerSpawn = {
    position: { ...STORY_SPAWN.position },
    yaw: DEFAULT_YAW,
    pitch: DEFAULT_PITCH,
  };

  private accumulator = 0;
  private lastTimestamp = 0;
  private frameCount = 0;
  private smoothedFps = 0;
  private hudTimer = 0;
  private running = false;
  private rafId = 0;

  static async create(container: HTMLElement): Promise<Game> {
    await RAPIER.init();
    return new Game(container);
  }

  private constructor(container: HTMLElement) {
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.className = 'game-canvas';
    container.append(renderer.domElement);
    this.renderer = renderer;

    this.physics = new Physics();

    const era2026 = new Era(createEra2026(), this.physics);
    const era2126 = new Era(createEra2126(), this.physics);
    const eras = new Map<EraId, Era>([
      ['2026', era2026],
      ['2126', era2126],
    ]);
    this.eras = eras;
    this.scene.add(era2026.group, era2126.group);

    this.player = new Player(this.physics, this.spawn);
    this.player.setAspect(window.innerWidth / window.innerHeight);

    this.input = new Input(this.renderer.domElement);

    this.hud = new Hud(container, {
      onEnter: () => {
        this.audio.ensureStarted();
        this.input.requestPointerLock();
      },
    });

    this.input.setCallbacks({
      onInteraction: () => this.audio.ensureStarted(),
      onFirstInteraction: () => {
        this.audio.ensureStarted();
        this.hud.hideOverlay();
      },
      onPointerLockChange: (locked) => {
        this.hud.setPointerLocked(locked);
      },
    });

    // Activate the initial era: render, collision ownership and environment.
    const initialEra = this.eras.get(this.worldState.currentEra);
    if (!initialEra) throw new Error('Initial era is missing');
    initialEra.setActive(true);
    initialEra.applyEnvironment(this.scene, this.renderer);
    this.hud.setEra(initialEra.id, initialEra.name, initialEra.description);

    this.timeShift = new TimeShift(
      this.worldState,
      this.eras,
      this.physics,
      this.player,
      this.scene,
      this.renderer,
      this.hud,
      this.audio,
    );

    // M2 causal chain: pre-built content, then the controller that binds
    // WorldState actions to visuals and dynamic collision.
    this.scene.add(this.player.camera);
    this.m2Content = createM2Content({
      eras: this.eras,
      physics: this.physics,
      camera: this.player.camera,
    });
    this.causality = new CausalitySystem({
      worldState: this.worldState,
      player: this.player,
      timeShift: this.timeShift,
      hud: this.hud,
      content: this.m2Content,
      spawn: this.spawn,
    });
    this.physics.registerDynamicCollider(
      this.m2Content.gateCollider, '2126', () => this.causality.gateObstacleActive(), true,
    );

    // M3 mainline: gallery, story-gated barriers, subtitles and stage machine.
    this.storyContent = createStoryContent({
      eras: this.eras,
      physics: this.physics,
    });
    this.story = new StorySystem({
      worldState: this.worldState,
      player: this.player,
      physics: this.physics,
      hud: this.hud,
      content: this.storyContent,
      causality: this.causality,
    });

    window.addEventListener('resize', this.handleResize);
    this.handleResize();

    // Warm the query pipeline so the very first time-shift probe is valid.
    this.physics.step(FIXED_DT);
    this.player.afterPhysicsStep();
    this.player.syncCamera();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimestamp = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  get fps(): number {
    return this.smoothedFps;
  }

  get frames(): number {
    return this.frameCount;
  }

  renderStats(): RenderStats {
    const info = this.renderer.info.render;
    return { calls: info.calls, triangles: info.triangles, frames: this.frameCount };
  }

  private readonly handleResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);
    this.player.setAspect(width / height);
  };

  private readonly tick = (timestamp: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    if (this.lastTimestamp === 0) this.lastTimestamp = timestamp;
    let frameTime = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    if (!Number.isFinite(frameTime) || frameTime <= 0) {
      frameTime = FIXED_DT;
    }
    frameTime = Math.min(frameTime, MAX_FRAME_TIME);

    if (frameTime > 0) {
      const instantaneous = 1 / frameTime;
      this.smoothedFps = this.smoothedFps === 0
        ? instantaneous
        : this.smoothedFps * 0.9 + instantaneous * 0.1;
    }

    // Consume mouse input for every rendered frame, including frames with no
    // fixed physics step; movement uses the latest view direction below.
    this.player.updateLook(this.input);
    this.accumulator += frameTime;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
      this.fixedUpdate(FIXED_DT);
      this.accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === MAX_SUBSTEPS) {
      // Drop the backlog rather than spiralling; world state stays consistent.
      this.accumulator = 0;
    }

    this.player.syncCamera();
    this.renderer.render(this.scene, this.player.camera);
    this.frameCount += 1;

    this.hudTimer += frameTime;
    if (this.hudTimer >= 0.25) {
      this.hud.updateFps(this.smoothedFps);
      this.hudTimer = 0;
    }
  };

  private fixedUpdate(dt: number): void {
    // Deterministic order: reset, era transactions, story interactions (which
    // take priority over M2 targets), then movement. R starts the mainline over.
    while (this.input.consumeReset()) {
      this.story.resetRun();
    }

    // Queued E presses are drained in order; each request is a full transaction.
    while (this.input.consumeSwitch()) {
      this.timeShift.request(otherEra(this.worldState.currentEra));
    }

    while (this.input.consumeInteract()) {
      if (!this.story.interact()) {
        this.causality.interact();
      }
    }

    this.player.update(dt, this.input, this.worldState.currentEra);
    this.physics.step(dt);
    this.player.afterPhysicsStep();

    // M2 presentation runs first; M3 then owns the final objective/status/prompt
    // so the mainline guidance always wins on the HUD.
    this.causality.tick();
    this.story.tick();

    if (this.player.position.y < VOID_Y) {
      this.player.teleport(
        this.spawn.position.x,
        this.spawn.position.y,
        this.spawn.position.z,
        this.spawn.yaw,
        this.spawn.pitch,
      );
      this.hud.showToast('已离开可站立区域，返回画廊出生点', 'info');
    }
  }
}

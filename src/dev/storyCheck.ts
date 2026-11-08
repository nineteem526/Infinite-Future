/**
 * Deterministic M3-001 mainline regression check (no DOM, no WebGL, no browser
 * tooling). Run: npm run test:story
 *
 * Builds the real M1/M2/M3 stack, mirrors Game's fixed-step ordering and walks
 * the complete mainline: gallery paintings -> frame door -> lost district ->
 * era shift -> time workshop (M2 chain) -> archive -> terminal core -> return
 * to the gallery -> first stroke -> reset. Illegal order attempts are rejected.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { FIXED_DT, STANDING_CENTER_Y } from '../core/constants';
import type { Input } from '../input/Input';
import type { CausalityHudPort } from '../m2/CausalitySystem';
import { CausalitySystem } from '../m2/CausalitySystem';
import { createM2Content } from '../m2/content';
import type { ObjectiveView } from '../m2/types';
import { createStoryContent } from '../m3/content';
import { areaLabel, FRAME_DESTINATION, FRAME_DESTINATION_LABEL, STORY_LAYOUT, STORY_SPAWN, STORY_TARGETS } from '../m3/layout';
import { initialStory } from '../m3/story';
import { StorySystem, type StoryHudPort, type StoryPresentationSnapshot } from '../m3/StorySystem';
import type { StoryAction, StoryState } from '../m3/types';
import { Player } from '../player/Player';
import { Physics } from '../physics/Physics';
import { TimeShift, type AudioPort, type HudPort } from '../time/TimeShift';
import { objectiveEyebrowLabel } from '../ui/Hud';
import { Era } from '../world/Era';
import { createEra2026 } from '../world/eras/era2026';
import { createEra2126 } from '../world/eras/era2126';
import { otherEra, type EraId } from '../world/types';
import { WorldState } from '../world/WorldState';

class FakeInput {
  readonly keys = new Set<string>();
  readonly lookDelta = { x: 0, y: 0 };
  jumpQueued = 0;
  switchQueued = 0;
  interactQueued = 0;
  resetQueued = 0;

  consumeLook(): { x: number; y: number } {
    const delta = { x: this.lookDelta.x, y: this.lookDelta.y };
    this.lookDelta.x = 0;
    this.lookDelta.y = 0;
    return delta;
  }

  consumeJump(): boolean {
    if (this.jumpQueued <= 0) return false;
    this.jumpQueued -= 1;
    return true;
  }

  consumeSwitch(): boolean {
    if (this.switchQueued <= 0) return false;
    this.switchQueued -= 1;
    return true;
  }

  consumeInteract(): boolean {
    if (this.interactQueued <= 0) return false;
    this.interactQueued -= 1;
    return true;
  }

  consumeReset(): boolean {
    if (this.resetQueued <= 0) return false;
    this.resetQueued -= 1;
    return true;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }
}

let checks = 0;

function check(condition: boolean, message: string): void {
  checks += 1;
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

function near(actual: number, expected: number, tolerance: number, message: string): void {
  check(
    Math.abs(actual - expected) <= tolerance,
    `${message} (actual=${actual.toFixed(3)}, expected≈${expected.toFixed(3)})`,
  );
}

function storyFingerprint(state: StoryState): string {
  return JSON.stringify({
    stage: state.stage,
    paintingsViewed: state.paintingsViewed,
    galleryDoorOpen: state.galleryDoorOpen,
    shiftLearned: state.shiftLearned,
    archiveRead: state.archiveRead,
    lockdownClosed: state.lockdownClosed,
    firstStrokePainted: state.firstStrokePainted,
    revision: state.revision,
  });
}

async function run(): Promise<void> {
  await RAPIER.init();

  const scene = new THREE.Scene();
  const physics = new Physics();
  const era2026 = new Era(createEra2026(), physics);
  const era2126 = new Era(createEra2126(), physics);
  const eras = new Map<EraId, Era>([
    ['2026', era2026],
    ['2126', era2126],
  ]);
  scene.add(era2026.group, era2126.group);
  const renderer = { toneMappingExposure: 1 } as unknown as THREE.WebGLRenderer;

  const worldState = new WorldState('2026');
  const player = new Player(physics, {
    position: { ...STORY_SPAWN.position },
    yaw: STORY_SPAWN.yaw,
    pitch: STORY_SPAWN.pitch,
  });
  scene.add(player.camera);

  const fake = new FakeInput();
  const input = fake as unknown as Input;

  const hudState = {
    era: '2026' as EraId | null,
    toast: '',
    toastKind: 'info' as 'error' | 'info',
    objective: null as ObjectiveView | null,
    objectiveStatus: '',
    held: '',
    prompt: null as string | null,
    subtitle: null as string | null,
  };
  const hud: HudPort & CausalityHudPort & StoryHudPort = {
    setEra(era: EraId, _name: string, _description: string): void {
      hudState.era = era;
    },
    showToast(message: string, kind: 'error' | 'info'): void {
      hudState.toast = message;
      hudState.toastKind = kind;
    },
    setSwitchStats(_switches: number, _rejections: number): void {
      // Stats are not part of the mainline assertions.
    },
    setObjective(objective: ObjectiveView, status: string): void {
      hudState.objective = objective;
      hudState.objectiveStatus = status;
    },
    setHeld(text: string): void {
      hudState.held = text;
    },
    setInteractionPrompt(text: string | null): void {
      hudState.prompt = text;
    },
    setStorySubtitle(text: string | null): void {
      hudState.subtitle = text;
    },
  };

  const audioState = { era: '2026' as EraId | null };
  const audio: AudioPort = {
    ensureStarted(): void {
      // Audio is irrelevant to the deterministic headless check.
    },
    setEra(era: EraId): void {
      audioState.era = era;
    },
  };

  era2026.setActive(true);
  era2026.applyEnvironment(scene, renderer);
  hudState.era = '2026';

  const timeShift = new TimeShift(worldState, eras, physics, player, scene, renderer, hud, audio);

  const m2Content = createM2Content({ eras, physics, camera: player.camera });
  const causality = new CausalitySystem({
    worldState,
    player,
    timeShift,
    hud,
    content: m2Content,
    spawn: {
      position: { ...STORY_SPAWN.position },
      yaw: STORY_SPAWN.yaw,
      pitch: STORY_SPAWN.pitch,
    },
  });

  const storyContent = createStoryContent({ eras, physics });
  physics.registerDynamicCollider(
    m2Content.gateCollider, '2126', () => causality.gateObstacleActive(), true,
  );
  const story = new StorySystem({
    worldState,
    player,
    physics,
    hud,
    content: storyContent,
    causality,
  });

  // Warm broad phase/query pipeline once all static and dynamic colliders exist.
  physics.step(FIXED_DT);
  player.afterPhysicsStep();
  player.syncCamera();

  const simulate = (steps: number): void => {
    for (let index = 0; index < steps; index += 1) {
      while (fake.consumeReset()) {
        story.resetRun();
      }
      while (fake.consumeSwitch()) {
        timeShift.request(otherEra(worldState.currentEra));
      }
      while (fake.consumeInteract()) {
        if (!story.interact()) {
          causality.interact();
        }
      }
      player.update(FIXED_DT, input, worldState.currentEra);
      physics.step(FIXED_DT);
      player.afterPhysicsStep();
      causality.tick();
      story.tick();
    }
  };

  const teleport = (x: number, y: number, z: number, yaw = 0): void => {
    player.teleport(x, y, z, yaw, 0);
  };

  const interact = (): void => {
    fake.interactQueued += 1;
    simulate(2);
  };

  const switchAtSafeSpot = (target: EraId): boolean => {
    teleport(0, STANDING_CENTER_Y + 0.02, 20, 0);
    simulate(4);
    if (worldState.currentEra !== target) {
      fake.switchQueued += 1;
      simulate(4);
    }
    return worldState.currentEra === target;
  };

  const storyPresentation = (): StoryPresentationSnapshot => story.presentation();

  const initialStoryFingerprint = storyFingerprint(initialStory());

  // --- 1. initial gallery state, barriers and presentation --------------
  check(worldState.story.stage === 'gallery-intro', 'mainline starts in gallery-intro');
  check(storyFingerprint(worldState.story) === initialStoryFingerprint, 'initial story state is deterministic');
  check(worldState.story.revision === 0 && worldState.story.paintingsViewed.length === 0,
    'initial paintings/revision are zero');
  check(hudState.held.startsWith('手持：空'), 'HUD starts with empty hands');
  check(hudState.objective?.step === 1 && hudState.objective.done === false, 'HUD objective starts at mainline step 1');
  check(hudState.objective?.title.includes('观察三幅画作') === true, 'initial objective asks for the three paintings');
  check(hudState.subtitle?.includes('最后的画廊') === true, 'initial narrative subtitle introduces the gallery');
  check(hudState.objectiveStatus.includes('最后的画廊'), 'HUD status names the current area');

  let presentation = storyPresentation();
  check(presentation.galleryDoorCanvas && presentation.galleryDoorObstacle,
    'central frame is visually closed and collision-active');
  check(presentation.terminalBarrier && presentation.terminalBarrierObstacle,
    'terminal lockdown barrier starts visually and physically closed');
  check(!presentation.paintStroke && !presentation.lockdownClosed, 'blank canvas and terminal start unfinished');

  check(physics.isCapsuleObstructed('2026', { x: 0, y: 1.2, z: 24 }).blocked === true,
    'closed gallery frame blocks the doorway in target-era collision');
  check(physics.isCapsuleObstructed('2126', { x: 26, y: 1.2, z: -19 }).blocked === true,
    'closed terminal barrier is protected target-era collision');
  check(physics.isCapsuleObstructed('2026', {
    x: STORY_LAYOUT.gallerySpawn.x,
    y: STANDING_CENTER_Y,
    z: STORY_LAYOUT.gallerySpawn.z,
  }).blocked === false, 'gallery spawn is reachable in 2026');

  const count2026 = physics.countColliders('2026');
  const count2126 = physics.countColliders('2126');
  check(count2026 === 75 + m2Content.staticSolids2026 + storyContent.staticSolids2026 + 1,
    '2026 collider count includes M2/M3 static solids and the story door collider');
  check(count2126 === 56 + m2Content.staticSolids2126 + storyContent.staticSolids2126 + 2,
    '2126 collider count includes M2/M3 static solids, M2 gate and story barrier');

  teleport(STORY_LAYOUT.gallerySpawn.x, 1.2, STORY_LAYOUT.gallerySpawn.z, 0);
  simulate(180);
  check(player.grounded, 'player settles inside the gallery');
  near(player.position.y, STANDING_CENTER_Y, 0.05, 'gallery standing height');

  // --- 2. wrong-order / wrong-era interactions are rejected --------------
  teleport(0, STANDING_CENTER_Y + 0.02, 25.2, 0);
  simulate(4);
  interact();
  check(worldState.story.stage === 'gallery-intro' && worldState.story.galleryDoorOpen === false,
    'entering the frame before viewing all paintings is rejected');
  check(hudState.toast.includes('先观察三幅画'), 'frame rejection explains the missing paintings');

  check(switchAtSafeSpot('2126'), 'switch to 2126 for wrong-era painting check');
  teleport(0, STANDING_CENTER_Y + 0.02, 27.0, 0);
  simulate(4);
  interact();
  check(worldState.story.stage === 'gallery-intro' && worldState.story.paintingsViewed.length === 0,
    'paintings are not interactable in 2126');
  check(switchAtSafeSpot('2026'), 'switch back to 2026');

  // --- 3. view the three paintings -------------------------------------
  teleport(-6.0, STANDING_CENTER_Y + 0.02, 27.6, 0);
  simulate(4);
  check(story.storyPrompt()?.includes('暮色钟城广场') === true, 'west painting prompt appears');
  interact();
  check(worldState.story.paintingsViewed.length === 1, 'viewing the west painting is recorded');
  check(hudState.objective?.title.includes('1/3') === true, 'HUD objective counts 1/3 paintings');
  check(hudState.subtitle?.includes('暮色钟城广场') === true, 'painting narration is shown');

  teleport(6.0, STANDING_CENTER_Y + 0.02, 27.6, 0);
  simulate(4);
  interact();
  check(worldState.story.paintingsViewed.length === 2, 'viewing the east painting is recorded');
  check(hudState.subtitle?.includes('末日钟塔广场') === true, 'ruin painting narration is shown');

  teleport(-4.4, STANDING_CENTER_Y + 0.02, 25.1, 0);
  simulate(4);
  interact();
  check(worldState.story.paintingsViewed.length === 3, 'viewing the gallery painting is recorded');
  check(hudState.objective?.title.includes('中央画框') === true, 'objective asks to enter the frame');
  check(hudState.subtitle?.includes('光影交错的时光画廊') === true, 'gallery painting narration is shown');

  // repeated painting F is idempotent
  const paintingsRevision = worldState.story.revision;
  interact();
  check(worldState.story.revision === paintingsRevision, 'repeated painting interaction does not change state');

  // --- 4. central-frame painting teleport (deterministic) --------------
  check(physics.isCapsuleObstructed('2026', { x: 0, y: 1.2, z: 24 }).blocked === true,
    'frame doorway is still blocked before the painting teleport');
  check(story.frameDestinationSafe() === true, 'fixed frame destination starts as a supported safe landing');
  teleport(0, STANDING_CENTER_Y + 0.02, 25.4, 0);
  simulate(4);
  check(story.storyPrompt()?.includes('传送至失落的街区') === true,
    'frame prompt announces the teleport destination');

  // blocked destination: the whole transaction must abort before any state change
  let destinationBlocked = true;
  const destinationBlocker = physics.world.createCollider(
    RAPIER.ColliderDesc.cuboid(0.8, 1.1, 0.8)
      .setTranslation(FRAME_DESTINATION.x, FRAME_DESTINATION.y, FRAME_DESTINATION.z),
  );
  physics.registerDynamicCollider(destinationBlocker, '2026', () => destinationBlocked, true);
  teleport(0, STANDING_CENTER_Y + 0.02, 25.4, 0);
  simulate(4);
  check(story.frameDestinationSafe() === false, 'blocked frame destination is detected before teleporting');
  const blockedFingerprint = storyFingerprint(worldState.story);
  interact();
  check(storyFingerprint(worldState.story) === blockedFingerprint,
    'blocked frame destination leaves story state untouched');
  check(worldState.story.galleryDoorOpen === false, 'blocked frame destination keeps the gallery door closed');
  check(hudState.toast.includes('画框传送失败') && hudState.toast.includes(FRAME_DESTINATION_LABEL),
    'blocked frame teleport names the destination in feedback');
  check(player.position.z > 24, 'blocked frame teleport leaves the player inside the gallery');

  destinationBlocked = false;
  simulate(2);
  check(story.frameDestinationSafe() === true, 'cleared frame destination is safe again');
  interact();
  check(worldState.story.stage === 'district' && worldState.story.galleryDoorOpen === true,
    'frame painting interaction enters the district stage directly');
  check(worldState.story.revision === 4, 'frame teleport increments story revision exactly once');
  check(
    Math.abs(player.position.x - FRAME_DESTINATION.x) < 0.6
      && Math.abs(player.position.z - FRAME_DESTINATION.z) < 0.6,
    'frame teleport delivers the player to the fixed lost-district landing',
  );
  check(player.grounded || player.position.y <= FRAME_DESTINATION.y + 0.1,
    'frame teleport lands on supported ground');
  check(hudState.toast.includes('失落的街区') && hudState.toast.includes('2026 广场'),
    'frame teleport feedback announces the destination');
  check(hudState.subtitle?.includes('失落的街区') === true, 'frame teleport narration names the district');
  check(hudState.objective?.step === 2, 'HUD objective advances to the era-shift lesson');
  presentation = storyPresentation();
  check(!presentation.galleryDoorCanvas && !presentation.galleryDoorObstacle,
    'frame visual and collision open together with the teleport');
  check(physics.isCapsuleObstructed('2026', { x: 0, y: 1.2, z: 24 }).blocked === false,
    'opened gallery doorway is walkable for the eventual return route');
  check(physics.isCapsuleObstructed('2026', FRAME_DESTINATION).blocked === false,
    'teleport arrival position is collision-safe');

  // F at the frame again must not teleport or skip anything
  teleport(0, STANDING_CENTER_Y + 0.02, 25.4, 0);
  simulate(4);
  const repeatFrameRevision = worldState.story.revision;
  const repeatFramePosition = player.snapshot().position;
  interact();
  check(worldState.story.revision === repeatFrameRevision && worldState.story.stage === 'district',
    'repeated frame interaction cannot re-teleport or skip stages');
  check(
    Math.abs(player.position.x - repeatFramePosition.x) < 1e-6
      && Math.abs(player.position.z - repeatFramePosition.z) < 1e-6,
    'repeated frame interaction leaves the player where they are',
  );

  // restart immediately after the painting teleport
  fake.resetQueued += 1;
  simulate(2);
  check(storyFingerprint(worldState.story) === initialStoryFingerprint,
    'restart after frame teleport restores the initial story state');
  check(worldState.story.galleryDoorOpen === false && worldState.causality.revision === 0,
    'restart after frame teleport re-arms the door and M2 chain');
  near(player.position.z, STORY_LAYOUT.gallerySpawn.z, 0.5,
    'restart after frame teleport returns the player to the gallery');

  // redo the prologue to continue the mainline after testing restart
  teleport(-6.0, STANDING_CENTER_Y + 0.02, 27.6, 0);
  simulate(4);
  interact();
  teleport(6.0, STANDING_CENTER_Y + 0.02, 27.6, 0);
  simulate(4);
  interact();
  teleport(-4.4, STANDING_CENTER_Y + 0.02, 25.1, 0);
  simulate(4);
  interact();
  teleport(0, STANDING_CENTER_Y + 0.02, 25.4, 0);
  simulate(4);
  interact();
  check(worldState.story.stage === 'district' && worldState.story.revision === 4,
    'redoing the paintings and frame teleport reaches the district again');
  check(
    Math.abs(player.position.x - FRAME_DESTINATION.x) < 0.6
      && Math.abs(player.position.z - FRAME_DESTINATION.z) < 0.6,
    'second frame teleport returns to the same fixed landing',
  );

  // --- 5. learn E time shift (continuous-motion rule unchanged) ---------
  simulate(30);
  const preShiftPose = player.snapshot();
  fake.switchQueued += 1;
  simulate(2);
  check(worldState.currentEra === '2126', 'era switch during the lesson succeeds');
  check(
    Math.abs(preShiftPose.position.x - player.snapshot().position.x) < 1e-4
      && Math.abs(preShiftPose.position.y - player.snapshot().position.y) < 1e-4
      && Math.abs(preShiftPose.position.z - player.snapshot().position.z) < 1e-4
      && Math.abs(preShiftPose.velocity.y - player.snapshot().velocity.y) < 1e-4,
    'E time shift still preserves continuous position/velocity after the painting teleport',
  );
  check(worldState.story.stage === 'workshop' && worldState.story.shiftLearned === true,
    'first successful shift in the district advances to the time workshop');
  check(hudState.objective?.step === 3, 'HUD objective advances to the workshop chain');
  check(hudState.subtitle?.includes('时间工坊') === true, 'workshop narration is shown');

  // --- 6. M2 chain: crystal -> generator -> past device -> passage -----
  teleport(6, STANDING_CENTER_Y + 0.02, 2.2, 0);
  simulate(4);
  check(hudState.objective?.title.includes('2126 取得能源晶体') === true, 'workshop objective asks for the crystal');
  interact();
  check(worldState.causality.crystal.kind === 'inventory', 'crystal picked up inside the workshop chain');
  check(worldState.story.stage === 'workshop', 'pickup does not skip mainline stages');

  check(switchAtSafeSpot('2026'), 'carry the crystal to 2026');
  teleport(10, STANDING_CENTER_Y + 0.02, 2.2, 0);
  simulate(4);
  interact();
  check(worldState.causality.generatorEnergized === true, 'generator energizes with the crystal');
  check(hudState.objective?.title.includes('过去机械装置') === true, 'objective moves to the past device');

  teleport(-10, STANDING_CENTER_Y + 0.02, 1.8, 0);
  simulate(4);
  interact();
  check(worldState.causality.pastDeviceActivated === true && worldState.causality.futureGateOpen === true,
    'past device activates and opens the 2126 passage');
  check(hudState.objective?.title.includes('通道') === true, 'objective moves to the opened passage');

  check(switchAtSafeSpot('2126'), 'return to 2126 for the passage');
  teleport(-16, STANDING_CENTER_Y + 0.02, 0, Math.PI / 2);
  simulate(6);
  fake.keys.add('KeyW');
  simulate(150);
  fake.keys.delete('KeyW');
  check(worldState.causality.chamberVisited === true, 'player physically walks the opened 2126 passage');
  check(worldState.story.stage === 'archive', 'reaching the passage end unlocks the archive stage');
  check(hudState.objective?.step === 4, 'HUD objective advances to the archive');
  check(hudState.subtitle?.includes('档案碑') === true, 'archive arrival narration is shown');

  // --- 7. archive reveal ------------------------------------------------
  teleport(-19.0, STANDING_CENTER_Y + 0.02, 0.3, 0);
  simulate(4);
  check(story.storyPrompt()?.includes('读取时序档案') === true, 'archive prompt appears');
  const archiveRevision = worldState.story.revision;
  interact();
  check(worldState.story.archiveRead === true && worldState.story.stage === 'terminal',
    'reading the archive advances to the terminal core');
  check(worldState.story.revision === archiveRevision + 1, 'archive read increments story revision once');
  check(hudState.subtitle?.includes('你曾把未来的技术带回 2026') === true,
    'archive reveals the player helped maintain the terminal canvas');
  check(hudState.objective?.step === 5, 'HUD objective advances to the terminal core');
  presentation = storyPresentation();
  check(!presentation.terminalBarrier && !presentation.terminalBarrierObstacle,
    'reading the archive opens the terminal barrier visually and for collision');
  check(physics.isCapsuleObstructed('2126', { x: 26, y: 1.2, z: -19 }).blocked === false,
    'opened terminal barrier no longer blocks target-era collision');

  // --- 8. close the time lockdown at the terminal core ------------------
  teleport(26, STANDING_CENTER_Y + 0.02, -20.4, 0);
  simulate(4);
  check(story.storyPrompt()?.includes('关闭时间封锁') === true, 'terminal core prompt appears');
  const lockdownRevision = worldState.story.revision;
  interact();
  check(worldState.story.lockdownClosed === true && worldState.story.stage === 'return-gallery',
    'closing the lockdown returns the mainline to the gallery objective');
  check(worldState.story.revision === lockdownRevision + 1, 'lockdown close increments story revision once');
  check(hudState.subtitle?.includes('时间封锁关闭') === true, 'lockdown narration is shown');
  check(hudState.objective?.step === 6 && hudState.objective?.title.includes('空白画布') === true,
    'objective asks to return to the blank canvas');
  presentation = storyPresentation();
  check(presentation.lockdownClosed === true && presentation.coreEmissive === '#4f7f9a',
    'terminal canvas visual changes when the lockdown closes');
  const closedRevision = worldState.story.revision;
  interact();
  check(worldState.story.revision === closedRevision, 'repeated core interaction does not change state');

  // --- 9. return to the gallery via the existing route and paint --------
  check(switchAtSafeSpot('2026'), 'return to 2026 after closing the lockdown');
  check(physics.isCapsuleObstructed('2026', { x: 0, y: 1.2, z: 24 }).blocked === false,
    'gallery doorway remains walkable after the core sequence');
  teleport(0, STANDING_CENTER_Y + 0.02, 22.0, Math.PI);
  simulate(6);
  fake.keys.add('KeyW');
  simulate(140);
  fake.keys.delete('KeyW');
  check(player.position.z > 24.6, 'player walks through the existing gallery doorway on the return route');
  check(player.position.z < 30.9, 'player stays inside the gallery after the return walk');
  check(hudState.objectiveStatus.includes('画廊'),
    'HUD area status recognises the gallery on return');
  check(story.facesBlankCanvas() === true, 'player walking in with the canvas in view is facing it');
  check(story.storyPrompt()?.includes('第一笔颜色') === true, 'paint prompt appears while facing the canvas');

  // Bug scenario: standing at the canvas but looking back toward the door.
  teleport(0, STANDING_CENTER_Y + 0.02, 29.5, 0);
  simulate(4);
  check(story.facesBlankCanvas() === false, 'back-facing the blank canvas is detected');
  check(story.storyPrompt()?.includes('面向中央空白画布') === true,
    'back-facing the canvas gives natural turn-around guidance');
  check(story.storyPrompt()?.includes('第一笔颜色') === false,
    'back-facing the canvas does not offer the paint prompt');
  const backRejectedRevision = worldState.story.revision;
  interact();
  check(worldState.story.stage === 'return-gallery' && worldState.story.firstStrokePainted === false,
    'back-facing F is rejected and does not finish the ending');
  check(worldState.story.revision === backRejectedRevision,
    'back-facing F leaves story state unchanged');
  check(hudState.toast.includes('面向中央空白画布'), 'back-facing F gives natural turn-around guidance');
  check(storyPresentation().paintStroke === false, 'back-facing F leaves the blank canvas untouched');

  // Side-facing is also rejected (view perpendicular to the canvas).
  teleport(0, STANDING_CENTER_Y + 0.02, 29.5, Math.PI / 2);
  simulate(4);
  check(story.facesBlankCanvas() === false, 'side-facing the blank canvas is detected');
  check(story.storyPrompt()?.includes('面向中央空白画布') === true,
    'side-facing the canvas gives natural guidance');
  interact();
  check(worldState.story.stage === 'return-gallery' && worldState.story.firstStrokePainted === false,
    'side-facing F does not finish the ending');
  check(worldState.story.revision === backRejectedRevision,
    'side-facing F leaves story state unchanged');

  // The orientation gate is scoped to the ending canvas only. Archive/core
  // interactions earlier succeeded with unrelated view directions.
  check(story.facesBlankCanvas() === false && worldState.story.stage === 'return-gallery',
    'orientation gate is limited to the blank-canvas ending interaction');

  // Correct facing accepts the ending interaction.
  teleport(0, STANDING_CENTER_Y + 0.02, 29.5, Math.PI);
  simulate(4);
  check(story.facesBlankCanvas() === true, 'correctly facing the blank canvas is accepted');
  check(story.storyPrompt()?.includes('第一笔颜色') === true,
    'paint prompt appears once the player faces the canvas');
  const endingRevision = worldState.story.revision;
  interact();
  check(worldState.story.stage === 'complete' && worldState.story.firstStrokePainted === true,
    'painting the first stroke completes the mainline');
  check(worldState.story.revision === endingRevision + 1, 'ending increments story revision once');
  check(hudState.objective?.done === true && hudState.objective?.title.includes('The future is not written') === true,
    'HUD objective reports mainline completion');
  check(objectiveEyebrowLabel(story.objectiveView()) === '主线完成',
    'ending HUD eyebrow uses 主线完成');
  check(!objectiveEyebrowLabel(story.objectiveView()).includes('因果链完成'),
    'ending HUD eyebrow no longer says 因果链完成');
  check(hudState.subtitle?.includes('THE FUTURE IS NOT WRITTEN') === true, 'ending subtitle is shown');
  presentation = storyPresentation();
  check(presentation.paintStroke === true, 'first brushstroke becomes visible on the blank canvas');
  check(story.storyPrompt()?.includes('已经留下') === true, 'completed canvas prompt reports the stroke');

  const completeRevision = worldState.story.revision;
  interact();
  check(worldState.story.revision === completeRevision, 'repeated canvas interaction after ending is idempotent');
  check(worldState.causality.crystal.kind === 'socket', 'unique crystal remains in the generator at the ending');

  // --- 10. reset restores the full initial mainline state ---------------
  fake.resetQueued += 1;
  simulate(2);
  check(storyFingerprint(worldState.story) === initialStoryFingerprint,
    'reset restores the exact initial story state');
  check(worldState.causality.revision === 0 && worldState.causality.crystal.kind === 'world',
    'reset restores the M2 causal chain and unique crystal');
  check(worldState.currentEra === '2026', 'reset returns to 2026');
  near(player.position.x, 0, 0.5, 'reset returns the player to the gallery spawn X');
  near(player.position.z, STORY_LAYOUT.gallerySpawn.z, 0.5, 'reset returns the player to the gallery spawn Z');
  check(hudState.objective?.step === 1 && hudState.objective.done === false, 'reset restores HUD objective step 1');
  check(objectiveEyebrowLabel(story.objectiveView()) === '目标 1 / 6',
    'reset restores the HUD eyebrow to target step 1 / 6');
  check(hudState.subtitle?.includes('最后的画廊') === true, 'reset restores intro narration');
  presentation = storyPresentation();
  check(presentation.galleryDoorCanvas && presentation.galleryDoorObstacle
    && presentation.terminalBarrier && presentation.terminalBarrierObstacle
    && !presentation.paintStroke && !presentation.lockdownClosed,
    'reset closes both story barriers and clears ending visuals');
  check(physics.isCapsuleObstructed('2026', { x: 0, y: 1.2, z: 24 }).blocked === true,
    'reset re-arms the gallery frame collision');
  check(physics.isCapsuleObstructed('2126', { x: 26, y: 1.2, z: -19 }).blocked === true,
    'reset re-arms the terminal barrier collision');

  fake.resetQueued += 1;
  simulate(2);
  check(storyFingerprint(worldState.story) === initialStoryFingerprint, 'repeated reset is idempotent');

  // --- 11. illegal stage transitions cannot skip the mainline -----------
  const rejectedActions: StoryAction[] = [
    { type: 'read-archive' },
    { type: 'close-lockdown' },
    { type: 'paint-first-stroke' },
    { type: 'enter-frame' },
  ];
  for (const action of rejectedActions) {
    const outcome = worldState.applyStoryAction(action, '2026');
    check(outcome.changed === false, `out-of-order story action ${action.type} is rejected`);
  }
  check(storyFingerprint(worldState.story) === initialStoryFingerprint,
    'rejected story actions leave the initial state unchanged');
  const wrongEra = worldState.applyStoryAction({ type: 'view-painting', painting: 'painting-2026' }, '2126');
  check(wrongEra.changed === false, 'painting action is rejected in the wrong era');
  const wrongEraFrame = worldState.applyStoryAction({ type: 'enter-frame' }, '2126');
  check(wrongEraFrame.changed === false, 'frame teleport action is rejected in the wrong era');
  check(story.frameDestinationSafe() === true, 'frame destination remains safe after reset');

  // --- 12. item uniqueness preserved through story transitions ----------
  check(switchAtSafeSpot('2126'), 'switch to 2126 after reset for item check');
  teleport(6, STANDING_CENTER_Y + 0.02, 2.2, 0);
  simulate(4);
  interact();
  check(worldState.causality.crystal.kind === 'inventory', 'crystal can be picked up after mainline reset');
  teleport(0, STANDING_CENTER_Y + 0.02, 20, 0);
  simulate(4);
  fake.switchQueued += 100;
  simulate(20);
  check(worldState.causality.crystal.kind === 'inventory', '100 story-aware switches keep the single held crystal');
  check(worldState.causality.revision === 1, '100 switches do not duplicate item state');
  check(story.presentation().galleryDoorCanvas === true, 'story visuals remain consistent during switch burst');

  // --- 13. M1/M2 regression in the M3 stack -----------------------------
  fake.resetQueued += 1;
  simulate(2);
  teleport(0, 1.2, 20, 0);
  simulate(180);
  check(player.grounded, 'M1 regression: player still settles on the ground');
  const poseBefore = player.snapshot();
  fake.switchQueued += 1;
  simulate(1);
  check(worldState.currentEra === '2126', 'M1 regression: safe switch still succeeds with M3 content');
  const poseAfter = player.snapshot();
  check(
    Math.abs(poseBefore.position.x - poseAfter.position.x) < 1e-4
      && Math.abs(poseBefore.position.y - poseAfter.position.y) < 1e-4
      && Math.abs(poseBefore.position.z - poseAfter.position.z) < 1e-4,
    'M1 regression: switch preserves position with M3 content present',
  );
  check(
    Math.abs(poseBefore.yaw - poseAfter.yaw) < 1e-9 && Math.abs(poseBefore.pitch - poseAfter.pitch) < 1e-9,
    'M1 regression: switch preserves view direction',
  );
  teleport(0, STANDING_CENTER_Y + 0.02, 6, 0);
  simulate(4);
  const rejectionBefore = timeShift.rejectionCount;
  fake.switchQueued += 1;
  simulate(4);
  check(worldState.currentEra === '2026', 'M1/M2 regression: blocked switch still keeps the source era');
  check(timeShift.rejectionCount >= rejectionBefore, 'M1/M2 regression: blocked switch reports consistent feedback');

  // --- summary ----------------------------------------------------------
  console.log('');
  console.log(`M3 STORY CHECK RESULT: ${checks} checks passed`);
  console.log('story stages: gallery-intro -> district -> workshop -> archive -> terminal -> return-gallery -> complete');
  console.log(`gallery spawn: (${STORY_SPAWN.position.x}, ~0.92, ${STORY_SPAWN.position.z})`);
  console.log(`frame teleport destination: (${FRAME_DESTINATION.x}, ${FRAME_DESTINATION.y}, ${FRAME_DESTINATION.z}) ${FRAME_DESTINATION_LABEL}`);
  console.log(`story targets: ${STORY_TARGETS.length}`);
  console.log(`M3 static colliders: 2026=${storyContent.staticSolids2026}, 2126=${storyContent.staticSolids2126}`);
  console.log(`gallery area label at spawn: ${areaLabel('2026', player.position)}`);
  console.log('browser tips: R restarts the mainline; ?test=1 exposes __M3_TEST__ (and __M2_TEST__/__M1_TEST__ aliases).');
}

await run();

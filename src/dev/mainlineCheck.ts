/**
 * M3-007 normal-route regression for the re-planned gallery/street/core path.
 * Run: npm run test:story
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
import { FRAME_DESTINATION, GALLERY, STORY_TARGETS, STREET } from '../m3/layout';
import { initialStory } from '../m3/story';
import { StorySystem, type StoryHudPort } from '../m3/StorySystem';
import type { StoryState } from '../m3/types';
import { galleryFrameOuterForCanvas, GALLERY_FRAME_OPENING } from '../m2/galleryFrameGeometry';
import { Player } from '../player/Player';
import { Physics } from '../physics/Physics';
import { TimeShift, type AudioPort, type HudPort } from '../time/TimeShift';
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
    const delta = { ...this.lookDelta };
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
  check(Math.abs(actual - expected) <= tolerance, `${message} (${actual.toFixed(3)} ≈ ${expected.toFixed(3)})`);
}
function fingerprint(state: StoryState): string {
  return JSON.stringify(state);
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
    position: { ...GALLERY.spawn },
    yaw: 0,
    pitch: 0,
  });
  scene.add(player.camera);
  const fake = new FakeInput();
  const input = fake as unknown as Input;

  const hudState = {
    era: '2026' as EraId | null,
    toast: '',
    objective: null as ObjectiveView | null,
    status: '',
    held: '',
    prompt: null as string | null,
    subtitle: null as string | null,
  };
  const hud: HudPort & CausalityHudPort & StoryHudPort = {
    setEra(era: EraId, _name: string, _description: string): void {
      hudState.era = era;
    },
    showToast(message: string, _kind: 'error' | 'info'): void {
      hudState.toast = message;
    },
    setSwitchStats(_switches: number, _rejections: number): void {},
    setObjective(objective: ObjectiveView, status: string): void {
      hudState.objective = objective;
      hudState.status = status;
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
    ensureStarted(): void {},
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
    spawn: { position: { ...GALLERY.spawn }, yaw: 0, pitch: 0 },
  });
  physics.registerDynamicCollider(
    m2Content.gateCollider, '2126', () => causality.gateObstacleActive(), true,
  );
  const storyContent = createStoryContent({ eras, physics });
  const story = new StorySystem({
    worldState,
    player,
    physics,
    hud,
    content: storyContent,
    causality,
  });

  physics.step(FIXED_DT);
  player.afterPhysicsStep();
  player.syncCamera();

  const simulate = (steps: number): void => {
    for (let i = 0; i < steps; i += 1) {
      while (fake.consumeReset()) story.resetRun();
      while (fake.consumeSwitch()) {
        if (!story.canSwitchEra()) {
          story.rejectEraSwitch();
          continue;
        }
        const airborne = !player.grounded;
        const outcome = timeShift.request(otherEra(worldState.currentEra));
        if (outcome.ok) story.notifyEraSwitch(outcome, airborne);
      }
      while (fake.consumeInteract()) {
        if (!story.interact()) causality.interact();
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
  const initialState = fingerprint(initialStory());

  // --- 1. gallery: large, exactly three frames, painting teleport ----------
  check(worldState.story.stage === 'gallery-intro', 'mainline starts in the new gallery');
  check(fingerprint(worldState.story) === initialState, 'initial story state is deterministic');
  near(player.position.x, GALLERY.spawn.x, 0.1, 'player spawns inside the large gallery X');
  near(player.position.z, GALLERY.spawn.z, 0.1, 'player spawns inside the large gallery Z');
  check(hudState.objective?.step === 1 && hudState.objective.title.includes('选一幅画') === true,
    'short prologue objective asks for a painting');
  check(hudState.subtitle?.includes('左边是过去') === true, 'gallery intro names past/future/blank canvas');
  const frameTargets = STORY_TARGETS.filter((target) => target.id === 'painting-2026'
    || target.id === 'painting-2126' || target.id === 'blank-canvas');
  check(frameTargets.length === 3, 'gallery exposes exactly three frames (past, future, blank canvas)');
  check(STORY_TARGETS.some((t) => t.id === 'blank-canvas'), 'central blank canvas exists for the ending');
  check(frameTargets.length === STORY_TARGETS.filter((t) => t.id !== 'time-device'
    && t.id !== 'archive-record' && t.id !== 'terminal-core').length,
    'no fourth gallery painting exists');

  // ART-002 true-opening fit (not an outer-bbox-only assertion).
  const centralFrame = galleryFrameOuterForCanvas(
    GALLERY.blankCanvasSize.width,
    GALLERY.blankCanvasSize.height,
    GALLERY.blankCanvasOpeningMargin,
  );
  check(centralFrame.openingWidth > GALLERY.blankCanvasSize.width
    && centralFrame.openingHeight > GALLERY.blankCanvasSize.height,
    'central blank canvas fits the measured ART-002 opening with margin');
  check(centralFrame.outerWidth < 18 && centralFrame.outerHeight < GALLERY.height,
    'central frame stays within the gallery wall/ceiling');
  const centralFrameBottom = GALLERY.blankCanvas.y - 0.5 * centralFrame.outerHeight
    - centralFrame.openingCenterYOffset;
  const centralFrameTop = GALLERY.blankCanvas.y + 0.5 * centralFrame.outerHeight
    - centralFrame.openingCenterYOffset;
  check(centralFrameBottom > 0 && centralFrameTop < GALLERY.height,
    'central frame keeps its true-opening centre on the canvas without hitting floor/ceiling');
  const sideFrame = galleryFrameOuterForCanvas(3.4, 2.2, 0.8);
  check(sideFrame.openingWidth > 3.4 && sideFrame.openingHeight > 2.2,
    'side paintings fit the measured ART-002 opening with margin');
  check(GALLERY_FRAME_OPENING.widthRatio < 1 && GALLERY_FRAME_OPENING.heightRatio < 1,
    'frame fit uses the measured opening ratios, not the outer bbox');
  check(story.frameDestinationSafe(), 'street teleport landing is safe');
  check(physics.isCapsuleObstructed('2026', { x: 48.5, y: 1.2, z: 22 }).blocked === false,
    'past painting approach is clear of columns');
  check(physics.isCapsuleObstructed('2026', { x: 57.5, y: 1.2, z: 22 }).blocked === false,
    'future painting approach is clear of columns');
  check(physics.isCapsuleObstructed('2026', { x: 47, y: 1.2, z: 22 }).blocked === false,
    'removed central column no longer blocks the paintings');
  check(physics.isCapsuleObstructed('2026', { x: 53, y: 1.2, z: 14 }).blocked === false,
    'gallery street entrance is walkable');
  check(physics.isCapsuleObstructed('2026', { x: 52, y: 1.2, z: 11.8 }).blocked === false,
    'street landing area is walkable');
  check(physics.isCapsuleObstructed('2026', { x: 32, y: 1.2, z: 11 }).blocked === false,
    'street-to-core gateway is walkable');
  check(physics.isCapsuleObstructed('2026', { x: 20, y: 1.2, z: 8 }).blocked === false,
    'city core approach is walkable');

  // past painting teleport
  teleport(46.4, STANDING_CENTER_Y + 0.02, 22, 0);
  simulate(4);
  check(hudState.prompt?.includes('穿过画框') === true, 'past painting prompt appears');
  interact();
  check(worldState.story.stage === 'street', 'past painting teleports to the street');
  check(worldState.story.revision === 1, 'painting teleport increments story revision once');
  near(player.position.x, FRAME_DESTINATION.x, 0.6, 'street arrival X matches fixed destination');
  near(player.position.z, FRAME_DESTINATION.z, 0.6, 'street arrival Z matches fixed destination');
  check(hudState.subtitle?.includes('街道') === true, 'street arrival feedback is shown');
  check(hudState.objective?.step === 2, 'HUD objective advances to the street');
  check(hudState.prompt?.includes('折时仪') === true,
    'time-folding device is visible/interactable right after street arrival');
  check(story.storyPrompt() === null || !story.storyPrompt()?.includes('穿过画框'),
    'repeated painting interaction is no longer offered after teleport');

  // future painting teleport also works
  fake.resetQueued += 1;
  simulate(2);
  check(fingerprint(worldState.story) === initialState, 'reset restores gallery intro');
  teleport(59.6, STANDING_CENTER_Y + 0.02, 22, 0);
  simulate(4);
  check(hudState.prompt?.includes('穿过画框') === true, 'future painting prompt appears');
  interact();
  check(worldState.story.stage === 'street', 'future painting also teleports to the street');
  near(player.position.x, FRAME_DESTINATION.x, 0.6, 'future painting uses the same street landing');

  // blank canvas is not a prologue entrance
  fake.resetQueued += 1;
  simulate(2);
  teleport(53, STANDING_CENTER_Y + 0.02, 27.6, Math.PI);
  simulate(4);
  const blankRevision = worldState.story.revision;
  interact();
  check(worldState.story.stage === 'gallery-intro' && worldState.story.revision === blankRevision,
    'central blank canvas does not teleport in the prologue');
  check(hudState.toast.includes('空白画布'), 'blank canvas gives a brief hint before the ending');

  // --- 2. street device gate, then E continuity, then core puzzle ---------
  teleport(46.4, STANDING_CENTER_Y + 0.02, 22, 0);
  simulate(4);
  interact();
  check(worldState.story.stage === 'street', 'enter street for the mainline test');
  const switchCountBefore = timeShift.switchCount;
  fake.switchQueued += 1;
  simulate(2);
  check(timeShift.switchCount === switchCountBefore && worldState.currentEra === '2026',
    'E is locked on the street until the time-folding device is obtained');
  check(hudState.toast.includes('折时仪'), 'locked E explains the missing device');

  teleport(STREET.timeDevice.x + 1.6, STANDING_CENTER_Y + 0.02, STREET.timeDevice.z, 0);
  simulate(4);
  check(hudState.prompt?.includes('折时仪') === true, 'street device prompt appears');
  interact();
  check(worldState.story.stage === 'bridge' && worldState.story.timeDeviceAcquired,
    'device pickup enters the street bridge challenge');
  check(hudState.objective?.title.includes('按 E 接住桥面') === true,
    'HUD objective asks for the airborne bridge jump');

  // E is available again after the device; continuity is unchanged.
  check(switchAtSafeSpot('2126'), 'E works after device pickup');
  check(switchAtSafeSpot('2026'), 'return to 2026 for the bridge jump');

  check(physics.isCapsuleObstructed('2126', { x: 46, y: 1.2, z: 11 }).blocked === true,
    'future bridge access wall is protected collision');
  check(physics.isCapsuleObstructed('2026', { x: 39.5, y: 1.2, z: 11 }).blocked === true,
    '2026 corridor entrance is blocked by rubble');
  check(physics.isCapsuleObstructed('2126', { x: 39.5, y: 1.2, z: 11 }).blocked === false,
    '2126 corridor entrance is open');

  // Failed jump: nearby recovery, story/crystal untouched.
  teleport(47, 1.52, 11, Math.PI / 2);
  simulate(6);
  check(player.grounded, 'player stands on the 2026 launch platform');
  const failureRevision = worldState.story.revision;
  fake.jumpQueued += 1;
  fake.keys.add('KeyW');
  simulate(130);
  fake.keys.delete('KeyW');
  simulate(10);
  check(worldState.story.stage === 'bridge' && worldState.story.revision === failureRevision,
    'failed bridge jump keeps story state');
  check(hudState.toast.includes('跌落'), 'failed bridge jump gives nearby-retry feedback');
  near(player.position.x, STREET.bridge.retryX, 1.2, 'failed jump returns near the bridge');

  // Airborne E: jump west, switch over the gap, land on the 2126 bridge.
  teleport(47, 1.52, 11, Math.PI / 2);
  simulate(6);
  fake.jumpQueued += 1;
  fake.keys.add('KeyW');
  simulate(40);
  fake.switchQueued += 1;
  simulate(1);
  check(worldState.currentEra === '2126', 'mid-air E switches to 2126 over the street gap');
  check(worldState.story.airborneShiftUsed === true, 'mid-air switch is recorded by the bridge');
  fake.keys.delete('KeyW');
  simulate(120);
  check(player.grounded && player.position.y > 1.3, 'player lands on the 2126 bridge deck');
  fake.keys.add('KeyW');
  simulate(90);
  fake.keys.delete('KeyW');
  check(worldState.story.stage === 'corridor', 'crossing the 2126 bridge opens the corridor stage');
  check(hudState.objective?.title.includes('绕行坍塌走廊') === true,
    'HUD objective asks to bypass the collapsed corridor');

  // Past-complete/future-collapsed corridor: switch detour required.
  teleport(39.5, STANDING_CENTER_Y + 0.02, 11, Math.PI / 2);
  simulate(4);
  check(worldState.currentEra === '2126', 'inside the corridor in 2126');
  fake.keys.add('KeyW');
  simulate(70);
  fake.keys.delete('KeyW');
  check(player.position.x > 37.0, 'collapsed 2126 corridor blocks the direct route');
  check(worldState.story.stage === 'corridor', 'blocked corridor does not advance the stage');
  fake.switchQueued += 1;
  simulate(2);
  check(worldState.currentEra === '2026', 'switching to the intact 2026 corridor succeeds');
  fake.keys.add('KeyW');
  simulate(70);
  fake.keys.delete('KeyW');
  check(player.position.x > 34.2, '2026 exit rubble still blocks the far end');
  fake.switchQueued += 1;
  simulate(2);
  check(worldState.currentEra === '2126', 'switching back at the exit succeeds');
  fake.keys.add('KeyW');
  simulate(60);
  fake.keys.delete('KeyW');
  check(worldState.story.stage === 'workshop', 'bypassing the collapse advances to the core/workshop');
  check(hudState.objective?.step === 3, 'HUD objective advances to the workshop');
  check(worldState.story.revision === 5, 'two street challenges increment story revision in order');

  // --- 3. existing core puzzle chain --------------------------------------
  teleport(6, STANDING_CENTER_Y + 0.02, 2.2, 0);
  simulate(4);
  interact();
  check(worldState.causality.crystal.kind === 'inventory', 'crystal pickup works from the new street route');
  check(switchAtSafeSpot('2026'), 'carry crystal back to 2026');

  teleport(10, STANDING_CENTER_Y + 0.02, 2.2, 0);
  simulate(4);
  interact();
  check(worldState.causality.generatorEnergized, 'generator accepts the crystal');

  teleport(-10, STANDING_CENTER_Y + 0.02, 1.8, 0);
  simulate(4);
  interact();
  check(worldState.causality.futureGateOpen, 'past device opens the west passage');

  check(switchAtSafeSpot('2126'), 'return to 2126 for the archive');
  teleport(-16, STANDING_CENTER_Y + 0.02, 0, Math.PI / 2);
  simulate(6);
  fake.keys.add('KeyW');
  simulate(150);
  fake.keys.delete('KeyW');
  check(worldState.causality.chamberVisited, 'player walks the opened west passage');
  check(worldState.story.stage === 'archive', 'reaching the passage end advances to the archive');
  check(hudState.objective?.step === 4, 'HUD objective advances to the archive');

  teleport(-19.0, STANDING_CENTER_Y + 0.02, 0.3, 0);
  simulate(4);
  interact();
  check(worldState.story.archiveRead && worldState.story.stage === 'terminal',
    'reading the archive advances to the terminal core');
  check(story.presentation().coreEmissive === '#5a3f9a', 'terminal core wakes after the archive');

  teleport(26, STANDING_CENTER_Y + 0.02, -20.4, 0);
  simulate(4);
  interact();
  check(worldState.story.lockdownClosed && worldState.story.stage === 'return-gallery',
    'closing the lockdown returns the mainline to the gallery');
  check(story.presentation().lockdownClosed, 'terminal visual commits the closed lockdown');

  // --- 4. return to gallery, face the blank canvas, finish ----------------
  check(switchAtSafeSpot('2026'), 'return to 2026 for the ending');
  teleport(53, STANDING_CENTER_Y + 0.02, 11.8, Math.PI);
  simulate(6);
  fake.keys.add('KeyW');
  simulate(70);
  fake.keys.delete('KeyW');
  check(player.position.z > 14.4, 'player walks from the street through the gallery entrance');
  teleport(GALLERY.blankCanvas.x, STANDING_CENTER_Y + 0.02, GALLERY.blankCanvas.z - 1.4, Math.PI);
  simulate(4);
  check(story.facesBlankCanvas(), 'player faces the central blank canvas');
  const endingRevision = worldState.story.revision;
  interact();
  check(worldState.story.stage === 'complete' && worldState.story.firstStrokePainted,
    'central blank canvas finishes the mainline');
  check(worldState.story.revision === endingRevision + 1, 'ending increments revision once');
  check(hudState.objective?.done === true && hudState.objective.title.includes('The future is not written'),
    'HUD reports mainline completion');
  check(story.presentation().paintStroke, 'first brushstroke becomes visible');

  // --- 5. reset and M1/M2 regression --------------------------------------
  fake.resetQueued += 1;
  simulate(2);
  check(fingerprint(worldState.story) === initialState, 'reset restores the initial gallery story state');
  check(worldState.causality.revision === 0 && worldState.causality.crystal.kind === 'world',
    'reset restores the unique crystal chain');
  check(worldState.currentEra === '2026', 'reset returns to 2026');
  near(player.position.x, GALLERY.spawn.x, 0.5, 'reset returns the player to the gallery X');
  near(player.position.z, GALLERY.spawn.z, 0.5, 'reset returns the player to the gallery Z');

  teleport(0, 1.2, 20, 0);
  simulate(180);
  check(player.grounded, 'M1 regression: player settles on the ground');
  const poseBefore = player.snapshot();
  fake.switchQueued += 1;
  simulate(1);
  check(worldState.currentEra === '2126', 'M1 regression: safe switch still succeeds');
  check(
    Math.abs(poseBefore.position.x - player.snapshot().position.x) < 1e-4
      && Math.abs(poseBefore.position.z - player.snapshot().position.z) < 1e-4,
    'M1 regression: switch preserves position with the new layout',
  );

  // --- summary ------------------------------------------------------------
  console.log('');
  console.log(`M3 STORY CHECK RESULT: ${checks} checks passed`);
  console.log(`gallery: ${GALLERY.minX}..${GALLERY.maxX} x ${GALLERY.minZ}..${GALLERY.maxZ}, height ${GALLERY.height}`);
  console.log(`street teleport: (${FRAME_DESTINATION.x}, ${FRAME_DESTINATION.y}, ${FRAME_DESTINATION.z})`);
  console.log(`story targets: ${STORY_TARGETS.length}; frames: 3`);
  console.log('route: gallery painting -> street -> city core -> workshop -> archive -> terminal -> gallery ending');
}

await run();

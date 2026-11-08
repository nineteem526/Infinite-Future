import { resolveInteractionTarget } from '../m2/interaction';
/**
 * Deterministic M2-001 regression check (no DOM, no WebGL, no browser tooling).
 *
 * Run: npm run test:causality
 *
 * It builds the real M1 stack (Rapier world, eras, player, TimeShift) plus the
 * real M2 content/controller, mirrors the game's fixed-step update order and
 * asserts item uniqueness, interaction legality, collision/visual sync, item
 * preservation across switches/rejections and reset behaviour.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { FIXED_DT, STANDING_CENTER_Y } from '../core/constants';
import type { Input } from '../input/Input';
import { CausalitySystem, type CausalityHudPort } from '../m2/CausalitySystem';
import { initialCausality, objectiveView } from '../m2/causality';
import { createM2Content } from '../m2/content';
import { M2_LAYOUT } from '../m2/layout';
import {
  CRYSTAL_ITEM_ID,
  type CausalityState,
  type InteractionOutcome,
  type ObjectiveView,
} from '../m2/types';
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
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`PASS: ${message}`);
}

function near(actual: number, expected: number, tolerance: number, message: string): void {
  check(
    Math.abs(actual - expected) <= tolerance,
    `${message} (actual=${actual.toFixed(3)}, expected≈${expected.toFixed(3)})`,
  );
}

function fingerprint(state: CausalityState): string {
  return JSON.stringify({
    crystal: state.crystal,
    generatorEnergized: state.generatorEnergized,
    pastDeviceActivated: state.pastDeviceActivated,
    futureGateOpen: state.futureGateOpen,
    chamberVisited: state.chamberVisited,
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
    position: { x: 0, y: 1.2, z: 20 },
    yaw: 0,
    pitch: 0,
  });
  player.setAspect(16 / 9);

  const fake = new FakeInput();
  const input = fake as unknown as Input;

  const hudState = {
    era: '2026' as EraId | null,
    toast: '',
    toastKind: 'info' as 'error' | 'info',
    switches: 0,
    rejections: 0,
    objective: null as ObjectiveView | null,
    objectiveStatus: '',
    held: '',
    prompt: null as string | null,
  };
  const hud: HudPort & CausalityHudPort = {
    setEra(era: EraId, _name: string, _description: string): void {
      hudState.era = era;
    },
    showToast(message: string, kind: 'error' | 'info'): void {
      hudState.toast = message;
      hudState.toastKind = kind;
    },
    setSwitchStats(switches: number, rejections: number): void {
      hudState.switches = switches;
      hudState.rejections = rejections;
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
  };

  const audioState = { era: '2026' as EraId | null };
  const audio: AudioPort = {
    ensureStarted(): void {
      // Audio is irrelevant in the headless check.
    },
    setEra(era: EraId): void {
      audioState.era = era;
    },
  };

  era2026.setActive(true);
  era2026.applyEnvironment(scene, renderer);
  hudState.era = '2026';

  const timeShift = new TimeShift(
    worldState,
    eras,
    physics,
    player,
    scene,
    renderer,
    hud,
    audio,
  );

  scene.add(player.camera);
  const content = createM2Content({ eras, physics, camera: player.camera });
  const causality = new CausalitySystem({
    worldState,
    player,
    timeShift,
    hud,
    content,
    spawn: { position: { x: 0, y: 1.2, z: 20 }, yaw: 0, pitch: 0 },
  });
  physics.registerDynamicCollider(content.gateCollider, '2126', () => causality.gateObstacleActive(), true);

  // Warm the query pipeline and broad phase exactly like Game does.
  physics.step(FIXED_DT);
  player.afterPhysicsStep();
  player.syncCamera();

  const simulate = (steps: number): void => {
    for (let i = 0; i < steps; i += 1) {
      while (fake.consumeReset()) {
        causality.resetRun();
      }
      while (fake.consumeSwitch()) {
        timeShift.request(otherEra(worldState.currentEra));
      }
      while (fake.consumeInteract()) {
        causality.interact();
      }
      player.updateLook(input);
      player.update(FIXED_DT, input, worldState.currentEra);
      physics.step(FIXED_DT);
      player.afterPhysicsStep();
      causality.tick();
    }
  };

  const teleport = (x: number, y: number, z: number, yaw = 0): void => {
    player.teleport(x, y, z, yaw, 0);
  };

  const switchAtSpawn = (target: EraId): boolean => {
    teleport(0, 1.2, 20, 0);
    fake.switchQueued += 1;
    simulate(2);
    return worldState.currentEra === target;
  };

  const interactNow = (): InteractionOutcome | null => {
    fake.interactQueued += 1;
    simulate(2);
    // The outcome itself is not returned by the queued path; state/prompt/toast
    // are asserted instead, exactly as the game loop would see them.
    return null;
  };

  const initialFingerprint = fingerprint(initialCausality());

  // --- 1. initial state / unique item / presentation ---------------------
  check(fingerprint(worldState.causality) === initialFingerprint, 'initial causal state is deterministic and complete');
  check(worldState.causality.revision === 0, 'initial revision is 0');
  check(worldState.causality.crystal.kind === 'world', 'crystal starts in the 2126 world');
  check(hudState.held.startsWith('手持：空'), 'HUD starts with empty hands');
  check(hudState.objective?.step === 1 && hudState.objective.done === false, 'HUD objective starts at step 1');
  check(hudState.objectiveStatus.includes('2126 基座'), 'HUD status reports crystal on the 2126 pedestal');

  let presentation = causality.presentation();
  check(presentation.visibleCrystalVisuals.length === 1 && presentation.visibleCrystalVisuals[0] === 'world',
    'exactly one crystal visual is visible (world)');
  check(presentation.gateSlab && !presentation.gateOpenGlow, 'future gate starts closed (slab visible, glow hidden)');
  check(presentation.gateObstacle, 'closed gate collider is active for movement');
  check(resolveInteractionTarget('2126', {x:6, y:15, z:0}) === null, 'interaction cannot reach a target far above or below');
  check(physics.isCapsuleObstructed('2126', {x:-18, y:1.9, z:0}).protectedObstacle, 'closed future gate is a protected time-shift obstacle');
  player.teleport(-18, 1.9, 0);
  const closedPose = player.snapshot();
  const gateShift = timeShift.request('2126');
  check(!gateShift.ok && worldState.currentEra === '2026', 'closed gate prevents switching into its occupied space');
  check(JSON.stringify(player.snapshot()) === JSON.stringify(closedPose), 'closed-gate rejection preserves pose and velocity');
  player.teleport(0, 1.2, 20);
  check(!presentation.generatorGlow && !presentation.socketCrystal && !presentation.carriedCrystal,
    'generator/socket/carried visuals start hidden');
  const gateInfo = causality.gateCollision();
  check(gateInfo.colliderHandle === content.gateColliderHandle && gateInfo.collider === content.gateCollider,
    'gate collision contract exposes its registered collider');
  check(gateInfo.era === '2126' && gateInfo.closed && gateInfo.blocksMovement,
    'closed gate collision contract reports era 2126 and blocking state');

  check(physics.countColliders('2026') === 75 + content.staticSolids2026,
    `2026 collider count includes ${content.staticSolids2026} M2 static solids`);
  check(physics.countColliders('2126') === 57 + content.staticSolids2126,
    `2126 collider count includes ${content.staticSolids2126} M2 static solids`);
  check(content.staticSolids2026 >= 5 && content.staticSolids2126 >= 9, 'M2 static geometry is pre-built in both eras');
  check(physics.isCapsuleObstructed('2126', { x: 6, y: STANDING_CENTER_Y, z: 2.2 }).blocked === false,
    'crystal interaction approach point is reachable ground in 2126');

  // --- 2. M1 regression: settle, safe switch, rejection, rapid switches ---
  teleport(0, 1.2, 20, 0);
  simulate(240);
  check(player.grounded, 'M1 regression: player settles on the plaza floor');
  near(player.position.y, STANDING_CENTER_Y, 0.05, 'M1 regression: standing height');

  const poseBeforeSwitch = player.snapshot();
  fake.switchQueued += 1;
  simulate(1);
  check(worldState.currentEra === '2126', 'M1 regression: safe switch to 2126 still succeeds');
  const poseAfterSwitch = player.snapshot();
  check(
    Math.abs(poseBeforeSwitch.position.x - poseAfterSwitch.position.x) < 1e-4
      && Math.abs(poseBeforeSwitch.position.y - poseAfterSwitch.position.y) < 1e-4
      && Math.abs(poseBeforeSwitch.position.z - poseAfterSwitch.position.z) < 1e-4
      && Math.abs(poseBeforeSwitch.velocity.x - poseAfterSwitch.velocity.x) < 1e-4
      && Math.abs(poseBeforeSwitch.velocity.y - poseAfterSwitch.velocity.y) < 1e-4
      && Math.abs(poseBeforeSwitch.velocity.z - poseAfterSwitch.velocity.z) < 1e-4,
    'M1 regression: switch preserves position and velocity (M2 content present)',
  );

  check(switchAtSpawn('2026'), 'M1 regression: safe switch back to 2026 succeeds');
  teleport(0, STANDING_CENTER_Y + 0.02, 6, 0);
  fake.switchQueued += 1;
  simulate(2);
  check(worldState.currentEra === '2126', 'M1 regression: switching into rubble uses a safe nearby landing');
  check(hudState.toast.includes('避开'), 'M1 regression: safe adjustment produces HUD feedback');
  check(fingerprint(worldState.causality) === initialFingerprint, 'M1 regression: adjusted switch does not touch causal state');
  check(switchAtSpawn('2026'), 'return to 2026 before rapid switches');

  teleport(0, STANDING_CENTER_Y + 0.02, 20, 0);
  simulate(10);
  const switchesBeforeBurst = timeShift.switchCount;
  fake.switchQueued += 100;
  simulate(20);
  check(timeShift.switchCount === switchesBeforeBurst + 100, 'M1 regression: 100 rapid switches complete 100 transactions');
  check(worldState.currentEra === '2026', 'M1 regression: even switch burst returns to 2026');

  // --- 3. closed future gate blocks 2126 movement ------------------------
  check(switchAtSpawn('2126'), 'switch to 2126 for closed-gate movement check');
  teleport(-16, STANDING_CENTER_Y + 0.02, 0, Math.PI / 2);
  simulate(6);
  fake.keys.add('KeyW');
  simulate(120);
  fake.keys.delete('KeyW');
  const closedGateX = player.position.x;
  check(closedGateX > -17.6 && closedGateX < -17.0,
    `closed gate blocks westward movement (x=${closedGateX.toFixed(2)})`);
  check(closedGateX > -18, 'player cannot pass the closed gate slab');
  check(causality.promptForCurrentPosition()?.includes('通道紧闭') === true,
    'gate prompt explains the closed causal link');

  // --- 4. wrong-era pickup attempt changes nothing -----------------------
  check(switchAtSpawn('2026'), 'switch back to 2026 for wrong-era interaction check');
  teleport(6, STANDING_CENTER_Y + 0.02, 2.2, 0);
  simulate(4);
  check(causality.promptForCurrentPosition() === null, 'crystal is not interactable in 2026');
  interactNow();
  check(fingerprint(worldState.causality) === initialFingerprint, 'wrong-era F does not change causal state');
  check(hudState.toast.includes('附近没有可交互'), 'wrong-era F gives feedback');
  check(worldState.causality.crystal.kind === 'world', 'wrong-era F does not move the crystal');

  // --- 5. real pickup in 2126, repeated F must not duplicate -------------
  check(switchAtSpawn('2126'), 'switch to 2126 for crystal pickup');
  teleport(6, STANDING_CENTER_Y + 0.02, 2.2, 0);
  simulate(4);
  check(causality.promptForCurrentPosition()?.includes('拾取能源晶体') === true, 'crystal prompt appears near the pedestal');
  interactNow();
  const afterPickup = fingerprint(worldState.causality);
  check(worldState.causality.crystal.kind === 'inventory', 'crystal moves from world to inventory');
  check(worldState.causality.revision === 1, 'pickup increments revision exactly once');
  check(CRYSTAL_ITEM_ID === 'crystal-01', 'crystal uses the single documented item ID');
  check(hudState.held.includes(CRYSTAL_ITEM_ID), 'HUD reports the held unique item ID');
  check(hudState.objective?.step === 2, 'HUD objective advances to step 2');
  presentation = causality.presentation();
  check(presentation.visibleCrystalVisuals.length === 1 && presentation.visibleCrystalVisuals[0] === 'inventory',
    'after pickup exactly one crystal visual is visible (carried)');
  check(!presentation.worldCrystal && presentation.carriedCrystal, 'world crystal hidden, carried crystal shown');

  interactNow();
  check(fingerprint(worldState.causality) === afterPickup, 'repeated F does not duplicate or change the crystal');
  presentation = causality.presentation();
  check(presentation.visibleCrystalVisuals.length === 1, 'repeated F leaves exactly one crystal visual');

  // --- 6. rejected switch while holding keeps the item -------------------
  teleport(0, STANDING_CENTER_Y + 0.02, 0, 0);
  fake.switchQueued += 1;
  simulate(2);
  check(worldState.currentEra === '2126', 'rejected switch while holding keeps 2126 active');
  check(hudState.toast.includes('安全落点'), 'rejected switch while holding reports feedback');
  check(fingerprint(worldState.causality) === afterPickup, 'rejected switch does not duplicate or lose the held crystal');

  // --- 7. carry crystal to 2026 -----------------------------------------
  check(switchAtSpawn('2026'), 'carry the crystal back to 2026');
  check(worldState.causality.crystal.kind === 'inventory', 'crystal survives the safe switch as inventory');
  check(fingerprint(worldState.causality) === afterPickup, 'safe switch neither duplicates nor loses the crystal');

  // --- 8. past device is inert before the generator is powered ----------
  teleport(-10, STANDING_CENTER_Y + 0.02, 1.8, 0);
  simulate(4);
  interactNow();
  check(worldState.causality.pastDeviceActivated === false, 'past device cannot be operated without generator power');
  check(fingerprint(worldState.causality) === afterPickup, 'unpowered device interaction changes nothing');
  check(hudState.toast.includes('没有能量'), 'unpowered device interaction gives energy feedback');

  // --- 9. insert crystal into generator ---------------------------------
  teleport(10, STANDING_CENTER_Y + 0.02, 2.2, 0);
  simulate(4);
  check(causality.promptForCurrentPosition()?.includes('放入发电机') === true, 'generator accepts the held crystal prompt');
  interactNow();
  check(worldState.causality.crystal.kind === 'socket', 'crystal moves from inventory into the generator socket');
  check(worldState.causality.generatorEnergized === true, 'generator energizes when the crystal is inserted');
  check(worldState.causality.revision === 2, 'insert increments revision exactly once');
  check(worldState.causality.crystal.kind === 'socket' && CRYSTAL_ITEM_ID === 'crystal-01',
    'socketed crystal keeps the unique item ID');
  presentation = causality.presentation();
  check(presentation.visibleCrystalVisuals.length === 1 && presentation.visibleCrystalVisuals[0] === 'socket',
    'after insert exactly one crystal visual is visible (socket)');
  check(presentation.generatorGlow && !presentation.carriedCrystal, 'generator glow on, carried crystal hidden');
  check(hudState.held.startsWith('手持：空'), 'hands are empty after inserting the crystal');
  check(hudState.objective?.step === 3, 'HUD objective advances to step 3');

  const afterInsert = fingerprint(worldState.causality);
  interactNow();
  check(fingerprint(worldState.causality) === afterInsert, 'repeated F at the powered generator changes nothing');
  check(hudState.toast.includes('已经就位') || hudState.toast.includes('运转'), 'repeated generator F reports already running');

  // --- 10. operate the past device -> future gate opens ------------------
  teleport(-10, STANDING_CENTER_Y + 0.02, 1.8, 0);
  simulate(4);
  check(causality.promptForCurrentPosition()?.includes('启动过去的机械装置') === true, 'past device prompt appears once powered');
  interactNow();
  check(worldState.causality.pastDeviceActivated === true, 'past device activates');
  check(worldState.causality.futureGateOpen === true, 'activating the past opens the 2126 gate');
  check(worldState.causality.revision === 3, 'device operation increments revision exactly once');
  presentation = causality.presentation();
  check(!presentation.gateSlab && presentation.gateOpenGlow, 'gate slab hides and open glow appears');
  check(!presentation.gateObstacle, 'gate collider gating follows the causal state');
  check(!physics.isCapsuleObstructed('2126', {x:-18, y:1.9, z:0}).protectedObstacle, 'open future gate no longer blocks time-shift queries');
  check(causality.gateCollision().closed === false && causality.gateCollision().blocksMovement === false,
    'gate collision contract reports open/non-blocking after activation');
  check(hudState.objective?.step === 4, 'HUD objective advances to step 4');

  const afterActivation = fingerprint(worldState.causality);
  interactNow();
  check(fingerprint(worldState.causality) === afterActivation, 'repeated device F does not skip or duplicate state');

  // --- 11. future gate is walkable and chamber entry is recorded --------
  check(switchAtSpawn('2126'), 'return to 2126 after activating the past');
  teleport(-16, STANDING_CENTER_Y + 0.02, 0, Math.PI / 2);
  simulate(6);
  fake.keys.add('KeyW');
  simulate(180);
  fake.keys.delete('KeyW');
  const openGateX = player.position.x;
  check(openGateX < -18.6, `player walks through the opened passage (x=${openGateX.toFixed(2)})`);
  check(worldState.causality.chamberVisited === true, 'chamber entry is recorded deterministically');
  check(worldState.causality.revision === 4, 'chamber entry increments revision exactly once');
  check(objectiveView(worldState.causality).done === true, 'objective reports the causal chain complete');
  check(hudState.objective?.done === true, 'HUD objective shows completion');
  check(hudState.toast.includes('穿过') || hudState.toast.includes('改变了'), 'chamber entry gives feedback');

  const afterVisit = fingerprint(worldState.causality);
  simulate(20);
  check(fingerprint(worldState.causality) === afterVisit, 'standing in the chamber does not re-trigger the visit');

  // --- 12. reset restores the initial state exactly ---------------------
  fake.resetQueued += 1;
  simulate(2);
  check(fingerprint(worldState.causality) === initialFingerprint, 'reset restores the exact initial causal state');
  check(worldState.currentEra === '2026', 'reset returns to the initial era');
  near(player.position.x, 0, 0.4, 'reset returns the player to spawn X');
  near(player.position.z, 20, 0.4, 'reset returns the player to spawn Z');
  presentation = causality.presentation();
  check(presentation.visibleCrystalVisuals.length === 1 && presentation.visibleCrystalVisuals[0] === 'world',
    'reset restores exactly one crystal visual at the pedestal');
  check(presentation.gateSlab && !presentation.gateOpenGlow && presentation.gateObstacle,
    'reset closes the future gate visually and for collision');
  check(!presentation.generatorGlow && !presentation.socketCrystal, 'reset hides generator/socket visuals');
  check(hudState.held.startsWith('手持：空'), 'reset clears hands');
  check(hudState.objective?.step === 1 && hudState.objective.done === false, 'reset restores objective step 1');

  fake.resetQueued += 1;
  simulate(2);
  check(fingerprint(worldState.causality) === initialFingerprint, 'repeated reset is idempotent');

  // item can be picked again exactly once after reset
  check(switchAtSpawn('2126'), 'switch to 2126 after reset');
  teleport(6, STANDING_CENTER_Y + 0.02, 2.2, 0);
  simulate(4);
  interactNow();
  check(worldState.causality.crystal.kind === 'inventory' && worldState.causality.revision === 1,
    'post-reset pickup works exactly once with revision 1');
  interactNow();
  check(worldState.causality.revision === 1, 'post-reset repeated pickup does not duplicate');

  // --- 13. rapid switches while holding keep the single item ------------
  teleport(0, STANDING_CENTER_Y + 0.02, 20, 0);
  simulate(10);
  const heldFingerprint = fingerprint(worldState.causality);
  const switchesBeforeHeldBurst = timeShift.switchCount;
  fake.switchQueued += 100;
  simulate(20);
  check(timeShift.switchCount === switchesBeforeHeldBurst + 100, '100 switches while holding complete 100 transactions');
  check(fingerprint(worldState.causality) === heldFingerprint, '100 switches while holding do not duplicate or lose the item');
  presentation = causality.presentation();
  check(presentation.visibleCrystalVisuals.length === 1, '100 switches while holding leave exactly one crystal visual');

  // --- 14. large mechanisms are never pickable --------------------------
  fake.resetQueued += 1;
  simulate(2);
  teleport(10, STANDING_CENTER_Y + 0.02, 2.2, 0);
  simulate(4);
  interactNow();
  check(worldState.causality.crystal.kind === 'world', 'generator with empty hands does not pick up the crystal');
  check(worldState.causality.crystal.kind === 'world' && worldState.causality.revision === 0,
    'generator interaction does not change the causal state while empty-handed');
  check(hudState.held.startsWith('手持：空'), 'generator is not treated as a pickable item');
  check(hudState.toast.includes('缺少能源晶体'), 'empty-handed generator gives a crystal hint');

  teleport(-10, STANDING_CENTER_Y + 0.02, 1.8, 0);
  simulate(4);
  interactNow();
  check(worldState.causality.pastDeviceActivated === false, 'empty-handed past device stays inactive');
  check(fingerprint(worldState.causality) === initialFingerprint, 'machine-only interactions never mutate item state');
  check(hudState.prompt === null || hudState.prompt.includes('没有能量') || hudState.prompt.includes('先启动'),
    'past device prompt reflects the missing energy state');

  // --- summary ----------------------------------------------------------
  console.log('');
  console.log(`M2 CAUSALITY CHECK RESULT: ${checks} checks passed`);
  console.log(`crystal item: ${CRYSTAL_ITEM_ID}`);
  console.log(`M2 static colliders: 2026=${content.staticSolids2026}, 2126=${content.staticSolids2126}`);
  console.log('interaction anchors (shared coordinates):');
  console.log(`  crystal 2126: (${M2_LAYOUT.crystalWorld.x}, ${M2_LAYOUT.crystalWorld.y}, ${M2_LAYOUT.crystalWorld.z})`);
  console.log(`  generator 2026: (${M2_LAYOUT.generator.x}, ${M2_LAYOUT.generator.y}, ${M2_LAYOUT.generator.z})`);
  console.log(`  past device 2026: (${M2_LAYOUT.pastDevice.x}, ${M2_LAYOUT.pastDevice.y}, ${M2_LAYOUT.pastDevice.z})`);
  console.log(`  future gate 2126: (${M2_LAYOUT.gateCenter.x}, ${M2_LAYOUT.gateCenter.y}, ${M2_LAYOUT.gateCenter.z})`);
  console.log('browser acceptance tips: stand near a target and press F; R resets; ?test=1 exposes __M2_TEST__.');
}

await run();

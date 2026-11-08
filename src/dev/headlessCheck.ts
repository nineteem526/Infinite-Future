/**
 * Headless logic verification for M1-001: physics, collision ownership and the
 * time-shift transaction. No DOM, no WebGL, no browser automation.
 *
 * Run (from the project root):
 *   npx rolldown src/dev/headlessCheck.ts -o "$env:TEMP/m1-headless.mjs" -f esm -p node
 *   node "$env:TEMP/m1-headless.mjs"
 *
 * This file is not imported by the app and is not part of the shipped bundle.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import {
  FIXED_DT,
  MAX_PITCH,
  STANDING_CENTER_Y,
  WALK_SPEED,
} from '../core/constants';
import type { Vec3 } from '../core/types';
import type { Input } from '../input/Input';
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

function vectorsEqual(a: Vec3, b: Vec3): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9 && Math.abs(a.z - b.z) < 1e-9;
}

async function run(): Promise<void> {
  await RAPIER.init();

  const physics = new Physics();
  const era2026 = new Era(createEra2026(), physics);
  const era2126 = new Era(createEra2126(), physics);
  const eras = new Map<EraId, Era>([
    ['2026', era2026],
    ['2126', era2126],
  ]);

  const scene = new THREE.Scene();
  scene.add(era2026.group, era2126.group);
  const renderer = { toneMappingExposure: 1 } as unknown as THREE.WebGLRenderer;

  const worldState = new WorldState('2026');
  const player = new Player(physics, {
    position: { x: 0, y: 1.2, z: 20 },
    yaw: 0,
    pitch: 0,
  });

  const fake = new FakeInput();
  const input = fake as unknown as Input;

  const hudState = {
    era: '2026' as EraId | null,
    toast: '',
    switches: 0,
    rejections: 0,
  };
  const hud: HudPort = {
    setEra(era: EraId, _name: string, _description: string): void {
      hudState.era = era;
    },
    showToast(message: string, _kind: 'error' | 'info'): void {
      hudState.toast = message;
    },
    setSwitchStats(switches: number, rejections: number): void {
      hudState.switches = switches;
      hudState.rejections = rejections;
    },
  };

  const audioState = { era: '2026' as EraId | null, ensureStartedCalls: 0 };
  const audio: AudioPort = {
    ensureStarted(): void {
      audioState.ensureStartedCalls += 1;
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

  const simulate = (steps: number): void => {
    for (let i = 0; i < steps; i += 1) {
      while (fake.consumeSwitch()) {
        timeShift.request(otherEra(worldState.currentEra));
      }
      player.updateLook(input);
      player.update(FIXED_DT, input, worldState.currentEra);
      physics.step(FIXED_DT);
      player.afterPhysicsStep();
    }
  };

  // --- 1. settle at the shared spawn point --------------------------------
  simulate(240);
  check(player.grounded, 'player is grounded after settling');
  near(player.position.y, STANDING_CENTER_Y, 0.05, 'player capsule rests on the plaza floor');
  check(!physics.isCapsuleObstructed('2026', player.position).blocked, 'spawn is clear in 2026');
  check(!physics.isCapsuleObstructed('2126', player.position).blocked, 'spawn is clear in 2126');
  check(physics.isCapsuleObstructed('2126', { x: 0, y: STANDING_CENTER_Y, z: 6.79 }).blocked, 'target wall rejects a 1 cm capsule overlap');

  // --- 2. WASD movement --------------------------------------------------
  player.teleport(10, STANDING_CENTER_Y + 0.02, 20, 0, 0);
  simulate(4);
  fake.keys.add('KeyW');
  simulate(120);
  fake.keys.delete('KeyW');
  near(player.position.z, 20 - WALK_SPEED, 0.35, 'one second of W travels about walk speed');
  check(player.position.x > 9.5 && player.position.x < 10.5, 'W does not drift sideways');

  fake.keys.add('KeyD');
  simulate(60);
  fake.keys.delete('KeyD');
  check(player.position.x > 10.4, 'D strafes right of the view direction');

  // --- 3. mouse look -----------------------------------------------------
  const yawBefore = player.yaw;
  const pitchBefore = player.pitch;
  fake.lookDelta.x = 200;
  fake.lookDelta.y = 90;
  simulate(1);
  check(player.yaw < yawBefore - 0.3, 'mouse X turns the view');
  check(player.pitch < pitchBefore - 0.1, 'mouse Y pitches the view');
  fake.lookDelta.y = -100000;
  simulate(1);
  near(player.pitch, MAX_PITCH, 1e-6, 'pitch is clamped at the upper limit');

  // --- 4. jump -----------------------------------------------------------
  player.teleport(0, STANDING_CENTER_Y + 0.02, 20, 0, 0);
  simulate(12);
  check(player.grounded, 'player is grounded before jumping');
  fake.jumpQueued += 1;
  simulate(1);
  check(player.velocity.y > 0, 'space produces upward velocity');
  let apex = player.position.y;
  for (let i = 0; i < 60; i += 1) {
    simulate(1);
    apex = Math.max(apex, player.position.y);
  }
  check(apex > STANDING_CENTER_Y + 0.7, `jump apex reaches a real height (apex=${apex.toFixed(2)})`);
  simulate(240);
  check(player.grounded, 'player lands after the jump');
  near(player.position.y, STANDING_CENTER_Y, 0.05, 'player returns to floor level');

  // --- 5. wall collision --------------------------------------------------
  player.teleport(0, STANDING_CENTER_Y + 0.02, 30, Math.PI, 0);
  simulate(6);
  fake.keys.add('KeyW');
  simulate(180);
  fake.keys.delete('KeyW');
  check(player.position.z > 30.4, 'player walked toward the south wall');
  check(player.position.z < 31.35, `south wall stops the player (z=${player.position.z.toFixed(2)})`);

  // --- 6. collision layout differs per era ------------------------------
  player.teleport(2, STANDING_CENTER_Y + 0.02, 10, 0, 0);
  simulate(6);
  fake.keys.add('KeyW');
  simulate(180);
  fake.keys.delete('KeyW');
  const stop2026 = player.position.z;
  check(stop2026 > 3.0 && stop2026 < 4.0, `2026 monument blocks the lane at z=${stop2026.toFixed(2)}`);

  player.teleport(0, STANDING_CENTER_Y + 0.02, 20, 0, 0);
  simulate(4);
  check(timeShift.request('2126').ok, 'switch to 2126 at a safe spawn succeeds');
  simulate(4);
  player.teleport(2, STANDING_CENTER_Y + 0.02, 10, 0, 0);
  simulate(6);
  fake.keys.add('KeyW');
  simulate(120);
  fake.keys.delete('KeyW');
  const stop2126 = player.position.z;
  check(stop2126 > 6.4 && stop2126 < 7.4, `2126 rubble wall blocks the lane at z=${stop2126.toFixed(2)}`);
  check(Math.abs(stop2126 - stop2026) > 1.5, 'collision layout changes together with the active era');

  // --- 7. obstructed target finds a nearby safe landing -----------------
  player.teleport(0, STANDING_CENTER_Y + 0.02, 20, 0, 0);
  simulate(4);
  check(timeShift.request('2026').ok, 'switch back to 2026 at a safe spawn succeeds');
  simulate(4);
  player.teleport(0, STANDING_CENTER_Y + 0.02, 6, 0, 0);
  simulate(4);
  const beforeAdjusted = player.snapshot();
  const adjusted = timeShift.request('2126');
  check(adjusted.ok && adjusted.adjusted === true, 'obstructed target finds a nearby landing');
  check(!physics.isCapsuleObstructed('2126', player.position).blocked, 'adjusted landing is clear in target era');
  check(vectorsEqual(beforeAdjusted.velocity, player.snapshot().velocity), 'adjusted landing preserves velocity');
  check(hudState.toast.includes('避开'), 'adjustment provides a gentle hint');
  check(worldState.currentEra === '2126' && era2126.group.visible && !era2026.group.visible, 'adjustment commits target state and visuals');

  // --- 9. successful switch preserves position / view / velocity ---------
  player.teleport(0, STANDING_CENTER_Y + 0.02, 20, 0.7, -0.2);
  simulate(10);
  fake.keys.add('KeyW');
  fake.keys.add('KeyD');
  simulate(5);
  const beforeSwitch = player.snapshot();
  const result = timeShift.request('2026');
  check(result.ok, 'switch 2126 -> 2026 at a safe spawn succeeds');
  const afterSwitch = player.snapshot();
  check(vectorsEqual(beforeSwitch.position, afterSwitch.position), 'position is preserved exactly across the switch');
  check(vectorsEqual(beforeSwitch.velocity, afterSwitch.velocity), 'velocity is preserved exactly across the switch');
  near(afterSwitch.yaw, beforeSwitch.yaw, 1e-12, 'yaw is preserved across the switch');
  near(afterSwitch.pitch, beforeSwitch.pitch, 1e-12, 'pitch is preserved across the switch');
  check(worldState.currentEra === '2026', 'world state is committed to the target era');
  check(era2026.group.visible && !era2126.group.visible, 'render visibility is committed atomically');
  check(scene.background instanceof THREE.Color && scene.background.getHex() === era2026.lighting.background,
    'scene background is committed atomically');
  check(scene.fog instanceof THREE.FogExp2
    && Math.abs(scene.fog.density - era2026.lighting.fogDensity) < 1e-12,
    'fog is committed atomically');
  near(renderer.toneMappingExposure, era2026.lighting.exposure, 1e-12, 'exposure is committed atomically');
  check(audioState.era === '2026', 'ambience is committed atomically');
  check(hudState.era === '2026', 'HUD is committed atomically');
  fake.keys.clear();

  // --- 10. airborne switch preserves vertical velocity -------------------
  player.teleport(0, STANDING_CENTER_Y + 0.02, 20, 0, 0);
  simulate(10);
  fake.jumpQueued += 1;
  simulate(6);
  const airborne = player.snapshot();
  check(!player.grounded, 'player is airborne before the switch');
  check(airborne.velocity.y > 0.5, 'player has upward velocity before the switch');
  check(timeShift.request('2126').ok, 'switch while airborne is allowed at a safe position');
  const airborneAfter = player.snapshot();
  check(vectorsEqual(airborne.position, airborneAfter.position), 'airborne switch preserves position');
  check(vectorsEqual(airborne.velocity, airborneAfter.velocity), 'airborne switch preserves vertical velocity');
  simulate(240);
  check(player.grounded, 'player lands normally after an airborne switch');

  // --- 11. 100 consecutive switches --------------------------------------
  player.teleport(0, STANDING_CENTER_Y + 0.02, 20, 0.2, -0.1);
  simulate(30);
  const beforeBurst = player.snapshot();
  const eraBeforeBurst = worldState.currentEra;
  const switchesBeforeBurst = timeShift.switchCount;
  const rejectionsBeforeBurst = timeShift.rejectionCount;
  fake.switchQueued += 100;
  simulate(120);
  check(timeShift.switchCount === switchesBeforeBurst + 100,
    `100 rapid E presses complete 100 transactions (${timeShift.switchCount - switchesBeforeBurst})`);
  check(worldState.currentEra === eraBeforeBurst, 'even number of switches returns to the starting era');
  const burstPose = player.snapshot();
  check(
    Math.abs(burstPose.position.x - beforeBurst.position.x) < 1e-4
      && Math.abs(burstPose.position.y - beforeBurst.position.y) < 1e-4
      && Math.abs(burstPose.position.z - beforeBurst.position.z) < 1e-4,
    '100 switches leave the position untouched (physics settling tolerance 1e-4)',
  );
  check(
    Math.abs(burstPose.velocity.x - beforeBurst.velocity.x) < 1e-4
      && Math.abs(burstPose.velocity.y - beforeBurst.velocity.y) < 1e-4
      && Math.abs(burstPose.velocity.z - beforeBurst.velocity.z) < 1e-4,
    '100 switches leave the velocity untouched (physics settling tolerance 1e-4)',
  );
  near(player.yaw, beforeBurst.yaw, 1e-12, '100 switches leave the view yaw untouched');
  near(player.pitch, beforeBurst.pitch, 1e-12, '100 switches leave the view pitch untouched');
  const visibleEra = [...eras.values()].find((candidate) => candidate.group.visible)?.id ?? null;
  check(visibleEra === worldState.currentEra, 'render state matches world state after 100 switches');
  check(hudState.era === worldState.currentEra, 'HUD matches world state after 100 switches');
  check(audioState.era === worldState.currentEra, 'ambience matches world state after 100 switches');
  check(timeShift.rejectionCount === rejectionsBeforeBurst,
    '100 switches at a safe position were never rejected');

  // --- summary ------------------------------------------------------------
  const colliders2026 = physics.countColliders('2026');
  const colliders2126 = physics.countColliders('2126');
  check(colliders2026 > 30, `2026 era registered ${colliders2026} structural colliders`);
  check(colliders2126 > 30, `2126 era registered ${colliders2126} structural colliders`);

  console.log('');
  console.log(`HEADLESS CHECK RESULT: ${checks} checks passed`);
  console.log(`standing capsule center Y ≈ ${STANDING_CENTER_Y}`);
  console.log('safe switch position for browser acceptance: (0, ≈0.92, 20)');
  console.log('rejection A (2026 -> 2126 rubble wall): (0, ≈0.92, 6) in 2026');
  console.log('rejection B (2126 -> 2026 monument): (0, ≈0.92, 0) in 2126');
}

await run();

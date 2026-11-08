import RAPIER from '@dimforge/rapier3d-compat';
import { Physics } from '../physics/Physics';
import { Era } from '../world/Era';
import { createEra2026 } from '../world/eras/era2026';
import { createEra2126 } from '../world/eras/era2126';
import type { EraId } from '../world/types';
await RAPIER.init();
const physics = new Physics();
new Era(createEra2026(), physics);
new Era(createEra2126(), physics);
physics.step();
for (const [source, target] of [['2026','2126'], ['2126','2026']] as const satisfies readonly (readonly [EraId, EraId])[]) {
  let sourceWalkable = 0, aligned = 0, adjusted = 0, blocked = 0;
  for (let x = -25; x <= 25; x++) for (let z = -25; z <= 25; z++) {
    const point = { x, y: 0.92, z };
    if (physics.isCapsuleObstructed(source, point).blocked || !physics.hasSupport(source, point)) continue;
    sourceWalkable++;
    if (!physics.isCapsuleObstructed(target, point).blocked) aligned++;
    else if (physics.findSafeLanding(source, target, point, true)) adjusted++;
    else blocked++;
  }
  console.log(`${source}->${target}: ${sourceWalkable} source samples, ${aligned} aligned, ${adjusted} adjusted, ${blocked} no landing`);
}

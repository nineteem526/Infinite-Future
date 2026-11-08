import type { Vec3 } from '../core/types';
import type { EraId } from '../world/types';
import { M2_TARGETS } from './layout';
import {
  CRYSTAL_ITEM_ID,
  type CausalityState,
  type InteractionTarget,
  type TargetDescription,
} from './types';

/**
 * Read-only interaction targeting. Pure function of (era, player position,
 * target data): no state mutation, no randomness, fixed iteration order.
 */
export function resolveInteractionTarget(
  era: EraId,
  playerPosition: Vec3,
): InteractionTarget | null {
  let best: InteractionTarget | null = null;
  let bestDistanceSq = Number.POSITIVE_INFINITY;

  for (const target of M2_TARGETS) {
    if (target.era !== era) continue;
    const dx = playerPosition.x - target.anchor.x;
    const dy = playerPosition.y - target.anchor.y;
    const dz = playerPosition.z - target.anchor.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq > target.radius * target.radius) continue;
    // Strictly smaller keeps tie-breaking deterministic by M2_TARGETS order.
    if (distanceSq < bestDistanceSq) {
      best = target;
      bestDistanceSq = distanceSq;
    }
  }

  return best;
}

/** Maps a resolved target + current causal state to a prompt and/or action. */
export function describeTarget(
  target: InteractionTarget,
  state: CausalityState,
): TargetDescription {
  switch (target.id) {
    case 'crystal-2126':
      if (state.crystal.kind === 'world') {
        return {
          prompt: '按 F 拾取能源晶体',
          action: { type: 'pickup-crystal', target: 'crystal-2126', itemId: CRYSTAL_ITEM_ID },
        };
      }
      if (state.crystal.kind === 'inventory') {
        return { prompt: '能源晶体已经被你取走', action: null };
      }
      return { prompt: '能源晶体已装入 2026 的发电机', action: null };

    case 'generator-2026':
      if (state.crystal.kind === 'inventory') {
        return {
          prompt: '按 F 将能源晶体放入发电机',
          action: { type: 'insert-crystal', target: 'generator-2026', itemId: CRYSTAL_ITEM_ID },
        };
      }
      if (state.crystal.kind === 'socket') {
        return { prompt: '发电机正在运转：能源晶体已就位', action: null };
      }
      return { prompt: '发电机缺少能源晶体：先去 2126 寻找', action: null };

    case 'past-device-2026':
      if (!state.generatorEnergized) {
        return { prompt: '过去机关没有能量：先启动发电机', action: null };
      }
      if (state.pastDeviceActivated) {
        return { prompt: '过去机关已经启动：2126 通道保持开启', action: null };
      }
      return {
        prompt: '按 F 启动过去的机械装置',
        action: { type: 'operate-past-device', target: 'past-device-2026' },
      };

    case 'future-gate-2126':
      if (state.futureGateOpen) {
        return { prompt: '通道已开启：可以直接走进去', action: null };
      }
      return { prompt: '通道紧闭：与 2026 的过去机关存在因果联系', action: null };
  }
}

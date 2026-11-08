import type { Vec3 } from '../core/types';
import type { CausalityState } from '../m2/types';
import type { EraId } from '../world/types';
import { STORY_TARGETS } from './layout';
import type { StoryState, StoryTarget, StoryTargetDescription } from './types';

export function resolveStoryTarget(
  era: EraId,
  playerPosition: Vec3,
): StoryTarget | null {
  let best: StoryTarget | null = null;
  let bestDistanceSq = Number.POSITIVE_INFINITY;

  for (const target of STORY_TARGETS) {
    if (target.era !== era) continue;
    const dx = playerPosition.x - target.anchor.x;
    const dy = playerPosition.y - target.anchor.y;
    const dz = playerPosition.z - target.anchor.z;
    const distanceSq = dx * dx + dy * dy + dz * dz;
    if (distanceSq > target.radius * target.radius) continue;
    if (distanceSq < bestDistanceSq) {
      best = target;
      bestDistanceSq = distanceSq;
    }
  }

  return best;
}

export function describeStoryTarget(
  target: StoryTarget,
  state: StoryState,
  causality: CausalityState,
): StoryTargetDescription {
  switch (target.id) {
    case 'painting-2026':
    case 'painting-2126':
      if (state.stage === 'gallery-intro') {
        return { prompt: '按 F 穿过画框，进入街道', action: { type: 'enter-frame' } };
      }
      return { prompt: '画框安静地立在画廊里', action: null };

    case 'time-device':
      if (state.stage === 'street') {
        return {
          prompt: '按 F 取得折时仪',
          action: { type: 'acquire-time-device' },
        };
      }
      if (state.timeDeviceAcquired) {
        return { prompt: '折时仪已经校准', action: null };
      }
      return { prompt: '折时仪还埋在街道的废墟里', action: null };

    case 'archive-record':
      if (state.stage === 'archive') {
        return { prompt: '按 F 读取时序档案', action: { type: 'read-archive' } };
      }
      if (state.archiveRead) {
        return { prompt: '时序档案已经读取完毕', action: null };
      }
      if (state.stage === 'workshop' && !causality.chamberVisited) {
        return { prompt: '档案碑没有响应：先完成时间工坊并穿过西侧通道', action: null };
      }
      return { prompt: '档案碑仍被时间封锁', action: null };

    case 'terminal-core':
      if (state.stage === 'terminal') {
        return { prompt: '按 F 关闭时间封锁', action: { type: 'close-lockdown' } };
      }
      if (state.lockdownClosed) {
        return { prompt: '时间封锁已经关闭', action: null };
      }
      if (state.stage === 'archive') {
        return { prompt: '核心仍被封锁：先读取时序档案', action: null };
      }
      return { prompt: '终末画布核心还没有回应', action: null };

    case 'blank-canvas':
      if (state.stage === 'return-gallery') {
        return {
          prompt: '按 F 在空白画布上留下第一笔颜色',
          action: { type: 'paint-first-stroke' },
        };
      }
      if (state.firstStrokePainted) {
        return { prompt: '第一笔颜色已经留下', action: null };
      }
      return { prompt: '空白画布还没有回应', action: null };
  }
}

export function storyPromptFor(
  era: EraId,
  playerPosition: Vec3,
  state: StoryState,
  causality: CausalityState,
): string | null {
  const target = resolveStoryTarget(era, playerPosition);
  if (!target) return null;
  return describeStoryTarget(target, state, causality).prompt;
}

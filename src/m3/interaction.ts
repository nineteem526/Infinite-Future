import type { Vec3 } from '../core/types';
import type { CausalityState } from '../m2/types';
import type { EraId } from '../world/types';
import { STORY_TARGETS, areaLabel } from './layout';
import { PAINTING_TITLES, paintingsViewedLabel } from './story';
import type {
  StoryAction,
  StoryState,
  StoryTarget,
  StoryTargetDescription,
} from './types';

/**
 * Read-only story targeting. Pure function of (era, position, state); action
 * legality is still double-checked by the WorldState reducer.
 */
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
    case 'painting-gallery': {
      const paintingId = target.id;
      if (state.stage !== 'gallery-intro') {
        return { prompt: '画作仍在原处，画廊已经打开', action: null };
      }
      if (state.paintingsViewed.includes(paintingId)) {
        return { prompt: `${PAINTING_TITLES[paintingId]}已经观察过`, action: null };
      }
      return {
        prompt: `按 F 观察${PAINTING_TITLES[paintingId]}（${paintingsViewedLabel(state)}）`,
        action: { type: 'view-painting', painting: paintingId },
      };
    }

    case 'gallery-frame':
      if (state.stage === 'gallery-intro') {
        if (state.paintingsViewed.length < 3) {
          return {
            prompt: `中央画框仍然紧闭：先观察三幅画（${paintingsViewedLabel(state)}）`,
            action: null,
          };
        }
        return {
          prompt: '按 F 穿过中央画框，传送至失落的街区（2026 广场）',
          action: { type: 'enter-frame' },
        };
      }
      if (state.galleryDoorOpen) {
        return { prompt: '画框已经把你送到失落的街区；现在它安静地立在画廊里', action: null };
      }
      return { prompt: '中央画框还没有回应', action: null };

    case 'archive-record':
      if (state.stage === 'archive') {
        return {
          prompt: '按 F 读取时序档案',
          action: { type: 'read-archive' },
        };
      }
      if (state.archiveRead) {
        return { prompt: '时序档案已经读取完毕', action: null };
      }
      if (state.stage === 'workshop' && !causality.chamberVisited) {
        return {
          prompt: '档案碑没有响应：需要先完成时间工坊并穿过通道',
          action: null,
        };
      }
      return { prompt: '档案碑仍被时间封锁', action: null };

    case 'terminal-core':
      if (state.stage === 'terminal') {
        return {
          prompt: '按 F 关闭时间封锁',
          action: { type: 'close-lockdown' },
        };
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

/** Prompt shown by the HUD when a story target is nearby. */
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

/** Convenience for tests/telemetry: which area the player currently occupies. */
export function storyAreaLabel(era: EraId, position: Vec3): string {
  return areaLabel(era, position);
}

export type { StoryAction };

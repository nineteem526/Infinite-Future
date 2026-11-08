import type { CausalityState, ObjectiveView } from '../m2/types';
import type {
  PaintingId,
  StoryAction,
  StoryOutcome,
  StoryReductionContext,
  StoryState,
} from './types';

export const STORY_OBJECTIVE_TOTAL = 6;

export const STORY_INTRO_SUBTITLE =
  '最后的画廊。三幅画停在未完成的时刻，中央画框背后传来城市的回声。';

export const STORY_DISTRICT_SUBTITLE =
  '失落的街区。两个时代共享同一片地面；按 E 在同一处跨越百年。';

export const STORY_WORKSHOP_SUBTITLE =
  '时间工坊。能源晶体属于 2126，发电机属于 2026——过去的选择会改写未来。';

export const STORY_ARCHIVE_SUBTITLE =
  '时序档案：2126 的终末画布并非自然衰败。记录显示，你曾把未来的技术带回 2026，'
  + '亲手参与时间封锁的建造与维持。你以为自己在修复时间，其实一直在维护它。';

export const STORY_TERMINAL_SUBTITLE =
  '终末画布核心。时间封锁从这里维持着整座城市的黄昏。关闭它，未来才第一次不再被写死。';

export const STORY_LOCKDOWN_CLOSED_SUBTITLE =
  '时间封锁关闭。城市的黄昏开始流动，未来第一次拥有了空白的一页。';

export const STORY_RETURN_GALLERY_SUBTITLE =
  '回到最后的画廊。中央画布是空白的，它没有要求你修复什么，只等你留下第一笔颜色。';

export const STORY_ENDING_SUBTITLE =
  '你留下了第一笔颜色。不是修复，也不是预言——只是一个选择。\nTHE FUTURE IS NOT WRITTEN.';

export const STORY_ENTER_FRAME_SUBTITLE =
  '中央画框像水面一样打开。你穿过画布，落在失落的街区（2026 广场）——两个时代的回声在脚下重叠。';

export const PAINTING_TITLES: Readonly<Record<PaintingId, string>> = {
  'painting-2026': '《暮色钟城广场》',
  'painting-2126': '《末日钟塔广场的黄昏废墟》',
  'painting-gallery': '《光影交错的时光画廊》',
};

export const PAINTING_IDS: readonly PaintingId[] = [
  'painting-2026',
  'painting-2126',
  'painting-gallery',
];

const PAINTING_SUBTITLES: Readonly<Record<PaintingId, string>> = {
  'painting-2026':
    '《暮色钟城广场》——暖金落在 2026 的钟楼上。你记得这个黄昏，却想不起自己是否来过。',
  'painting-2126':
    '《末日钟塔广场的黄昏废墟》——画布边缘还有未干透的灰蓝。那像是未来，又像是你留下的颜色。',
  'painting-gallery':
    '《光影交错的时光画廊》——三幅画之间，少了一条失落的街。',
};

interface Reduction {
  readonly state: StoryState;
  readonly outcome: StoryOutcome;
}

export function initialStory(): StoryState {
  return {
    stage: 'gallery-intro',
    paintingsViewed: [],
    galleryDoorOpen: false,
    shiftLearned: false,
    archiveRead: false,
    lockdownClosed: false,
    firstStrokePainted: false,
    revision: 0,
  };
}

function fail(
  state: StoryState,
  message: string,
  tone: 'error' | 'info' = 'error',
): Reduction {
  return {
    state,
    outcome: { changed: false, ok: false, message, tone },
  };
}

function succeed(
  state: StoryState,
  message: string,
  subtitle?: string,
): Reduction {
  return {
    state,
    outcome: {
      changed: true,
      ok: true,
      message,
      tone: 'success',
      ...(subtitle === undefined ? {} : { subtitle }),
    },
  };
}

/**
 * Pure deterministic mainline reducer. StorySystem only resolves targets and
 * submits actions; every stage transition, guard and narrative beat lives here.
 * No timers, RNG, network or online AI are involved.
 */
export function reduceStory(
  state: StoryState,
  action: StoryAction,
  context: StoryReductionContext,
): Reduction {
  switch (action.type) {
    case 'view-painting': {
      if (context.era !== '2026') {
        return fail(state, '画作只存在于 2026 的画廊', 'info');
      }
      if (state.stage !== 'gallery-intro') {
        return fail(state, '画廊已经打开，画作仍留在原处', 'info');
      }
      if (state.paintingsViewed.includes(action.painting)) {
        return fail(state, `${PAINTING_TITLES[action.painting]}已经观察过`, 'info');
      }
      const next: StoryState = {
        ...state,
        paintingsViewed: [...state.paintingsViewed, action.painting],
        revision: state.revision + 1,
      };
      return succeed(
        next,
        `已观察${PAINTING_TITLES[action.painting]}（${next.paintingsViewed.length}/3）`,
        PAINTING_SUBTITLES[action.painting],
      );
    }

    case 'enter-frame': {
      if (context.era !== '2026') {
        return fail(state, '中央画框位于 2026 的画廊', 'info');
      }
      if (state.stage !== 'gallery-intro') {
        return fail(state, '中央画框已经打开', 'info');
      }
      if (state.paintingsViewed.length < 3) {
        return fail(
          state,
          `中央画框仍然紧闭：先观察三幅画（${state.paintingsViewed.length}/3）`,
          'info',
        );
      }
      return succeed(
        {
          ...state,
          stage: 'district',
          galleryDoorOpen: true,
          revision: state.revision + 1,
        },
        '你穿过中央画框：传送目的地是失落的街区（2026 广场）',
        STORY_ENTER_FRAME_SUBTITLE,
      );
    }

    case 'learn-shift': {
      if (state.stage !== 'district') {
        return fail(state, '现在不需要练习切换', 'info');
      }
      return succeed(
        {
          ...state,
          stage: 'workshop',
          shiftLearned: true,
          revision: state.revision + 1,
        },
        '你学会了在两个时代之间移动',
        STORY_WORKSHOP_SUBTITLE,
      );
    }

    case 'enter-archive': {
      if (state.stage !== 'workshop') {
        return fail(state, '时序档案还没有出现在通道尽头', 'info');
      }
      if (context.era !== '2126') {
        return fail(state, '时序档案位于 2126 的通道内', 'info');
      }
      if (!context.causality.chamberVisited) {
        return fail(state, '先完成时间工坊并穿过 2126 的通道', 'info');
      }
      return succeed(
        { ...state, stage: 'archive', revision: state.revision + 1 },
        '你走到了通道尽头：时序档案仍在运行',
        '通道尽头，一块仍在运行的档案碑。它记录着 2126 的终末画布如何被维持。',
      );
    }

    case 'read-archive': {
      if (state.stage !== 'archive') {
        return fail(state, '时序档案还没有解锁', 'info');
      }
      if (context.era !== '2126') {
        return fail(state, '时序档案位于 2126 的通道内', 'info');
      }
      return succeed(
        {
          ...state,
          archiveRead: true,
          stage: 'terminal',
          revision: state.revision + 1,
        },
        '你读完了时序档案：真相被揭开',
        STORY_ARCHIVE_SUBTITLE,
      );
    }

    case 'close-lockdown': {
      if (state.stage !== 'terminal') {
        return fail(state, '时间封锁还没有准备好被关闭', 'info');
      }
      if (context.era !== '2126') {
        return fail(state, '终末画布核心位于 2126', 'info');
      }
      return succeed(
        {
          ...state,
          lockdownClosed: true,
          stage: 'return-gallery',
          revision: state.revision + 1,
        },
        '时间封锁已关闭：回到画廊，留下第一笔颜色',
        STORY_LOCKDOWN_CLOSED_SUBTITLE,
      );
    }

    case 'paint-first-stroke': {
      if (state.stage !== 'return-gallery') {
        return fail(state, '空白画布还没有回应', 'info');
      }
      if (context.era !== '2026') {
        return fail(state, '中央空白画布位于 2026 的画廊', 'info');
      }
      return succeed(
        {
          ...state,
          firstStrokePainted: true,
          stage: 'complete',
          revision: state.revision + 1,
        },
        '你在空白画布上留下了第一笔颜色',
        STORY_ENDING_SUBTITLE,
      );
    }
  }
}

/** Mainline objective text; CausalitySystem remains the item/mechanism authority. */
export function storyObjectiveView(
  state: StoryState,
  causality: CausalityState,
): ObjectiveView {
  const total = STORY_OBJECTIVE_TOTAL;
  switch (state.stage) {
    case 'gallery-intro':
      if (state.paintingsViewed.length < 3) {
        return {
          step: 1,
          total,
          title: `最后的画廊：观察三幅画作（${state.paintingsViewed.length}/3）`,
          done: false,
        };
      }
      return {
        step: 1,
        total,
        title: '最后的画廊：按 F 穿过中央画框，传送至失落的街区',
        done: false,
      };

    case 'district':
      return { step: 2, total, title: '失落的街区：按 E 切换 2026 / 2126', done: false };

    case 'workshop': {
      let title: string;
      if (causality.crystal.kind === 'world') {
        title = '时间工坊：前往 2126 取得能源晶体（F）';
      } else if (causality.crystal.kind === 'inventory') {
        title = '时间工坊：把晶体带回 2026 放入发电机（F）';
      } else if (!causality.pastDeviceActivated) {
        title = '时间工坊：操作 2026 的过去机械装置（F）';
      } else if (!causality.chamberVisited) {
        title = '时间工坊：进入 2126 的通道并走到尽头';
      } else {
        title = '时间工坊：读取通道内的时序档案（F）';
      }
      return { step: 3, total, title, done: false };
    }

    case 'archive':
      return { step: 4, total, title: '在 2126 通道尽头读取时序档案（F）', done: false };

    case 'terminal':
      return {
        step: 5,
        total,
        title: '前往 2126 东北的终末画布核心，关闭时间封锁（F）',
        done: false,
      };

    case 'return-gallery':
      return {
        step: 6,
        total,
        title: '回到 2026 的画廊，在中央空白画布留下第一笔颜色（F）',
        done: false,
      };

    case 'complete':
      return {
        step: 6,
        total,
        title: '主线完成：The future is not written.',
        done: true,
      };
  }
}

export function paintingsViewedLabel(state: StoryState): string {
  return `${state.paintingsViewed.length}/3`;
}

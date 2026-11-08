import type { CausalityState, ObjectiveView } from '../m2/types';
import type {
  StoryAction,
  StoryOutcome,
  StoryReductionContext,
  StoryState,
} from './types';

export const STORY_OBJECTIVE_TOTAL = 6;

export const STORY_INTRO_SUBTITLE =
  '最后的画廊。左边是过去，右边是未来，中央是一块空白画布。';

export const STORY_STREET_SUBTITLE =
  '街道还活着。沿着它走向城市核心——时间工坊在那里等着能源。';

export const STORY_ENTER_FRAME_SUBTITLE =
  '你穿过画框，落在画廊外的街道上。';

export const STORY_DEVICE_SUBTITLE = '折时仪校准了两个时代的坐标。';

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

interface Reduction {
  readonly state: StoryState;
  readonly outcome: StoryOutcome;
}

export function initialStory(): StoryState {
  return {
    stage: 'gallery-intro',
    timeDeviceAcquired: false,
    airborneShiftUsed: false,
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
  return { state, outcome: { changed: false, ok: false, message, tone } };
}

function succeed(state: StoryState, message: string, subtitle?: string): Reduction {
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
 * Pure deterministic mainline reducer. Painting teleports, device acquisition,
 * passage/archive/terminal/ending beats all live here; StorySystem only resolves
 * targets and commits presentation.
 */
export function reduceStory(
  state: StoryState,
  action: StoryAction,
  context: StoryReductionContext,
): Reduction {
  switch (action.type) {
    case 'enter-frame': {
      if (context.era !== '2026') {
        return fail(state, '画廊位于 2026', 'info');
      }
      if (state.stage !== 'gallery-intro') {
        return fail(state, '画框只在序章传送', 'info');
      }
      return succeed(
        { ...state, stage: 'street', revision: state.revision + 1 },
        '你穿过画框，进入街道',
        STORY_ENTER_FRAME_SUBTITLE,
      );
    }

    case 'acquire-time-device': {
      if (context.era !== '2026') {
        return fail(state, '折时仪位于街道的 2026 一侧', 'info');
      }
      if (state.stage !== 'street') {
        return fail(state, '折时仪已经完成校准', 'info');
      }
      return succeed(
        {
          ...state,
          stage: 'bridge',
          timeDeviceAcquired: true,
          revision: state.revision + 1,
        },
        '已取得折时仪：现在可以按 E 稳定切换时代',
        STORY_DEVICE_SUBTITLE,
      );
    }

    case 'record-airborne-shift': {
      if (state.stage !== 'bridge') {
        return fail(state, '现在不需要记录空中切换', 'info');
      }
      if (state.airborneShiftUsed) {
        return fail(state, '空中切换已经记录过了', 'info');
      }
      return succeed(
        { ...state, airborneShiftUsed: true, revision: state.revision + 1 },
        '空中切换成功：你落向 2126 的桥面',
        '桥面在脚下出现——只有腾空时切换，未来才会接住你。',
      );
    }

    case 'complete-bridge': {
      if (state.stage !== 'bridge') {
        return fail(state, '桥面挑战还没有通过', 'info');
      }
      if (!state.airborneShiftUsed) {
        return fail(state, '先在空中按 E 落到 2126 的桥面', 'info');
      }
      return succeed(
        { ...state, stage: 'corridor', revision: state.revision + 1 },
        '你通过街道桥面：前方是坍塌走廊',
        '街道尽头，2126 的坍塌走廊挡在面前。',
      );
    }

    case 'cross-corridor': {
      if (state.stage !== 'corridor') {
        return fail(state, '坍塌走廊还没有被绕过', 'info');
      }
      if (!state.timeDeviceAcquired) {
        return fail(state, '没有折时仪，无法稳定通过走廊', 'info');
      }
      return succeed(
        { ...state, stage: 'workshop', revision: state.revision + 1 },
        '你借 2026 的完整走廊绕过了坍塌段：城市核心到了',
        '城市核心就在前方。时间工坊等着能源。',
      );
    }

    case 'enter-archive': {
      if (state.stage !== 'workshop') {
        return fail(state, '时序档案还没有出现在通道尽头', 'info');
      }
      if (context.era !== '2126') {
        return fail(state, '时序档案位于 2126 的西侧通道内', 'info');
      }
      if (!context.causality.chamberVisited) {
        return fail(state, '先完成时间工坊并穿过 2126 的西侧通道', 'info');
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
        return fail(state, '时序档案位于 2126 的西侧通道内', 'info');
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

export function storyObjectiveView(
  state: StoryState,
  causality: CausalityState,
): ObjectiveView {
  const total = STORY_OBJECTIVE_TOTAL;
  switch (state.stage) {
    case 'gallery-intro':
      return { step: 1, total, title: '画廊：选一幅画，进入街道', done: false };

    case 'street':
      return { step: 2, total, title: '街道：取得折时仪', done: false };

    case 'bridge':
      return { step: 2, total, title: '跳起，按 E 接住桥面', done: false };

    case 'corridor':
      return { step: 2, total, title: '绕行坍塌走廊', done: false };

    case 'workshop': {
      let title: string;
      if (causality.crystal.kind === 'world') {
        title = '时间工坊：取回能源晶体';
      } else if (causality.crystal.kind === 'inventory') {
        title = '时间工坊：放入发电机';
      } else if (!causality.pastDeviceActivated) {
        title = '时间工坊：启动过去机关';
      } else if (!causality.chamberVisited) {
        title = '时间工坊：进入西侧通道';
      } else {
        title = '时间工坊：读取时序档案';
      }
      return { step: 3, total, title, done: false };
    }

    case 'archive':
      return { step: 4, total, title: '读取时序档案', done: false };

    case 'terminal':
      return { step: 5, total, title: '终末画布核心：关闭时间封锁', done: false };

    case 'return-gallery':
      return { step: 6, total, title: '回画廊，留下第一笔颜色', done: false };

    case 'complete':
      return {
        step: 6,
        total,
        title: '主线完成：The future is not written.',
        done: true,
      };
  }
}

export function storyStatusView(stage: StoryState['stage']): string {
  switch (stage) {
    case 'gallery-intro':
      return '最后的画廊';
    case 'street':
      return '街道 · 折时仪';
    case 'bridge':
      return '街道桥面 · 跳起按 E';
    case 'corridor':
      return '坍塌走廊';
    case 'workshop':
      return '时间工坊';
    case 'archive':
      return '时序档案';
    case 'terminal':
      return '终末画布核心';
    case 'return-gallery':
      return '画廊 · 空白画布';
    case 'complete':
      return '主线完成';
  }
}

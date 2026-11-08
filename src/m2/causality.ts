import type { EraId } from '../world/types';
import {
  CRYSTAL_ITEM_ID,
  type CausalityState,
  type InteractionAction,
  type InteractionOutcome,
  type ObjectiveView,
} from './types';

export interface InteractionContext {
  readonly era: EraId;
}

interface Reduction {
  readonly state: CausalityState;
  readonly outcome: InteractionOutcome;
}

/** Initial deterministic state of the M2 causal chain. */
export function initialCausality(): CausalityState {
  return {
    crystal: { kind: 'world', era: '2126', anchor: 'pedestal-2126' },
    generatorEnergized: false,
    pastDeviceActivated: false,
    futureGateOpen: false,
    chamberVisited: false,
    revision: 0,
  };
}

function fail(
  state: CausalityState,
  message: string,
  tone: 'error' | 'info' = 'error',
): Reduction {
  return {
    state,
    outcome: { changed: false, ok: false, message, tone },
  };
}

function succeed(state: CausalityState, message: string): Reduction {
  return {
    state,
    outcome: { changed: true, ok: true, message, tone: 'success' },
  };
}

/**
 * Pure, deterministic reducer for the M2 causal chain.
 *
 * Interaction code only produces an `InteractionAction`; every state change
 * (and every rejection message) happens here, based solely on the current
 * `CausalityState` and the active era. No time, input timing or RNG is read.
 */
export function reduceCausality(
  state: CausalityState,
  action: InteractionAction,
  context: InteractionContext,
): Reduction {
  switch (action.type) {
    case 'pickup-crystal': {
      if (action.itemId !== CRYSTAL_ITEM_ID) {
        return fail(state, '未知物品 ID，无法拾取');
      }
      if (context.era !== '2126') {
        return fail(state, '能源晶体只在 2126 存在');
      }
      if (state.crystal.kind === 'inventory') {
        return fail(state, '手中已经拿着能源晶体：只能手持一件物品', 'info');
      }
      if (state.crystal.kind !== 'world') {
        return fail(state, '能源晶体已经装入 2026 的发电机', 'info');
      }
      return succeed(
        { ...state, crystal: { kind: 'inventory' }, revision: state.revision + 1 },
        `已拾取能源晶体（唯一 ID ${CRYSTAL_ITEM_ID}）`,
      );
    }

    case 'insert-crystal': {
      if (action.itemId !== CRYSTAL_ITEM_ID) {
        return fail(state, '发电机需要能量晶体，无法使用该物品');
      }
      if (context.era !== '2026') {
        return fail(state, '需要回到 2026 才能启动发电机');
      }
      if (state.crystal.kind === 'socket') {
        return fail(state, '发电机的能源晶体已经就位并运转中', 'info');
      }
      if (state.crystal.kind !== 'inventory') {
        return fail(state, '手中没有能源晶体：先到 2126 取得晶体');
      }
      return succeed(
        {
          ...state,
          crystal: { kind: 'socket', socket: 'generator-2026' },
          generatorEnergized: true,
          revision: state.revision + 1,
        },
        '能源晶体已装入发电机：2026 的发电机开始运转',
      );
    }

    case 'operate-past-device': {
      if (context.era !== '2026') {
        return fail(state, '过去机械装置位于 2026，当前时代无法操作');
      }
      if (!state.generatorEnergized) {
        return fail(state, '机关没有能量：先启动发电机');
      }
      if (state.pastDeviceActivated) {
        return fail(state, '过去机关已经启动：2126 的通道保持开启', 'info');
      }
      return succeed(
        {
          ...state,
          pastDeviceActivated: true,
          futureGateOpen: true,
          revision: state.revision + 1,
        },
        '过去机关已启动：2126 的通道在因果上被开启了',
      );
    }

    case 'enter-chamber': {
      if (context.era !== '2126') {
        return fail(state, '被开启的通道只存在于 2126');
      }
      if (!state.futureGateOpen) {
        return fail(state, '通道仍然封闭，无法通过');
      }
      if (state.chamberVisited) {
        return fail(state, '已经记录过这次穿过通道的观察', 'info');
      }
      return succeed(
        { ...state, chamberVisited: true, revision: state.revision + 1 },
        '你穿过了被开启的通道：过去的选择改变了 2126',
      );
    }
  }
}

export function heldItemLabel(state: CausalityState): string {
  return state.crystal.kind === 'inventory'
    ? `手持：能源晶体（${CRYSTAL_ITEM_ID}）`
    : '手持：空';
}

export function crystalLocationLabel(state: CausalityState): string {
  switch (state.crystal.kind) {
    case 'world':
      return '2126 基座';
    case 'inventory':
      return '在你手中';
    case 'socket':
      return '2026 发电机';
  }
}

export function statusView(state: CausalityState): string {
  const gate = state.futureGateOpen ? '已开启' : '封闭';
  const generator = state.generatorEnergized ? '运转' : '未启动';
  return `晶体：${crystalLocationLabel(state)} · 发电机：${generator} · 2126 通道：${gate}`;
}

/** Data-driven M2 objective text; HUD renders this and never owns state. */
export function objectiveView(state: CausalityState): ObjectiveView {
  if (state.chamberVisited) {
    return { step: 4, total: 4, title: '因果链完成：过去的选择改变了 2126', done: true };
  }
  if (state.pastDeviceActivated) {
    return { step: 4, total: 4, title: '返回 2126，穿过已被开启的通道', done: false };
  }
  if (state.generatorEnergized) {
    return { step: 3, total: 4, title: '在 2026 操作过去的机械装置（F）', done: false };
  }
  if (state.crystal.kind === 'inventory') {
    return { step: 2, total: 4, title: '把能源晶体带回 2026，放入发电机（F）', done: false };
  }
  return { step: 1, total: 4, title: '前往 2126，找到并拾取唯一的能源晶体（F）', done: false };
}

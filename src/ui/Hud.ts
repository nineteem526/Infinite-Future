import type { ObjectiveView } from '../m2/types';
import type { EraId } from '../world/types';
import type { HudPort } from '../time/TimeShift';

interface HudCallbacks {
  onEnter: () => void;
}

/**
 * DOM HUD: start overlay, crosshair, era badge, control hint, switch toast and
 * a small status line. Written entirely in Chinese to match the project brief.
 */
export class Hud implements HudPort {
  private readonly root: HTMLDivElement;
  private readonly overlay: HTMLDivElement;
  private readonly crosshair: HTMLDivElement;
  private readonly badge: HTMLDivElement;
  private readonly badgeTitle: HTMLSpanElement;
  private readonly badgeSubtitle: HTMLSpanElement;
  private readonly objectivePanel: HTMLDivElement;
  private readonly objectiveEyebrow: HTMLSpanElement;
  private readonly objectiveTitle: HTMLDivElement;
  private readonly objectiveStatus: HTMLDivElement;
  private readonly held: HTMLDivElement;
  private readonly interactionPrompt: HTMLDivElement;
  private readonly hint: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private switches = 0;
  private rejections = 0;

  constructor(container: HTMLElement, callbacks: HudCallbacks) {
    this.root = document.createElement('div');
    this.root.className = 'hud';

    this.crosshair = document.createElement('div');
    this.crosshair.className = 'crosshair';
    this.crosshair.setAttribute('aria-hidden', 'true');

    this.badge = document.createElement('div');
    this.badge.className = 'era-badge era-2026';
    const badgeLabel = document.createElement('span');
    badgeLabel.className = 'era-badge-label';
    badgeLabel.textContent = '当前时代';
    this.badgeTitle = document.createElement('span');
    this.badgeTitle.className = 'era-badge-title';
    this.badgeSubtitle = document.createElement('span');
    this.badgeSubtitle.className = 'era-badge-subtitle';
    this.badge.append(badgeLabel, this.badgeTitle, this.badgeSubtitle);

    this.objectivePanel = document.createElement('div');
    this.objectivePanel.className = 'objective';
    this.objectiveEyebrow = document.createElement('span');
    this.objectiveEyebrow.className = 'objective-eyebrow';
    this.objectiveEyebrow.textContent = '目标 1 / 4';
    this.objectiveTitle = document.createElement('div');
    this.objectiveTitle.className = 'objective-title';
    this.objectiveStatus = document.createElement('div');
    this.objectiveStatus.className = 'objective-status';
    this.objectivePanel.append(this.objectiveEyebrow, this.objectiveTitle, this.objectiveStatus);

    this.held = document.createElement('div');
    this.held.className = 'held';
    this.held.textContent = '手持：空';

    this.interactionPrompt = document.createElement('div');
    this.interactionPrompt.className = 'interact-prompt';

    this.hint = document.createElement('div');
    this.hint.className = 'hint';

    this.toast = document.createElement('div');
    this.toast.className = 'toast';
    this.toast.setAttribute('role', 'status');
    this.toast.setAttribute('aria-live', 'polite');

    this.stats = document.createElement('div');
    this.stats.className = 'stats';

    this.overlay = document.createElement('div');
    this.overlay.className = 'overlay';
    this.overlay.innerHTML = `
      <div class="overlay-card">
        <p class="overlay-eyebrow">INFINITE FUTURE · M2 因果原型</p>
        <h1 class="overlay-title">双时代因果测试场</h1>
        <p class="overlay-subtitle">2026 暖金广场 &nbsp;/&nbsp; 2126 铅灰废墟</p>
        <ul class="overlay-controls">
          <li><span class="key">W A S D</span><span>移动</span></li>
          <li><span class="key">鼠标</span><span>观察（点击后锁定）</span></li>
          <li><span class="key">空格</span><span>跳跃</span></li>
          <li><span class="key">E</span><span>切换时代（保持位置、视角、速度）</span></li>
          <li><span class="key">F</span><span>拾取 / 放入 / 操作机关</span></li>
          <li><span class="key">R</span><span>重置因果链</span></li>
        </ul>
        <p class="overlay-note">两个时代已预加载；目标位置被障碍占据时会尝试移至附近安全位置。能源晶体只能携带一件。</p>
        <button type="button" class="enter-button">点击进入测试场</button>
      </div>
    `;

    this.overlay.addEventListener('click', () => {
      this.hideOverlay();
      callbacks.onEnter();
    });

    this.root.append(
      this.crosshair,
      this.badge,
      this.objectivePanel,
      this.hint,
      this.interactionPrompt,
      this.held,
      this.toast,
      this.stats,
      this.overlay,
    );
    container.append(this.root);

    this.setEra('2026', '暖金广场', 'Vernaux · 最后的画廊外庭');
    this.setPointerLocked(false);
    this.setStats(0);
  }

  setEra(era: EraId, name: string, description: string): void {
    this.badge.className = `era-badge era-${era}`;
    this.badgeTitle.textContent = `${era} · ${name}`;
    this.badgeSubtitle.textContent = description;
  }

  setPointerLocked(locked: boolean): void {
    this.hint.textContent = locked
      ? 'WASD 移动 · 鼠标 观察 · 空格 跳跃 · E 切换 · F 交互 · R 重置 · Esc 释放鼠标'
      : '点击画面锁定鼠标 · WASD 移动 · 空格 跳跃 · E 切换 · F 交互 · R 重置';
  }

  /** Renders the data-driven M2 objective; called only when text changes. */
  setObjective(objective: ObjectiveView, status: string): void {
    this.objectivePanel.classList.toggle('done', objective.done);
    this.objectiveEyebrow.textContent = objective.done
      ? '因果链完成'
      : `目标 ${objective.step} / ${objective.total}`;
    this.objectiveTitle.textContent = objective.title;
    this.objectiveStatus.textContent = status;
  }

  setHeld(text: string): void {
    this.held.textContent = text;
  }

  setInteractionPrompt(text: string | null): void {
    if (text === null) {
      this.interactionPrompt.textContent = '';
      this.interactionPrompt.classList.remove('visible');
      return;
    }
    this.interactionPrompt.textContent = text;
    this.interactionPrompt.classList.add('visible');
  }

  setStats(fps: number): void {
    const fpsText = fps > 0 ? `FPS ${Math.round(fps)}` : 'FPS —';
    this.stats.textContent = `${fpsText} · 切换 ${this.switches} · 已拒绝 ${this.rejections}`;
  }

  setSwitchStats(switches: number, rejections: number): void {
    this.switches = switches;
    this.rejections = rejections;
    this.refreshStatsText();
  }

  showToast(message: string, kind: 'error' | 'info'): void {
    this.toast.textContent = message;
    this.toast.className = kind === 'error' ? 'toast toast-error visible' : 'toast toast-info visible';
    if (this.toastTimer !== null) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.classList.remove('visible');
    }, 2600);
  }

  hideOverlay(): void {
    this.overlay.classList.add('hidden');
  }

  /** Test/debug accessor: current toast text ('' when nothing is shown). */
  currentToastText(): string {
    return this.toast.classList.contains('visible') ? this.toast.textContent ?? '' : '';
  }

  get isOverlayVisible(): boolean {
    return !this.overlay.classList.contains('hidden');
  }

  private refreshStatsText(): void {
    const previous = this.stats.textContent ?? '';
    const fpsPart = previous.startsWith('FPS') ? previous.split(' · ')[0] : 'FPS —';
    this.stats.textContent = `${fpsPart} · 切换 ${this.switches} · 已拒绝 ${this.rejections}`;
  }

  updateFps(fps: number): void {
    this.refreshStatsText();
    const fpsPart = fps > 0 ? `FPS ${Math.round(fps)}` : 'FPS —';
    this.stats.textContent = `${fpsPart} · 切换 ${this.switches} · 已拒绝 ${this.rejections}`;
  }
}

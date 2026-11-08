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
        <p class="overlay-eyebrow">INFINITE FUTURE · M1 原型</p>
        <h1 class="overlay-title">双时代几何测试场</h1>
        <p class="overlay-subtitle">2026 暖金广场 &nbsp;/&nbsp; 2126 铅灰废墟</p>
        <ul class="overlay-controls">
          <li><span class="key">W A S D</span><span>移动</span></li>
          <li><span class="key">鼠标</span><span>观察（点击后锁定）</span></li>
          <li><span class="key">空格</span><span>跳跃</span></li>
          <li><span class="key">E</span><span>切换时代（保持位置、视角、速度）</span></li>
        </ul>
        <p class="overlay-note">两个时代已预加载，切换不加载资源、不刷新页面。目标位置被障碍占据时会尝试移至附近安全位置。</p>
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
      this.hint,
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
      ? 'WASD 移动 · 鼠标 观察 · 空格 跳跃 · E 切换时代 · Esc 释放鼠标'
      : '点击画面锁定鼠标 · WASD 移动 · 空格 跳跃 · E 切换时代';
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

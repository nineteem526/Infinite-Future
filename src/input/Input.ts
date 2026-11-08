import type { LookDelta } from '../core/types';

// Bound an abnormally large input burst without changing ordinary mouse movement.
const MAX_LOOK_BURST = 360;

interface InputCallbacks {
  onFirstInteraction?: () => void;
  onInteraction?: () => void;
  onPointerLockChange?: (locked: boolean) => void;
}

/**
 * Keyboard / mouse input. Edge-triggered actions are queued so the fixed-step
 * update consumes each request once, in order, regardless of frame timing.
 */
export class Input {
  readonly canvas: HTMLCanvasElement;

  pointerLocked = false;

  private readonly keys = new Set<string>();
  private switchQueued = 0;
  private jumpQueued = 0;
  private interactQueued = 0;
  private resetQueued = 0;
  private lookX = 0;
  private lookY = 0;
  private lookEventsAllowed = false;
  private interacted = false;
  private callbacks: InputCallbacks = {};
  private readonly disposers: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.attach();
  }

  setCallbacks(callbacks: InputCallbacks): void {
    this.callbacks = callbacks;
  }

  /** Test-only: allow programmatic mousemove events without pointer lock. */
  setLookEventsAllowed(allowed: boolean): void {
    this.lookEventsAllowed = allowed;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  consumeLook(): LookDelta {
    const delta = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
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

  consumeInteract(): boolean {
    if (this.interactQueued <= 0) return false;
    this.interactQueued -= 1;
    return true;
  }

  consumeReset(): boolean {
    if (this.resetQueued <= 0) return false;
    this.resetQueued -= 1;
    return true;
  }

  get queuedSwitches(): number {
    return this.switchQueued;
  }

  get queuedInteractions(): number {
    return this.interactQueued;
  }

  requestPointerLock(): void {
    if (this.pointerLocked) return;
    try {
      const result = this.canvas.requestPointerLock() as unknown;
      if (result instanceof Promise) result.catch(() => undefined);
    } catch {
      // Pointer lock may be unavailable (e.g. automated/headless contexts).
    }
  }

  dispose(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers.length = 0;
    this.keys.clear();
  }

  private attach(): void {
    const onKeyDown = (event: KeyboardEvent) => {
      this.noteInteraction();
      this.keys.add(event.code);
      if (event.code === 'Space') {
        event.preventDefault();
        if (!event.repeat) this.jumpQueued += 1;
      } else if (event.code === 'KeyE') {
        event.preventDefault();
        if (!event.repeat) this.switchQueued += 1;
      } else if (event.code === 'KeyF') {
        event.preventDefault();
        if (!event.repeat) this.interactQueued += 1;
      } else if (event.code === 'KeyR') {
        // Never hijack browser reload (Ctrl/Cmd+R) or other modified shortcuts.
        if (event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        if (!event.repeat) this.resetQueued += 1;
      }
    };

    const onKeyUp = (event: KeyboardEvent) => {
      this.keys.delete(event.code);
    };

    const clearLook = () => {
      this.lookX = 0;
      this.lookY = 0;
    };

    const onBlur = () => {
      this.keys.clear();
      clearLook();
    };

    const onVisibilityChange = () => {
      if (document.hidden) onBlur();
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!this.pointerLocked && !this.lookEventsAllowed) return;
      if (!Number.isFinite(event.movementX) || !Number.isFinite(event.movementY)) return;
      const x = this.lookX + event.movementX;
      const y = this.lookY + event.movementY;
      const magnitude = Math.hypot(x, y);
      const scale = magnitude > MAX_LOOK_BURST ? MAX_LOOK_BURST / magnitude : 1;
      this.lookX = x * scale;
      this.lookY = y * scale;
    };

    const onCanvasClick = () => {
      this.noteInteraction();
      this.requestPointerLock();
    };

    const onPointerLockChange = () => {
      const locked = document.pointerLockElement === this.canvas;
      if (this.pointerLocked !== locked) clearLook();
      this.pointerLocked = locked;
      this.callbacks.onPointerLockChange?.(locked);
    };

    const onPointerLockError = () => {
      this.pointerLocked = false;
      clearLook();
      this.callbacks.onPointerLockChange?.(false);
    };

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', onPointerLockError);
    this.canvas.addEventListener('click', onCanvasClick);
    this.canvas.addEventListener('contextmenu', onContextMenu);

    this.disposers.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
      () => document.removeEventListener('mousemove', onMouseMove),
      () => document.removeEventListener('visibilitychange', onVisibilityChange),
      () => document.removeEventListener('pointerlockchange', onPointerLockChange),
      () => document.removeEventListener('pointerlockerror', onPointerLockError),
      () => this.canvas.removeEventListener('click', onCanvasClick),
      () => this.canvas.removeEventListener('contextmenu', onContextMenu),
    );
  }

  private noteInteraction(): void {
    this.callbacks.onInteraction?.();
    if (this.interacted) return;
    this.interacted = true;
    this.callbacks.onFirstInteraction?.();
  }
}

import type { AudioPort } from '../time/TimeShift';
import type { EraId } from '../world/types';

type AudioContextConstructor = new () => AudioContext;

interface AudioState {
  started: boolean;
  disabled: boolean;
  era: EraId;
  contextState: string;
}

/**
 * Minimal deterministic ambience: a warm 2026 chord and a cold 2126 drone,
 * crossfaded inside the same synchronous time-shift transaction. Audio starts
 * only after a user gesture and degrades silently if WebAudio is unavailable.
 */
export class Ambience implements AudioPort {
  private context: AudioContext | null = null;
  private gains: Record<EraId, GainNode> | null = null;
  private oscillators: OscillatorNode[] = [];
  private currentEra: EraId = '2026';
  private started = false;
  private disabled = false;

  ensureStarted(): void {
    if (this.started || this.disabled) return;

    const ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
    if (!ctor) {
      this.disabled = true;
      return;
    }

    try {
      const context = new ctor();
      const master = context.createGain();
      master.gain.value = 0.045;
      master.connect(context.destination);

      const warm = context.createGain();
      const cold = context.createGain();
      warm.gain.value = 0;
      cold.gain.value = 0;
      warm.connect(master);
      cold.connect(master);

      this.buildWarmChord(context, warm);
      this.buildColdDrone(context, cold);

      this.context = context;
      this.gains = { '2026': warm, '2126': cold };
      this.started = true;

      // Apply the era we are currently in, then attempt to resume.
      this.applyGains(this.currentEra, 0.01);
      void context.resume().catch(() => undefined);
    } catch {
      this.disabled = true;
    }
  }

  setEra(era: EraId): void {
    this.currentEra = era;
    if (!this.started || !this.context || !this.gains) return;
    this.applyGains(era, 0.08);
  }

  get state(): AudioState {
    return {
      started: this.started,
      disabled: this.disabled,
      era: this.currentEra,
      contextState: this.context?.state ?? 'none',
    };
  }

  dispose(): void {
    for (const oscillator of this.oscillators) {
      try {
        oscillator.stop();
      } catch {
        // Already stopped.
      }
    }
    this.oscillators = [];
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.started = false;
  }

  private applyGains(active: EraId, smoothing: number): void {
    if (!this.context || !this.gains) return;
    const now = this.context.currentTime;
    this.gains[active].gain.setTargetAtTime(1, now, smoothing);
    const inactive: EraId = active === '2026' ? '2126' : '2026';
    this.gains[inactive].gain.setTargetAtTime(0, now, smoothing);
  }

  private buildWarmChord(context: AudioContext, output: GainNode): void {
    for (const frequency of [220, 277.18, 329.63]) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const voice = context.createGain();
      voice.gain.value = 0.18;
      oscillator.connect(voice);
      voice.connect(output);
      oscillator.start();
      this.oscillators.push(oscillator);
    }
  }

  private buildColdDrone(context: AudioContext, output: GainNode): void {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 0.6;
    filter.connect(output);

    for (const frequency of [110, 146.83]) {
      const oscillator = context.createOscillator();
      oscillator.type = 'sawtooth';
      oscillator.frequency.value = frequency;
      const voice = context.createGain();
      voice.gain.value = 0.07;
      oscillator.connect(voice);
      voice.connect(filter);
      oscillator.start();
      this.oscillators.push(oscillator);
    }
  }
}

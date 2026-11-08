import { Ambience } from '../audio/Ambience';

// Exercise the autoplay recovery path without depending on hardware output.
class Param {
  value = 0;
  setTargetAtTime(value: number): void { this.value = value; }
}
class Node {
  gain = new Param(); frequency = new Param(); Q = new Param(); type = '';
  connect(): void {} start(): void {} stop(): void {}
}
class FakeContext {
  static instance: FakeContext;
  state = 'suspended'; currentTime = 0; destination = new Node(); resumeCalls = 0;
  constructor() { FakeContext.instance = this; }
  createGain(): Node { return new Node(); }
  createOscillator(): Node { return new Node(); }
  createBiquadFilter(): Node { return new Node(); }
  resume(): Promise<void> { this.resumeCalls++; return Promise.resolve(); }
  close(): Promise<void> { return Promise.resolve(); }
}
Object.defineProperty(globalThis, 'window', { value: { AudioContext: FakeContext }, configurable: true });
const audio = new Ambience();
audio.ensureStarted();
if (FakeContext.instance.resumeCalls !== 1) throw new Error('Initial resume not attempted');
audio.ensureStarted();
if (Number(FakeContext.instance.resumeCalls) !== 2) throw new Error('Suspended context was not retried');
FakeContext.instance.state = 'running';
audio.setEra('2126');
audio.ensureStarted();
if (audio.state.era !== '2126' || audio.state.contextState !== 'running' || Number(FakeContext.instance.resumeCalls) !== 2) {
  throw new Error('Audio state or running context is incorrect');
}
audio.dispose();
console.log('Audio recovery checks passed');


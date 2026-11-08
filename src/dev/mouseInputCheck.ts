import { Input } from '../input/Input';

class FakeDocument extends EventTarget {
  pointerLockElement: unknown = null;
  hidden = false;
}
class FakeCanvas extends EventTarget {}
const fakeWindow = new EventTarget();
const fakeDocument = new FakeDocument();
const canvas = new FakeCanvas();
Object.defineProperty(globalThis, 'window', { value: fakeWindow, configurable: true });
Object.defineProperty(globalThis, 'document', { value: fakeDocument, configurable: true });
const input = new Input(canvas as unknown as HTMLCanvasElement);
const move = (x: number, y: number) => fakeDocument.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: x, movementY: y }));
const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); console.log(`PASS: ${message}`); };

move(10, 20);
check(input.consumeLook().x === 0, 'unlocked mouse movement is ignored');
fakeDocument.pointerLockElement = canvas;
fakeDocument.dispatchEvent(new Event('pointerlockchange'));
move(30, -15); move(10, 5);
let delta = input.consumeLook();
check(delta.x === 40 && delta.y === -10, 'ordinary movement is preserved');
move(5000, 0);
delta = input.consumeLook();
check(delta.x === 360 && delta.y === 0, 'abnormal input burst is limited');
move(200, 0); move(200, 0);
delta = input.consumeLook();
check(delta.x === 360, 'accumulated burst is limited');
move(45, 20); fakeWindow.dispatchEvent(new Event('blur'));
check(input.consumeLook().x === 0 && input.consumeLook().y === 0, 'focus loss clears queued movement');
move(45, 20); fakeDocument.pointerLockElement = null;
fakeDocument.dispatchEvent(new Event('pointerlockchange'));
check(input.consumeLook().x === 0 && input.consumeLook().y === 0, 'unlock clears queued movement');
fakeDocument.pointerLockElement = canvas; fakeDocument.dispatchEvent(new Event('pointerlockchange'));
move(40, 12); fakeDocument.hidden = true; fakeDocument.dispatchEvent(new Event('visibilitychange'));
check(input.consumeLook().x === 0 && input.consumeLook().y === 0, 'hidden tab clears queued movement');
input.dispose();
console.log('MOUSE INPUT CHECK PASSED');

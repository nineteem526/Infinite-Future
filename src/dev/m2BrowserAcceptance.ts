import type { M2TestApi } from './TestApi';

/** Runs the integrated M2 path in an actual browser and WebGL game loop. */
export function installM2Acceptance(api: M2TestApi): void {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;z-index:10000;right:8px;top:8px;background:#111;color:white;padding:12px;font:14px sans-serif;max-width:430px';
  const button = document.createElement('button'); button.textContent = '运行 M2 浏览器验收';
  const output = document.createElement('pre'); output.style.whiteSpace = 'pre-wrap';
  panel.append(button, output); document.body.append(panel);
  button.addEventListener('click', async () => {
    button.disabled = true;
    const lines: string[] = [];
    const check = (ok: boolean, label: string) => { lines.push(`${ok ? 'PASS' : 'FAIL'}: ${label}`); if (!ok) throw new Error(label); };
    const wait = async (predicate: () => boolean) => {
      for (let i = 0; i < 240 && !predicate(); i++) await api.step(2);
      if (!predicate()) throw new Error('等待游戏状态超时');
    };
    const switchTo = async (era: '2026' | '2126') => {
      api.teleport(0, 0.92, 20); await api.step(6);
      if (api.state().era !== era) { api.switchEra(); await wait(() => api.state().era === era); }
    };
    const interact = async (expectedRevision: number) => {
      api.press('KeyF'); api.release('KeyF');
      await wait(() => api.state().causality.revision === expectedRevision);
    };
    try {
      api.resetRun(); await api.step(6);
      check(api.state().causality.crystal.kind === 'world' && api.state().gateCollision.closed, '初始晶体与关闭闸门');
      check(api.probe('2126', -18, 1.9, 0).blocked, '关闭闸门参与切换目标碰撞');
      await switchTo('2126'); api.teleport(6, 0.92, 2.2); await api.step(6); await interact(1);
      check(api.state().causality.crystal.kind === 'inventory' && api.state().presentation.visibleCrystalVisuals.length === 1, 'F 拾取唯一晶体');
      await switchTo('2026');
      check(api.state().causality.crystal.kind === 'inventory', '携带晶体跨时代');
      api.teleport(10, 0.92, 2.2); await api.step(6); await interact(2);
      check(api.state().causality.generatorEnergized && api.state().causality.crystal.kind === 'socket', 'F 将晶体放入发电机');
      api.teleport(-10, 0.92, 1.8); await api.step(6); await interact(3);
      check(api.state().causality.futureGateOpen && !api.state().gateCollision.closed, '过去机关开启未来闸门');
      check(!api.probe('2126', -18, 1.9, 0).blocked, '开启后目标碰撞移除');
      await switchTo('2126'); api.teleport(-16, 0.92, 0, Math.PI / 2); await api.step(8);
      api.press('KeyW'); await wait(() => api.state().pose.position.x < -18.7); api.release('KeyW');
      await wait(() => api.state().causality.chamberVisited);
      check(api.state().causality.chamberVisited, '玩家实际走过开启的通道');
      api.press('KeyR'); api.release('KeyR'); await wait(() => api.state().causality.revision === 0);
      check(api.state().causality.crystal.kind === 'world' && api.state().gateCollision.closed, 'R 重置晶体与闸门');
      check(api.state().errors.length === 0, '浏览器无运行时异常');
      output.textContent = lines.join('\n') + '\nM2 BROWSER ACCEPTANCE PASSED';
    } catch (error) { api.release('KeyW'); output.textContent = lines.join('\n') + `\nM2 BROWSER ACCEPTANCE FAILED: ${String(error)}`; }
    finally { button.disabled = false; }
  });
}

import type { M1TestApi } from './TestApi';

/** Interactive browser-only acceptance for the running game, enabled by ?acceptance=1. */
export function installBrowserAcceptance(api: M1TestApi): void {
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;z-index:10000;right:8px;top:8px;background:#111;color:#fff;padding:12px;font:14px sans-serif;max-width:420px';
  const button = document.createElement('button');
  button.textContent = '运行 M1 浏览器验收';
  const result = document.createElement('pre');
  result.style.whiteSpace = 'pre-wrap';
  panel.append(button, result);
  document.body.append(panel);
  button.addEventListener('click', async () => {
    button.disabled = true;
    const checks: string[] = [];
    const check = (condition: boolean, name: string) => {
      checks.push(`${condition ? 'PASS' : 'FAIL'}: ${name}`);
      if (!condition) throw new Error(name);
    };
    try {
      api.teleport(0, 0.92, 20);
      await api.step(8);
      if (api.state().era !== '2026') { api.switchEra(); await api.step(4); }
      check(api.state().era === '2026', '准备 2026 安全位置');
      api.teleport(0, 0.92, 6);
      await api.step(4);
      const before = api.state();
      api.switchEra();
      await api.step(4);
      const blocked = api.state();
      check(blocked.era === '2126' && blocked.rejectionCount === before.rejectionCount && blocked.hud.toast.includes('避开'), '目标墙体附近自动寻找安全落点');
      check(Math.hypot(blocked.pose.position.x - before.pose.position.x, blocked.pose.position.z - before.pose.position.z) <= 2.05 && !api.probe('2126', blocked.pose.position.x, blocked.pose.position.y, blocked.pose.position.z).blocked, '新位置安全且距离不超过 2 米');
      api.teleport(0, 0.92, 20);
      await api.step(4);
      api.switchEra();
      await api.step(4);
      await api.step(8);
      api.press('Space'); api.release('Space');
      await api.step(4);
      const airborne = api.state();
      check(airborne.pose.velocity.y > 0 && !airborne.pose.grounded, '实际跳跃中处于上升阶段');
      const fromY = airborne.pose.position.y;
      api.switchEra();
      await api.step(2);
      const shifted = api.state();
      check(shifted.era === '2126' && shifted.pose.velocity.y > 0 && shifted.pose.position.y >= fromY, '空中切换后继续上升');
      check(shifted.visibleEra === '2126' && shifted.audio.era === '2126', '画面和音频时代一致');
      check(shifted.errors.length === 0, '无运行时异常');
      result.textContent = checks.join('\n') + '\nBROWSER ACCEPTANCE PASSED';
    } catch (error) {
      result.textContent = checks.join('\n') + `\nBROWSER ACCEPTANCE FAILED: ${String(error)}`;
    } finally { button.disabled = false; }
  });
}

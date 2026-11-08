import './style.css';
import { Game } from './core/Game';
import { installTestApi } from './dev/TestApi';
import { installBrowserAcceptance } from './dev/browserAcceptance';
import { installM2Acceptance } from './dev/m2BrowserAcceptance';

const errors: string[] = [];

window.addEventListener('error', (event) => {
  errors.push(event.message || 'unknown window error');
});

window.addEventListener('unhandledrejection', (event) => {
  errors.push(`unhandled rejection: ${String(event.reason)}`);
});

function showFatal(container: HTMLElement, error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  container.replaceChildren();
  const fatal = document.createElement('div');
  fatal.className = 'fatal';
  fatal.textContent = [
    'Infinite Future — M1 原型启动失败',
    '',
    message,
    '',
    '请检查浏览器控制台中的完整错误信息。',
  ].join('\n');
  container.append(fatal);
}

async function main(): Promise<void> {
  const container = document.getElementById('app');
  if (!container) throw new Error('index.html 缺少 #app 容器');

  const game = await Game.create(container);
  game.start();

  installTestApi(game, errors);
  if (new URLSearchParams(window.location.search).has('acceptance') && window.__M1_TEST__) {
    installBrowserAcceptance(window.__M1_TEST__);
  }
  if (new URLSearchParams(window.location.search).has('m2acceptance') && window.__M2_TEST__) {
    installM2Acceptance(window.__M2_TEST__);
  }
  window.__M1_READY__ = true;
}

main().catch((error: unknown) => {
  errors.push(String(error));
  const container = document.getElementById('app');
  if (container) showFatal(container, error);
  // Keep the failure observable for manual acceptance tooling.
  window.__M1_READY__ = false;
  console.error('[M1] 启动失败', error);
});

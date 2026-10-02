// Captures the plugin's own screens from the live game over CDP, for the website.
//
//   node build/cdp-site-shots.mjs
//
// Each shot names a sidebar page (or a route) and an optional "before" expression
// that sets the page up (switching a tab, expanding a section, …). The game must be
// running through the loader (CDP on 9229).
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const port = process.env.CDP_PORT || '9229';
const outDir = resolve('work/site-shots');
mkdirSync(outDir, { recursive: true });

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const pages = list.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
const pick = pages.find((page) => /out\/renderer\/index\.html/u.test(page.url))
  || pages.find((page) => /ECHO/u.test(page.title || ''))
  || pages[0];
if (!pick) {
  console.error('no renderer page target; is the game running?');
  process.exit(1);
}
console.log('target:', pick.title, pick.url.slice(0, 70));

const socket = new WebSocket(pick.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const send = (method, params = {}) => new Promise((ok, fail) => {
  const id = nextId++;
  pending.set(id, { ok, fail });
  socket.send(JSON.stringify({ id, method, params }));
});
socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.fail(new Error(JSON.stringify(message.error)));
  else entry.ok(message.result);
});
await new Promise((ok, fail) => {
  socket.addEventListener('open', ok, { once: true });
  socket.addEventListener('error', () => fail(new Error('socket error')), { once: true });
});

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || 'eval failed');
  return result.result.value;
};
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

/** Clicks a sidebar entry of the plugin by its label. */
const openSidebarPage = (label) => `(async () => {
  const btn = [...document.querySelectorAll('button.nav-item')]
    .find((b) => (b.textContent || '').includes(${JSON.stringify(label)}));
  if (!btn) return 'no-button';
  btn.click();
  await new Promise((r) => setTimeout(r, 900));
  return 'clicked';
})()`;

const shots = [
  {
    name: '01-playlists',
    note: '我的歌单（插件首页）',
    before: openSidebarPage('多平台音源'),
    prep: `(async () => {
      await new Promise((r) => setTimeout(r, 1200));
      const tab = [...document.querySelectorAll('.mms-nav-tab')].find((t) => t.textContent.includes('我的歌单'));
      tab?.click();
      await new Promise((r) => setTimeout(r, 1200));
      return 'ok';
    })()`,
  },
  {
    name: '02-search',
    note: '搜索页',
    prep: `(async () => {
      const tab = [...document.querySelectorAll('.mms-nav-tab')].find((t) => t.textContent.includes('搜索'));
      tab?.click();
      await new Promise((r) => setTimeout(r, 900));
      return 'ok';
    })()`,
  },
  {
    name: '03-mv-settings',
    note: 'MV 背景设置页（可折叠分区）',
    before: openSidebarPage('MV 背景'),
    prep: `(async () => { await new Promise((r) => setTimeout(r, 1400)); return 'ok'; })()`,
  },
  {
    name: '04-lyrics-mv',
    note: '歌词页 + MV 背景（沉浸式）',
    before: `(async () => {
      // The transport MV button walks to the song page in MV view.
      const mv = document.querySelector('.mms-backdrop-toggle');
      if (mv) mv.click();
      await new Promise((r) => setTimeout(r, 1500));
      return mv ? 'clicked' : 'no-mv-button';
    })()`,
    prep: `(async () => {
      // Open the plugin's own floating panel so it is visible in the shot.
      const panel = document.querySelector('.mms-mv-panel');
      if (panel && panel.dataset.open !== 'true') {
        panel.querySelector('.mms-mv-panel-head')?.click();
      }
      await new Promise((r) => setTimeout(r, 600));
      return panel ? panel.dataset.open : 'no-panel';
    })()`,
  },
  {
    name: '05-mv-drawer',
    note: '歌词页的设置抽屉',
    prep: `(async () => {
      const gear = [...document.querySelectorAll('.mms-mv-panel-action')]
        .find((b) => (b.textContent || '').includes('设置'));
      gear?.click();
      await new Promise((r) => setTimeout(r, 900));
      return gear ? 'clicked' : 'no-gear';
    })()`,
  },
];

for (const shot of shots) {
  if (shot.before) {
    const outcome = await evaluate(shot.before);
    console.log(`${shot.name}: before -> ${outcome}`);
    await sleep(500);
  }
  if (shot.prep) {
    const outcome = await evaluate(shot.prep);
    console.log(`${shot.name}: prep -> ${outcome}`);
    await sleep(400);
  }
  const shotResult = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = resolve(outDir, `${shot.name}.png`);
  writeFileSync(file, Buffer.from(shotResult.data, 'base64'));
  console.log(`  saved ${shot.name}.png  (${shot.note})`);
}

socket.close();
console.log('\nall shots written to', outDir);

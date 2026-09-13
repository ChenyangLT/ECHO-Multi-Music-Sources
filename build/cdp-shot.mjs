// Captures a screenshot of the live ECHO window via CDP so the song background
// can be verified visually rather than only through DOM state.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const port = process.env.CDP_PORT || '9229';
const outFile = resolve(process.argv[2] || './work/echo-screenshot.png');

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const pages = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
const pick = pages.find((page) => /out\/renderer\/index\.html/u.test(page.url))
  || pages.find((page) => /ECHO/u.test(page.title || ''))
  || pages[0];
if (!pick) {
  console.error('no page target');
  process.exit(1);
}
console.log('target:', pick.title, pick.url.slice(0, 80));

const socket = new WebSocket(pick.webSocketDebuggerUrl);
let nextId = 1;
const pending = new Map();
const send = (method, params = {}) =>
  new Promise((resolveCall, rejectCall) => {
    const id = nextId++;
    pending.set(id, { resolveCall, rejectCall });
    socket.send(JSON.stringify({ id, method, params }));
  });

socket.addEventListener('message', (event) => {
  const message = JSON.parse(String(event.data));
  const entry = pending.get(message.id);
  if (!entry) return;
  pending.delete(message.id);
  if (message.error) entry.rejectCall(new Error(JSON.stringify(message.error)));
  else entry.resolveCall(message.result);
});

await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener('open', resolveOpen, { once: true });
  socket.addEventListener('error', () => rejectOpen(new Error('socket error')), { once: true });
});

// Report what is on screen at capture time.
const probe = await send('Runtime.evaluate', {
  expression: `JSON.stringify({
    backdropState: document.querySelector('.mms-backdrop')?.dataset.state || null,
    backdropOpacity: getComputedStyle(document.querySelector('.mms-backdrop') || document.body).opacity,
    backdropZIndex: getComputedStyle(document.querySelector('.mms-backdrop') || document.body).zIndex,
    backdropRect: (() => { const r = document.querySelector('.mms-backdrop')?.getBoundingClientRect(); return r ? [r.width, r.height] : null; })(),
    videoPaused: document.querySelector('.mms-backdrop-video')?.paused,
    videoTime: document.querySelector('.mms-backdrop-video')?.currentTime,
    videoSize: [document.querySelector('.mms-backdrop-video')?.videoWidth, document.querySelector('.mms-backdrop-video')?.videoHeight],
    pageVisible: !!document.querySelector('.mms-root'),
  })`,
  returnByValue: true,
});
console.log('probe:', probe.result.value);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(outFile, Buffer.from(shot.data, 'base64'));
console.log('screenshot written:', outFile);
socket.close();

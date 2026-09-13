// Minimal CDP client: evaluates an expression in the ECHO renderer and prints
// the result. Used to confirm the mod actually mounted inside the running game.
// Node >= 22 provides a global WebSocket, so there is no dependency to install.

const port = process.env.CDP_PORT || '9229';
const expression = process.argv[2] || '1+1';

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const pages = targets.filter((target) => target.type === 'page' && target.webSocketDebuggerUrl);
if (!pages.length) {
  console.error('no page targets on port', port);
  process.exit(1);
}
console.log(`targets: ${pages.map((page) => page.title || page.url).join(' | ')}`);

// The QR sign-in flow opens the platform's login page in a hidden window, which
// also registers as a CDP page. Prefer the renderer that actually loads ECHO.
const pick = pages.find((page) => /out\/renderer\/index\.html/u.test(page.url))
  || pages.find((page) => /ECHO/u.test(page.title || ''))
  || pages[0];
const socket = new WebSocket(pick.webSocketDebuggerUrl);

const send = (id, method, params) => socket.send(JSON.stringify({ id, method, params }));

const done = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('cdp timeout')), 45_000);
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id !== 1) return;
    clearTimeout(timer);
    if (message.result?.exceptionDetails) {
      resolve({ error: message.result.exceptionDetails.text || message.result.exceptionDetails.exception?.description });
      return;
    }
    resolve({ value: message.result?.result?.value });
  });
  socket.addEventListener('error', (event) => {
    clearTimeout(timer);
    reject(new Error(`cdp socket error: ${event.message || 'unknown'}`));
  });
});

socket.addEventListener('open', () => {
  send(1, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
});

try {
  const result = await done;
  if (result.error) {
    console.error('EVAL ERROR:', result.error);
    process.exitCode = 1;
  } else {
    console.log('RESULT:', typeof result.value === 'string' ? result.value : JSON.stringify(result.value, null, 2));
  }
} finally {
  socket.close();
}

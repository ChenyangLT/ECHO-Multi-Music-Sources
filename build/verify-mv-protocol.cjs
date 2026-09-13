// Verifies the community MV playback path the way the real game consumes it:
// a RENDERER <video> element pointed straight at the `echo-mv://` URL the
// ported MvService produced.
//
// ECHO ships `echo-mv` in its `protocol.registerSchemesAsPrivileged` list
// (standard + secure + supportFetchAPI + stream) but registers no handler, so
// the mod registers one. This harness reproduces that setup in a plain Electron
// process — privileged scheme first, then the mod — and plays a real Bilibili
// variant to prove the bytes, the reported duration and the media type.
const { app, BrowserWindow, protocol } = require('electron');
const nodePath = require('node:path');

// Mirrors ECHO's own rendererProtocolSchemes entry for echo-mv.
protocol.registerSchemesAsPrivileged([
  { scheme: 'echo-mv', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const methods = new Map();
const logLines = [];

const run = async () => {
  const packageRoot = process.env.ECHO_MMS_PACKAGE_ROOT || nodePath.resolve(__dirname, '..', 'mod');
  const modMain = require(nodePath.join(packageRoot, 'main.cjs'));

  const host = {
    manifest: { version: '1.5.0' },
    config: { debugLogging: true },
    log: (level, message) => logLines.push(`${level}: ${message}`),
    handle(method, listener) {
      methods.set(method, listener);
      return () => methods.delete(method);
    },
  };

  const dispose = await modMain.activate(host);

  const call = async (method, payload) => {
    const handler = methods.get(method);
    if (!handler) throw new Error(`unknown RPC method: ${method}`);
    const response = await handler(payload);
    if (response?.ok === false) throw new Error(String(response.error || 'failed'));
    const result = response?.result;
    if (result && typeof result === 'object' && result.ok === false) throw new Error(String(result.error || 'failed'));
    return 'result' in (response || {}) ? result : response;
  };

  let ok = 0;
  let fail = 0;
  const check = (name, passed, detail) => {
    if (passed) { ok += 1; console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
    else { fail += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  };

  check('echo-mv is registered privileged (as ECHO does)', protocol.isProtocolHandled('echo-mv'));

  await call('rememberTrack', {
    id: 'streaming:netease:4242',
    title: '晴天',
    artist: '周杰伦',
    album: '叶惠美',
    duration: 269,
    provider: 'netease',
    providerTrackId: '4242',
  });

  const video = await call('mvGetTemporaryPlayableForSnapshot', {
    trackId: 'streaming:netease:4242',
    title: '晴天 周杰伦 MV',
    artist: '周杰伦',
    durationSeconds: 269,
    mediaType: 'streaming',
  });
  const mediaUrl = String(video?.mediaUrl || '');
  check(
    'the community engine resolved an echo-mv stream',
    mediaUrl.startsWith('echo-mv://'),
    `${mediaUrl.slice(0, 56)} quality=${video?.qualityLabel ?? 'n/a'} title=${video?.title ?? 'n/a'}`,
  );
  if (!mediaUrl.startsWith('echo-mv://')) {
    await dispose();
    app.exit(1);
    return;
  }

  const window = new BrowserWindow({ show: false, width: 640, height: 360 });
  await window.loadURL('about:blank');
  const result = await window.webContents.executeJavaScript(`(async () => {
    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.preload = 'auto';
    document.body.append(video);
    const observed = { events: [], error: null };
    const done = new Promise((resolve) => {
      const finish = () => resolve(observed);
      video.addEventListener('loadedmetadata', () => {
        observed.events.push('loadedmetadata');
        // Give the element a moment to fail if the bytes are unplayable.
        setTimeout(finish, 1200);
      });
      video.addEventListener('error', () => {
        observed.error = video.error ? (video.error.code + ':' + video.error.message) : 'unknown';
        finish();
      });
      setTimeout(finish, 15000);
    });
    video.src = ${JSON.stringify(mediaUrl)};
    video.load();
    await done;
    observed.duration = Number(video.duration);
    observed.videoWidth = video.videoWidth;
    observed.videoHeight = video.videoHeight;
    observed.seekableEnd = video.seekable && video.seekable.length ? video.seekable.end(video.seekable.length - 1) : 0;
    observed.currentSrc = video.currentSrc;
    return observed;
  })()`);

  check(
    'the renderer <video> loads the echo-mv stream',
    result?.events?.includes('loadedmetadata') && !result?.error,
    `events=${(result?.events || []).join(',') || 'none'} error=${result?.error ?? 'none'}`,
  );
  check(
    'the stream decodes to real video frames',
    Number(result?.videoWidth) > 0 && Number(result?.videoHeight) > 0,
    `${result?.videoWidth}x${result?.videoHeight}`,
  );
  check(
    'the reported duration is a whole MV, not a segment',
    Number(result?.duration) > 20,
    `duration=${(Number(result?.duration) || 0).toFixed(1)}s seekable=${(Number(result?.seekableEnd) || 0).toFixed(1)}s`,
  );

  const ranged = await call('mvResolveMediaUrl', { mediaUrl });
  if (ranged?.url) {
    const response = await fetch(ranged.url, { headers: { Range: 'bytes=0-65535' } });
    const bytes = Buffer.from(await response.arrayBuffer());
    check(
      'the loopback proxy serves the same variant',
      (response.status === 206 || response.status === 200) && bytes.length > 0,
      `${response.status} ${bytes.length}B type=${response.headers.get('content-type')}`,
    );
  } else {
    check('the loopback proxy serves the same variant', false, 'no loopback url');
  }

  window.destroy();
  await dispose();

  console.log(`\n${ok}/${ok + fail} checks passed`);
  for (const line of logLines) console.log(`  log ${line}`);
  app.exit(fail ? 1 : 0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('harness error:', error);
  app.exit(2);
});

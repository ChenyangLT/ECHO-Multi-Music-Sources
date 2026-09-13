// Verifies the QR sign-in flow inside a real Electron main process: it must
// open the platform login page in a hidden window and return a scannable QR
// image, then report a state while polling.
const { app } = require('electron');
const nodePath = require('node:path');

const packageRoot = process.env.ECHO_MMS_PACKAGE_ROOT || nodePath.resolve(__dirname, '..', 'mod');

const run = async () => {
  const loaded = require(nodePath.join(packageRoot, 'bridge', 'provider-bridge.cjs'));
  const bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
    ? loaded.createMultiMusicSourcesBridge()
    : loaded?.default?.createMultiMusicSourcesBridge?.();

  console.log('starting netease QR login...');
  let started;
  try {
    started = await bridge.startQrLogin('netease');
  } catch (error) {
    console.log(`startQrLogin THREW: ${error?.message || error}`);
    app.exit(1);
    return;
  }

  console.log(`state=${started.state} key=${started.key ? 'present' : 'missing'} expiresAt=${started.expiresAt}`);
  const dataUrl = String(started.qrUrl || '');
  console.log(`qrUrl length=${dataUrl.length} prefix=${dataUrl.slice(0, 30)} isPng=${dataUrl.startsWith('data:image/png')}`);

  let polls = 0;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 2500));
    try {
      const polled = await bridge.pollQrLogin({ key: started.key });
      polls += 1;
      console.log(`poll ${attempt}: state=${polled.state} saved=${polled.saved} message=${JSON.stringify(String(polled.message).slice(0, 90))}`);
      if (polled.state === 'expired' || polled.state === 'failed') break;
    } catch (error) {
      console.log(`poll ${attempt} THREW: ${error?.message || error}`);
    }
  }

  console.log(`\npolls=${polls} qrImage=${dataUrl.startsWith('data:image/png') ? 'ok' : 'MISSING'}`);
  app.exit(dataUrl.startsWith('data:image/png') && polls > 0 ? 0 : 1);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});

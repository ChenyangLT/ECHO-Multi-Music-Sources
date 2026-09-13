// Throwaway probe (Electron main): validates the account-store translation and
// the native Bilibili audio resolver against the real ECHO Steam accounts.json,
// copied into a scratch userData directory so the live file is never written.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const realAccounts = path.join(process.env.APPDATA || '', 'ECHO Steam', 'accounts.json');
const realLocalState = path.join(process.env.APPDATA || '', 'ECHO Steam', 'Local State');
const userData = app.getPath('userData');
fs.mkdirSync(userData, { recursive: true });
if (fs.existsSync(realAccounts)) {
  fs.copyFileSync(realAccounts, path.join(userData, 'accounts.json'));
}
// Experiment: replicate ECHO's profile key so the app-bound envelope can be
// opened the way it would be inside the game.
if (process.env.PROBE_COPY_LOCAL_STATE === '1' && fs.existsSync(realLocalState)) {
  fs.copyFileSync(realLocalState, path.join(userData, 'Local State'));
}
const accountsPath = path.join(userData, 'accounts.json');
const before = fs.existsSync(accountsPath) ? fs.readFileSync(accountsPath, 'utf8') : '{}';

const log = (label, value) => console.log(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);

const run = async () => {
  log('userData', userData);
  log('safeStorage available', String(safeStorage.isEncryptionAvailable()));
  let parsed = {};
  try {
    parsed = JSON.parse(before);
  } catch {
    parsed = {};
  }
  log('accounts on disk', {
    netease: Object.keys(parsed.netease || {}),
    bilibili: Object.keys(parsed.bilibili || {}),
    neteaseHasEncrypted: typeof parsed.netease?.encryptedCookie === 'string',
  });

  // Diagnostic: can this Electron build open ECHO's envelope at all?
  const sample = parsed.bilibili?.encryptedCookie;
  if (typeof sample === 'string' && sample.startsWith('safe:')) {
    try {
      const decrypted = safeStorage.decryptString(Buffer.from(sample.slice('safe:'.length), 'base64'));
      log('safeStorage decrypt', `ok len=${String(decrypted).length}`);
    } catch (error) {
      log('safeStorage decrypt FAILED', String(error && error.message));
    }
  }

  const bridgePath = path.resolve(__dirname, '..', 'mod', 'bridge', 'provider-bridge.cjs');
  const loaded = require(bridgePath);
  const bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
    ? loaded.createMultiMusicSourcesBridge()
    : loaded?.default?.createMultiMusicSourcesBridge?.();

  const statuses = bridge.getAccountStatuses();
  log('statuses', statuses.map((item) => ({
    provider: item.provider,
    connected: item.connected,
    displayName: item.displayName,
    avatar: Boolean(item.avatarUrl),
    error: item.error,
  })));

  log('netease credentials', bridge.getAccountCredentials('netease'));
  log('bilibili credentials', bridge.getAccountCredentials('bilibili'));

  try {
    const check = await bridge.checkAccount('bilibili');
    log('bilibili checkAccount', { connected: check.connected, displayName: check.displayName, error: check.error });
  } catch (error) {
    log('bilibili checkAccount FAILED', String(error && error.message));
  }

  try {
    const daily = await bridge.refreshNeteaseDailyRecommend();
    log('netease daily recommend', {
      importedCount: daily?.importedCount,
      playlistId: daily?.playlistId,
      tracks: daily?.tracks?.length,
      first: daily?.tracks?.[0]?.title,
    });
  } catch (error) {
    log('netease daily recommend FAILED', String(error && error.message));
  }

  try {
    const liked = await bridge.syncLikedSongs('netease');
    log('netease liked sync', {
      imported: liked.importedCount,
      added: liked.addedCount,
      playlistId: liked.playlistId,
      tracks: liked?.tracks?.length,
      first: liked?.tracks?.[0]?.title,
    });
  } catch (error) {
    log('netease liked sync FAILED', String(error && error.message));
  }

  log('qr capabilities', bridge.qrLoginCapabilities());

  try {
    const started = await bridge.startQrLogin('bilibili');
    log('bilibili QR start', {
      hasKey: Boolean(started?.key),
      qrPrefix: String(started?.qrUrl || '').slice(0, 32),
      expiresAt: started?.expiresAt,
      message: started?.message,
    });
    const polled = await bridge.pollQrLogin({ key: started.key, provider: 'bilibili' });
    log('bilibili QR poll', polled);
  } catch (error) {
    log('bilibili QR FAILED', String(error && error.message));
  }

  try {
    const started = await bridge.startQrLogin('qqmusic');
    log('qqmusic QR start', {
      hasKey: Boolean(started?.key),
      qrPrefix: String(started?.qrUrl || '').slice(0, 32),
      message: started?.message,
    });
    const polled = await bridge.pollQrLogin({ key: started.key, provider: 'qqmusic' });
    log('qqmusic QR poll', polled);
  } catch (error) {
    log('qqmusic QR FAILED', String(error && error.message));
  }

  try {
    const search = await bridge.search({ provider: 'bilibili', query: '晴天 周杰伦', mediaTypes: ['track'], page: 1, pageSize: 2 });
    const first = search?.tracks?.[0];
    log('bilibili search', { count: search?.tracks?.length, first: first?.title, id: first?.providerTrackId });
    if (first) {
      for (const quality of ['standard', 'high', 'lossless', 'hires']) {
        try {
          const source = await bridge.resolvePlayback({ provider: 'bilibili', providerTrackId: first.providerTrackId, quality });
          log(`bilibili resolvePlayback(${quality})`, {
            url: String(source?.url || '').slice(0, 110),
            mimeType: source?.mimeType,
            codec: source?.codec,
            bitrate: source?.bitrate,
            headerKeys: Object.keys(source?.headers || {}),
          });
        } catch (error) {
          log(`bilibili resolvePlayback(${quality}) FAILED`, String(error && error.message));
        }
      }
    }
  } catch (error) {
    log('bilibili search FAILED', String(error && error.message));
  }

  const after = fs.existsSync(accountsPath) ? fs.readFileSync(accountsPath, 'utf8') : '{}';
  let afterParsed = {};
  try {
    afterParsed = JSON.parse(after);
  } catch {
    afterParsed = {};
  }
  log('accounts after writes', {
    neteaseKeys: Object.keys(afterParsed.netease || {}),
    bilibiliKeys: Object.keys(afterParsed.bilibili || {}),
    neteaseStillEncrypted: typeof afterParsed.netease?.encryptedCookie === 'string',
    bilibiliStillEncrypted: typeof afterParsed.bilibili?.encryptedCookie === 'string',
    neteasePlaintextLeak: typeof afterParsed.netease?.cookie === 'string',
    neteaseError: afterParsed.netease?.error ?? null,
    neteaseDisplayName: afterParsed.netease?.displayName ?? null,
  });
  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});

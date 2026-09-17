// Runs mod/main.cjs inside a real Electron 43 main process with a simulated
// ShinawaseLoader package host. Verifies activation, the private RPC surface,
// the playback-resolver wrapping/restoring, a live end-to-end search, and the
// community MV media serving (echo-mv:// handler + loopback proxy).
const { app, protocol } = require('electron');
const nodePath = require('node:path');
const nodeFs = require('node:fs');
const nodeHttp = require('node:http');

const requestRange = (url, headers) => new Promise((resolve, reject) => {
  const request = nodeHttp.get(url, { headers }, (response) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
  });
  request.on('error', reject);
});

const methods = new Map();
const logLines = [];
const loadedNatives = () => {
  const wanted = ['better_sqlite3.node', 'sharp', 'taglib'];
  const seen = new Set();
  for (const module of Object.values(require.cache)) {
    const file = String(module?.filename || '').toLowerCase();
    for (const needle of wanted) if (file.includes(needle)) seen.add(file);
  }
  return [...seen];
};

const run = async () => {
  const packageRoot = process.env.ECHO_MMS_PACKAGE_ROOT || nodePath.resolve(__dirname, '..', 'mod');
  const modMain = require(nodePath.join(packageRoot, 'main.cjs'));

  const host = {
    manifest: { version: '1.0.0' },
    config: { defaultQuality: 'standard', interceptPlayback: true, pageSize: 5, debugLogging: true },
    log: (level, message) => logLines.push(`${level}: ${message}`),
    handle(method, listener) {
      methods.set(method, listener);
      return () => methods.delete(method);
    },
  };

  // Simulate the loader's own streaming bridge owning the global first.
  const loaderCalls = [];
  globalThis.__shinawaseResolveStreamingPlayback = async (request) => {
    loaderCalls.push(request?.provider);
    return { url: `https://loader.invalid/${request?.provider}`, headers: {} };
  };

  const dispose = await modMain.activate(host);
  console.log(`registered methods: ${methods.size}`);

  // Mirrors the loader's package-method envelope: failures arrive as
  // { ok: false, error } with no `result`, so the status must be read first.
  const call = async (method, payload) => {
    const response = await methods.get(method)(payload);
    const envelope = response && typeof response === 'object' ? response : null;
    if (envelope && envelope.ok === false) throw new Error(String(envelope.error || 'failed'));
    if (envelope && 'result' in envelope) {
      const result = envelope.result;
      if (result && typeof result === 'object' && result.ok === false) throw new Error(String(result.error || 'failed'));
      return result;
    }
    return response;
  };

  let ok = 0;
  let fail = 0;
  const check = (name, passed, detail) => {
    if (passed) { ok += 1; console.log(`PASS  ${name}${detail ? ` — ${detail}` : ''}`); }
    else { fail += 1; console.log(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
  };

  check('all RPC methods registered', methods.size >= 20, `${methods.size} methods`);
  check('no native addon loaded', loadedNatives().length === 0, loadedNatives().join(',') || 'none');

  const status = await call('status');
  check('status reports ready bridge', status?.bridgeReady === true, `mode=${status?.mode}`);

  const providers = await call('providers');
  check('providers reachable over RPC', providers.length >= 10, `${providers.length} providers`);

  const search = await call('search', { provider: 'netease', query: '晴天', mediaTypes: ['track'], page: 1, pageSize: 2 });
  check('search over RPC', search?.tracks?.length > 0, `${search?.tracks?.length} tracks — ${search?.tracks?.[0]?.title}`);

  const wrapped = Boolean(globalThis.__shinawaseResolveStreamingPlayback?.__echoMmsWrapped);
  check('loader resolver wrapped, not replaced', wrapped);

  if (wrapped) {
    const passthrough = await globalThis.__shinawaseResolveStreamingPlayback({ provider: 'm3u8', providerTrackId: 'https://radio.invalid/live.m3u8' });
    check('m3u8 falls through to loader', String(passthrough?.url || '').startsWith('https://loader.invalid/'), passthrough?.url);

    let ownedError = null;
    try {
      await globalThis.__shinawaseResolveStreamingPlayback({ provider: 'qqmusic', providerTrackId: '0039MnYb0qxYhV', quality: 'standard' });
    } catch (error) {
      ownedError = error;
    }
    const fellBack = loaderCalls.includes('qqmusic');
    check('owned provider tries community first, falls back on failure', fellBack, ownedError ? ownedError.message.slice(0, 60) : 'community resolve succeeded');
  }

  const accounts = await call('accountStatuses');
  check('accounts over RPC', Array.isArray(accounts) && accounts.length >= 10, `${accounts?.length} platforms`);

  const profiles = await call('accountProfiles');
  check(
    'account profiles over RPC',
    Array.isArray(profiles) && profiles.length >= 10 && profiles.every((profile) => 'displayName' in profile),
    `${profiles?.length} profiles`,
  );

  const capabilities = await call('qrLoginCapabilities');
  check(
    'QR sign-in capabilities exposed',
    capabilities?.qrImage?.includes('bilibili') && capabilities?.loginWindow?.includes('kugou'),
    JSON.stringify(capabilities),
  );

  // The MV settings from the mod config must reach the community MV searcher,
  // and the default 'first' mode must answer with Bilibili's own ordering.
  const mvCandidates = await call('findMvCandidates', { title: '晴天', artist: '周杰伦', limit: 2 });
  const mvList = Array.isArray(mvCandidates) ? mvCandidates : mvCandidates?.candidates;
  check(
    'MV search reachable over RPC (name-first mode)',
    Array.isArray(mvList) && (mvCandidates?.mode === undefined || mvCandidates.mode === 'first'),
    `mode=${mvCandidates?.mode ?? 'scored'} candidates=${mvList?.length ?? 0}`,
  );

  const stored = await call('getStoredPlaylist', { playlistId: 'mms-system-netease-liked' });
  check('stored playlist over RPC', Array.isArray(stored?.tracks), `${stored?.tracks?.length ?? 0} tracks`);

  const settings = await call('getSettings');
  check(
    'MV defaults mirror ECHO-main',
    settings?.mvImmersiveBackgroundScalePercent === 115
      && settings?.mvAutoApplyThreshold === 0.7
      && settings?.mvSyncMode === 'balanced'
      && settings?.mvImmersiveBackgroundAutoScale === true,
    `scale=${settings?.mvImmersiveBackgroundScalePercent} threshold=${settings?.mvAutoApplyThreshold} sync=${settings?.mvSyncMode}`,
  );
  check(
    'the MV background ships switched off (opt-in)',
    settings?.mvEnabled === false,
    `mvEnabled=${settings?.mvEnabled}`,
  );
  check(
    'background pipeline defaults are name-first + community engine',
    settings?.mvMatchMode === 'first' && settings?.mvSourceMode === 'engine' && settings?.mvDownloaderPath === undefined,
    `match=${settings?.mvMatchMode} source=${settings?.mvSourceMode} downloader=${settings?.mvDownloaderPath}`,
  );
  check(
    'the BBDown downloader RPCs are gone',
    !methods.has('mvPrefetch')
      && !methods.has('mvPrefetchStatus')
      && !methods.has('mvRelease')
      && !methods.has('mvStatus')
      && !methods.has('mvInstallDownloader')
      && !methods.has('mvDetectDownloader')
      && !methods.has('mvClearCache')
      && !methods.has('mvOpenCacheDir'),
    [...methods.keys()].filter((name) => /prefetch|downloader|cache|release/iu.test(name)).join(',') || 'none',
  );

  // ---- ported community MV engine over RPC --------------------------------
  const engineStatus = await call('mvEngineStatus');
  check(
    'mvEngineStatus over RPC',
    engineStatus?.ready === true && typeof engineStatus?.database === 'string',
    `database=${engineStatus?.database} tracks=${engineStatus?.tracks}`,
  );

  const remembered = await call('rememberTrack', {
    id: 'streaming:netease:4242',
    title: '晴天',
    artist: '周杰伦',
    album: '叶惠美',
    duration: 269,
    provider: 'netease',
    providerTrackId: '4242',
  });
  check('rememberTrack registers the current track', remembered?.id === 'streaming:netease:4242', JSON.stringify(remembered));

  // The background is opt-in: while `mvEnabled` is off the ported MvService is
  // inert (it answers with no candidates instead of searching Bilibili), so a
  // fresh install never goes online for a music video.
  const offCandidates = await call('mvSearchNetworkCandidatesForSnapshot', {
    trackId: 'streaming:netease:4242',
    title: '晴天 周杰伦 MV',
    artist: '周杰伦',
    durationSeconds: 269,
    mediaType: 'streaming',
  });
  check(
    'the MV engine stays inert while the background is off',
    Array.isArray(offCandidates) && offCandidates.length === 0,
    `${offCandidates?.length ?? 'n/a'} candidates`,
  );

  // ... and the switch is what arms it (`mvEnabled` → the engine's `enabled`).
  const armed = await call('mvSetSettings', { enabled: true });
  check(
    'switching the background on arms the MV engine',
    armed?.settings?.enabled === true && armed?.config?.mvEnabled === true,
    `enabled=${armed?.settings?.enabled} config=${armed?.config?.mvEnabled}`,
  );

  const engineSettings = await call('mvGetSettings');
  check(
    'mvGetSettings returns the community MvSettings',
    typeof engineSettings?.autoSearch === 'boolean' && typeof engineSettings?.immersiveBackgroundScalePercent === 'number',
    `autoSearch=${engineSettings?.autoSearch} scale=${engineSettings?.immersiveBackgroundScalePercent}`,
  );

  const patched = await call('mvSetSettings', { immersiveBackgroundScalePercent: 140, syncMode: 'precise' });
  check(
    'mvSetSettings normalises and mirrors into the mod config',
    patched?.settings?.immersiveBackgroundScalePercent === 140
      && patched?.settings?.syncMode === 'precise'
      && patched?.config?.mvImmersiveBackgroundScalePercent === 140
      && patched?.config?.mvSyncMode === 'precise',
    `scale=${patched?.settings?.immersiveBackgroundScalePercent} sync=${patched?.settings?.syncMode} configScale=${patched?.config?.mvImmersiveBackgroundScalePercent}`,
  );

  const engineCandidates = await call('mvSearchNetworkCandidatesForSnapshot', {
    trackId: 'streaming:netease:4242',
    title: '晴天 周杰伦 MV',
    artist: '周杰伦',
    durationSeconds: 269,
    mediaType: 'streaming',
  });
  check(
    'mvSearchNetworkCandidatesForSnapshot over RPC',
    Array.isArray(engineCandidates) && (engineCandidates.length === 0 || typeof engineCandidates[0]?.score === 'number'),
    `${engineCandidates?.length ?? 0} candidates, first="${engineCandidates?.[0]?.title ?? 'n/a'}"`,
  );

  // ---- community MV media serving -----------------------------------------
  // ECHO-main plays `mediaUrl` straight from MvService: the `echo-mv://` /
  // `echo-video://` scheme is handled in this process, and the loopback proxy
  // serves the same bytes for hosts that refuse the custom scheme.
  check(
    'the echo-mv protocol handler is registered',
    protocol.isProtocolHandled('echo-mv'),
    `handled=${protocol.isProtocolHandled('echo-mv')}`,
  );

  const localVideo = nodePath.join(app.getPath('userData'), 'verify-local-mv.mp4');
  nodeFs.writeFileSync(localVideo, Buffer.alloc(4096, 3));
  const boundLocal = await call('mvBindLocalVideo', { trackId: 'streaming:netease:4242', filePath: localVideo });
  const resolvedFile = await call('mvResolveMediaUrl', { mediaUrl: `echo-video://mv/${encodeURIComponent(boundLocal.id)}` });
  check(
    'mvResolveMediaUrl serves a bound local MV',
    String(resolvedFile?.url || '').startsWith('http://127.0.0.1:') && resolvedFile?.kind === 'file',
    `url=${String(resolvedFile?.url || '').slice(0, 48)} kind=${resolvedFile?.kind}`,
  );
  if (resolvedFile?.url) {
    const ranged = await requestRange(resolvedFile.url, { Range: 'bytes=1024-2047' });
    check(
      'the resolved MV streams with range requests',
      ranged.status === 206 && ranged.body.length === 1024 && String(ranged.headers['content-range'] || '').startsWith('bytes 1024-2047/'),
      `${ranged.status} ${ranged.headers['content-range']} ${ranged.body.length}B`,
    );
  }

  // A pasted link is normalised before the community bindUrl sees it.
  const boundId = 'streaming:netease:4242';
  const boundFromId = await call('mvBindUrl', { trackId: boundId, url: '  BV1d4411N7zD  ' });
  check(
    'a bare BV id can be bound',
    typeof boundFromId?.id === 'string' && boundFromId.provider === 'bilibili',
    `id=${boundFromId?.id} provider=${boundFromId?.provider}`,
  );
  const boundFromUrl = await call('mvBindUrl', {
    trackId: boundId,
    url: 'https://www.bilibili.com/video/BV1d4411N7zD/?spm_id_from=333.999&vd_source=abc',
  });
  check(
    'a full Bilibili link can be bound (query string and all)',
    typeof boundFromUrl?.id === 'string' && boundFromUrl.provider === 'bilibili',
    `id=${boundFromUrl?.id}`,
  );
  let unsupportedLink = null;
  try {
    await call('mvBindUrl', { trackId: boundId, url: '不是链接' });
  } catch (error) {
    unsupportedLink = error;
  }
  check(
    'an unusable link is rejected with an explanation',
    unsupportedLink !== null && /无法识别|Unsupported/u.test(unsupportedLink.message),
    unsupportedLink?.message || 'accepted',
  );

  // ---- credential headers must survive the network helper -------------------
  // Electron's net.fetch runs on Chromium, which drops the Cookie header as a
  // forbidden request name: every cookie-authenticated platform call went out
  // anonymous (NetEase "I like" imported 0 tracks, account playlists threw
  // "cannot read the NetEase account id", Bilibili favourites answered
  // isLogin:false). The build patches fetchWithNetworkProxy so requests that
  // carry credentials go through Node's fetch instead — verified here against a
  // local server that echoes the header it received.
  const receivedCookies = [];
  const echoServer = nodeHttp.createServer((request, response) => {
    receivedCookies.push(String(request.headers.cookie || ''));
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 200, account: { id: 1 } }));
  });
  await new Promise((resolve) => echoServer.listen(0, '127.0.0.1', resolve));
  const echoPort = echoServer.address()?.port;

  const originalNetFetch = require('electron').net.fetch;
  let netFetchCalls = 0;
  require('electron').net.fetch = async (input, init) => {
    netFetchCalls += 1;
    // What Chromium does with a forbidden request header.
    const headers = new Headers(init?.headers || {});
    headers.delete('cookie');
    return originalNetFetch(input, { ...init, headers });
  };

  try {
    const withCookie = await call('debugFetch', {
      url: `http://127.0.0.1:${echoPort}/account`,
      method: 'GET',
      headers: { Cookie: 'MUSIC_U=abc123', Referer: 'https://music.163.com/' },
      preview: 200,
    });
    const netCallsAfterCookie = netFetchCalls;
    const withoutCookie = await call('debugFetch', {
      url: `http://127.0.0.1:${echoPort}/plain`,
      method: 'GET',
      headers: { Accept: 'application/json' },
      preview: 200,
    });
    check(
      'credential headers reach the server through the network helper',
      receivedCookies.some((value) => value.includes('MUSIC_U=abc123')),
      `cookies=${JSON.stringify(receivedCookies)} helper=${String(withCookie?.helper || '').slice(0, 60)}`,
    );
    check(
      'cookie requests bypass Electron net.fetch (which would drop the header)',
      netCallsAfterCookie === 0,
      `${netCallsAfterCookie} net.fetch call(s)`,
    );
    check(
      'cookie-less requests still use Electron net.fetch',
      netFetchCalls > netCallsAfterCookie && Boolean(withoutCookie?.helper || withoutCookie?.proxyStatus),
      `${netFetchCalls - netCallsAfterCookie} net.fetch call(s) for the plain request`,
    );
  } finally {
    require('electron').net.fetch = originalNetFetch;
    await new Promise((resolve) => echoServer.close(resolve));
  }

  // Bilibili favourites need a signed-in cookie; without one the reason must be
  // explicit instead of an empty list.
  let favoritesWithoutLogin = null;
  try {
    const result = await call('listAccountPlaylists', { provider: 'bilibili' });
    if (!Array.isArray(result?.playlists)) favoritesWithoutLogin = null;
    else favoritesWithoutLogin = result.playlists.length ? 'has-cookie' : 'empty';
  } catch (error) {
    favoritesWithoutLogin = error.message;
  }
  check(
    'listing Bilibili favourites either works or explains the missing login',
    favoritesWithoutLogin === 'has-cookie' || /请先登录|B 站/u.test(String(favoritesWithoutLogin)),
    String(favoritesWithoutLogin),
  );

  // An account listing describes a NetEase / QQ Music playlist with a bare
  // provider id (the community shape carries `webUrl`, not `url`). Forwarding
  // that id used to make the importer answer "Please enter a valid streaming
  // playlist URL", which is what the renderer surfaced for every playlist.
  let bareIdError = null;
  let bareIdTracks = null;
  try {
    const result = await call('importAccountCollection', { provider: 'netease', url: '123456', providerPlaylistId: '123456' });
    bareIdTracks = Array.isArray(result?.tracks) ? result.tracks.length : 0;
  } catch (error) {
    bareIdError = error.message;
  }
  check(
    'a bare NetEase playlist id is canonicalised instead of rejected as a URL',
    bareIdError === null || !/valid streaming playlist URL/u.test(String(bareIdError)),
    bareIdError ? String(bareIdError).slice(0, 140) : `${bareIdTracks} track(s)`,
  );

  // The locally kept playlists: the account list plus every opened playlist are
  // written to a JSON file so 「我的歌单」 does not re-fetch them every time.
  const storeSaved = await call('playlistStoreSaveAccount', {
    provider: 'netease',
    fetchedAt: '2026-01-02T03:04:05.000Z',
    entries: [
      { id: 'p1', title: '本地歌单', provider: 'netease', providerPlaylistId: '555', webUrl: 'https://music.163.com/#/playlist?id=555', trackCount: 3 },
    ],
  });
  check(
    'the account playlist list is persisted',
    storeSaved?.accounts?.netease?.entries?.length === 1,
    Object.keys(storeSaved?.accounts || {}).join(','),
  );

  const collectionSaved = await call('playlistStoreSaveCollection', {
    key: 'netease:555',
    provider: 'netease',
    source: 'account',
    name: '本地歌单',
    description: null,
    tracks: [{ id: 'streaming:netease:1', stableKey: 'streaming:netease:1', title: '本地曲目', provider: 'netease', providerTrackId: '1' }],
  });
  check(
    'an opened playlist is persisted',
    collectionSaved?.collections?.['netease:555']?.tracks?.length === 1,
    String(collectionSaved?.collections?.['netease:555']?.trackCount),
  );

  const linkSaved = await call('playlistStoreSaveCollection', {
    key: 'link:netease:https://music.163.com/#/playlist?id=999',
    provider: 'netease',
    source: 'link',
    linkUrl: 'https://music.163.com/#/playlist?id=999',
    name: '链接歌单',
    tracks: [{ id: 'streaming:netease:3', stableKey: 'streaming:netease:3', title: '链接曲目', provider: 'netease', providerTrackId: '3' }],
  });
  check(
    'a link-imported playlist keeps its source and link',
    linkSaved?.collections?.['link:netease:https://music.163.com/#/playlist?id=999']?.source === 'link'
      && String(linkSaved?.collections?.['link:netease:https://music.163.com/#/playlist?id=999']?.linkUrl || '').includes('id=999')
      && collectionSaved?.collections?.['netease:555']?.source === 'account',
    `account=${collectionSaved?.collections?.['netease:555']?.source} link=${linkSaved?.collections?.['link:netease:https://music.163.com/#/playlist?id=999']?.source}`,
  );

  const storeReadBack = await call('playlistStoreRead');
  check(
    'the locally kept playlists survive a re-read',
    storeReadBack?.accounts?.netease?.entries?.[0]?.webUrl === 'https://music.163.com/#/playlist?id=555'
      && storeReadBack?.collections?.['netease:555']?.tracks?.[0]?.title === '本地曲目'
      && storeReadBack?.collections?.['link:netease:https://music.163.com/#/playlist?id=999']?.tracks?.[0]?.title === '链接曲目',
    `file=${storeReadBack?.path}`,
  );

  const removedCollection = await call('playlistStoreRemoveCollection', { key: 'link:netease:https://music.163.com/#/playlist?id=999' });
  check(
    'one locally kept playlist can be dropped on its own',
    !removedCollection?.collections?.['link:netease:https://music.163.com/#/playlist?id=999']
      && Boolean(removedCollection?.collections?.['netease:555']),
    `keys=${Object.keys(removedCollection?.collections || {}).join(',')}`,
  );

  const storeCleared = await call('playlistStoreClear');
  check(
    'the local playlist store can be cleared',
    Object.keys(storeCleared?.accounts || {}).length === 0 && Object.keys(storeCleared?.collections || {}).length === 0,
    `accounts=${Object.keys(storeCleared?.accounts || {}).length} collections=${Object.keys(storeCleared?.collections || {}).length}`,
  );

  let unsupportedMedia = null;
  try {
    await call('mvResolveMediaUrl', { mediaUrl: 'https://example.invalid/not-an-mv.mp4' });
  } catch (error) {
    unsupportedMedia = error;
  }
  check(
    'an unsupported media url is rejected, not silently served',
    unsupportedMedia !== null && /unsupported MV media url/u.test(unsupportedMedia.message),
    unsupportedMedia?.message || 'resolved',
  );

  // The end-to-end path the renderer uses: the community service resolves an
  // `echo-mv://ephemeral/<token>` URL, and that URL yields real bytes (with
  // Range) both through the registered protocol handler and the loopback proxy.
  const snapshotVideo = await call('mvGetTemporaryPlayableForSnapshot', {
    trackId: 'streaming:netease:4242',
    title: '晴天 周杰伦 MV',
    artist: '周杰伦',
    durationSeconds: 269,
    mediaType: 'streaming',
  });
  const snapshotUrl = String(snapshotVideo?.mediaUrl || '');
  check(
    'the community service returns an echo-mv stream url',
    snapshotUrl.startsWith('echo-mv://'),
    `${snapshotUrl.slice(0, 52)} quality=${snapshotVideo?.qualityLabel ?? 'n/a'}`,
  );
  if (snapshotUrl.startsWith('echo-mv://')) {
    // The scheme itself is only fetchable from a renderer in an app that
    // registered it privileged (ECHO does — `echo-mv` is in its
    // registerSchemesAsPrivileged list), so the main-process harness checks the
    // very same resolution through the loopback proxy instead.
    const resolved = await call('mvResolveMediaUrl', { mediaUrl: snapshotUrl });
    check(
      'the same variant is served over the loopback proxy',
      String(resolved?.url || '').startsWith('http://127.0.0.1:'),
      String(resolved?.url || ''),
    );
    if (resolved?.url) {
      const ranged = await requestRange(resolved.url, { Range: 'bytes=0-1023' });
      check(
        'the proxied variant streams real bytes with range support',
        ranged.status === 206
          && ranged.headers['accept-ranges'] === 'bytes'
          && ranged.body.length === 1024
          && String(ranged.headers['content-type'] || '').startsWith('video/'),
        `${ranged.status} accept-ranges=${ranged.headers['accept-ranges']} type=${ranged.headers['content-type']} ${ranged.body.length}B`,
      );
    }
  }

  // A bound local file is also served by the plain loopback proxy.
  const served = await call('mvServeLocalFile', { filePath: localVideo });
  check('mvServeLocalFile returns a loopback URL', String(served?.url || '').startsWith('http://127.0.0.1:'), String(served?.url || ''));
  if (served?.url) {
    const ranged = await requestRange(served.url, { Range: 'bytes=100-199' });
    check(
      'the bound local video streams with ranges',
      ranged.status === 206 && ranged.body.length === 100,
      `${ranged.status} ${ranged.headers['content-range']} ${ranged.body.length}B`,
    );
  }

  try {
    const unexpected = await call('search', { provider: 'nope', query: 'x' });
    check('unknown platform rejected', false, `resolved instead of rejecting: ${JSON.stringify(unexpected)?.slice(0, 80)}`);
  } catch (error) {
    check('unknown platform rejected', /Unsupported music platform/iu.test(error.message), error.message);
  }

  await dispose();
  const restored = globalThis.__shinawaseResolveStreamingPlayback;
  check('resolver restored on disable', Boolean(restored) && !restored.__echoMmsWrapped);

  console.log(`\n${ok}/${ok + fail} checks passed`);
  for (const line of logLines) console.log(`  log ${line}`);
  app.exit(fail ? 1 : 0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('harness error:', error);
  app.exit(2);
});

// Probe: run the built provider bridge inside Electron with a throwaway userData
// that has ECHO's encrypted account store, so the daily / liked / playlist and
// Bilibili favourites endpoints can be inspected with the real cookies.
const { app, safeStorage } = require('electron');
const nodePath = require('node:path');
const nodeFs = require('node:fs');

const probeRoot = nodePath.join(__dirname, 'electron-account-probe');
const echoData = nodePath.join(process.env.APPDATA || '', 'ECHO Steam');
nodeFs.mkdirSync(probeRoot, { recursive: true });
for (const name of ['accounts.json', 'Local State']) {
  const source = nodePath.join(echoData, name);
  if (nodeFs.existsSync(source)) nodeFs.copyFileSync(source, nodePath.join(probeRoot, name));
}
app.setPath('userData', probeRoot);
process.env.ECHO_MMS_MV_DB = nodePath.join(probeRoot, 'probe-mv.sqlite');

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return String(text || '').slice(0, 160);
  }
};

const run = async () => {
  const bridgePath = nodePath.resolve(__dirname, '..', 'mod', 'bridge', 'provider-bridge.cjs');
  // eslint-disable-next-line import/no-dynamic-require
  const loaded = require(bridgePath);
  const bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
    ? loaded.createMultiMusicSourcesBridge()
    : loaded?.default?.createMultiMusicSourcesBridge?.();
  const out = { safeStorage: safeStorage.isEncryptionAvailable(), probeRoot };
  const attempt = async (label, fn) => {
    try {
      return await fn();
    } catch (error) {
      return { __error: `${label}: ${error instanceof Error ? error.message : String(error)}` };
    }
  };

  const statuses = await attempt('statuses', () => bridge.getAccountStatuses());
  out.accounts = Array.isArray(statuses)
    ? statuses.map((item) => `${item.provider}:${item.connected ? 'on' : 'off'}`)
    : statuses;

  const profiles = await attempt('profiles', () => bridge.accountProfiles());
  out.profiles = Array.isArray(profiles)
    ? profiles.filter((item) => item.connected).map((item) => ({ provider: item.provider, displayName: item.displayName, username: item.username }))
    : profiles;

  const netease = await attempt('neteaseCookie', () => bridge.getProviderCookie('netease'));
  const bilibili = await attempt('bilibiliCookie', () => bridge.getProviderCookie('bilibili'));
  const neteaseCookie = netease?.cookie || '';
  const bilibiliCookie = bilibili?.cookie || '';
  out.cookies = {
    netease: neteaseCookie ? `len=${neteaseCookie.length} MUSIC_U=${/MUSIC_U=/u.test(neteaseCookie)}` : 'none',
    bilibili: bilibiliCookie ? `len=${bilibiliCookie.length} SESSDATA=${/SESSDATA=/u.test(bilibiliCookie)}` : 'none',
  };

  const neteaseHeaders = {
    Cookie: neteaseCookie,
    Referer: 'https://music.163.com/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json,text/plain,*/*',
  };

  for (const [label, url] of [
    ['accountGet', 'https://music.163.com/api/nuser/account/get'],
    ['accountGetW', 'https://music.163.com/api/w/nuser/account/get'],
    ['nav', 'https://music.163.com/api/nav'],
    ['loginStatus', 'https://music.163.com/api/w/nuser/account/get?timestamp=1'],
  ]) {
    const report = await attempt(`debugFetch:${label}`, () => bridge.debugFetch({ url, method: 'GET', headers: neteaseHeaders, preview: 20000 }));
    const body = report?.helper ? parse(report.helper) : null;
    out[`netease_${label}`] = {
      helperError: report?.helperError ?? null,
      code: body?.code ?? null,
      accountId: body?.account?.id ?? body?.data?.account?.id ?? null,
      profileUserId: body?.profile?.userId ?? body?.data?.profile?.userId ?? null,
      nickname: body?.profile?.nickname ?? body?.data?.profile?.nickname ?? null,
      message: body?.message ?? null,
      keys: body && typeof body === 'object' ? Object.keys(body).slice(0, 8) : null,
    };
  }

  const liked = await attempt('liked', () => bridge.syncLikedSongs('netease'));
  out.liked = liked?.__error ? liked : { tracks: (liked?.tracks || []).length, imported: liked?.importedCount ?? liked?.addedCount, playlistId: liked?.playlistId };
  const playlists = await attempt('playlists', () => bridge.listAccountPlaylists('netease'));
  out.neteasePlaylists = playlists?.__error ? playlists : { count: (playlists?.playlists || []).length, first: playlists?.playlists?.[0]?.name };

  // ---- Bilibili favourites -------------------------------------------------
  const biliHeaders = {
    Cookie: bilibiliCookie,
    Referer: 'https://www.bilibili.com/',
    Origin: 'https://www.bilibili.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  };
  const biliFetch = async (label, url, preview = 20000) => {
    const report = await attempt(`debugFetch:${label}`, () => bridge.debugFetch({ url, method: 'GET', headers: biliHeaders, preview }));
    return report?.helper ? parse(report.helper) : { helperError: report?.helperError, raw: report };
  };

  const nav = await biliFetch('biliNav', 'https://api.bilibili.com/x/web-interface/nav');
  out.biliNav = { code: nav?.code, isLogin: nav?.data?.isLogin, mid: nav?.data?.mid, uname: nav?.data?.uname, message: nav?.message };
  if (out.biliNav?.mid) {
    const folders = await biliFetch('biliFolders', `https://api.bilibili.com/x/v3/fav/folder/created/list-all?up_mid=${out.biliNav.mid}`);
    out.biliFolders = folders?.code === 0
      ? (folders.data?.list || []).map((item) => ({ id: item.id, title: item.title, count: item.media_count }))
      : { code: folders?.code, message: folders?.message, raw: String(JSON.stringify(folders?.data) ?? '').slice(0, 200) };

    const firstId = Array.isArray(out.biliFolders) ? out.biliFolders[0]?.id : null;
    if (firstId) {
      const items = await biliFetch('biliItems', `https://api.bilibili.com/x/v3/fav/resource/list?media_id=${firstId}&pn=1&ps=5&platform=web`, 1000);
      out.biliItems = items?.code === 0
        ? { mediaCount: items.data?.info?.media_count, medias: (items.data?.medias || []).map((item) => ({ bvid: item.bvid, title: item.title, upper: item.upper?.name, duration: item.duration, type: item.type })) }
        : { code: items?.code, message: items?.message, raw: String(JSON.stringify(items?.data) ?? '').slice(0, 200) };
    }

    const collected = await biliFetch('biliCollected', `https://api.bilibili.com/x/v3/fav/folder/collected/list?up_mid=${out.biliNav.mid}&pn=1&ps=10&platform=web`);
    out.biliCollected = collected?.code === 0
      ? (collected.data?.list || []).map((item) => ({ id: item.id, title: item.title, count: item.media_count }))
      : { code: collected?.code, message: collected?.message };
  }

  const watchLater = await biliFetch('biliWatchLater', 'https://api.bilibili.com/x/v2/history/toview', 400);
  out.biliWatchLater = watchLater?.code === 0 ? { count: watchLater.data?.count } : { code: watchLater?.code, message: watchLater?.message };

  console.log(JSON.stringify(out, null, 2));
  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});



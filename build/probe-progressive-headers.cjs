// Diagnoses the 403 the progressive (durl) CDN returns, by replaying the same
// request with different header sets.
const { app } = require('electron');
const nodePath = require('node:path');

const packageRoot = process.env.ECHO_MMS_PACKAGE_ROOT || nodePath.resolve(__dirname, '..', 'mod');
const BVID = process.env.PROBE_BVID || 'BV1d4411N7zD';

const run = async () => {
  const loaded = require(nodePath.join(packageRoot, 'bridge', 'provider-bridge.cjs'));
  const bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
    ? loaded.createMultiMusicSourcesBridge()
    : loaded?.default?.createMultiMusicSourcesBridge?.();

  const credentials = typeof bridge.getProviderCookie === 'function' ? bridge.getProviderCookie('bilibili') : null;
  const cookie = credentials?.cookie || null;
  console.log(`cookie present: ${Boolean(cookie)} (${cookie ? cookie.slice(0, 24) : 'none'})`);

  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  const baseHeaders = {
    Referer: `https://www.bilibili.com/video/${BVID}`,
    Origin: 'https://www.bilibili.com',
    'User-Agent': ua,
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,ja;q=0.7',
    ...(cookie ? { Cookie: cookie } : {}),
  };

  const viewResponse = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${BVID}`, { headers: baseHeaders });
  const view = await viewResponse.json();
  const cid = view?.data?.cid;
  console.log(`view: code=${view?.code} cid=${cid} duration=${view?.data?.duration}s`);

  const playUrl = new URL('https://api.bilibili.com/x/player/playurl');
  playUrl.searchParams.set('bvid', BVID);
  playUrl.searchParams.set('cid', String(cid));
  playUrl.searchParams.set('qn', '80');
  playUrl.searchParams.set('fnval', '1');
  playUrl.searchParams.set('fnver', '0');
  playUrl.searchParams.set('fourk', '1');
  const playResponse = await fetch(playUrl.toString(), { headers: baseHeaders });
  const play = await playResponse.json();
  const durl = Array.isArray(play?.data?.durl) ? play.data.durl : [];
  console.log(`playurl: code=${play?.code} message=${play?.message} quality=${play?.data?.quality} timelength=${play?.data?.timelength} durlParts=${durl.length}`);
  const target = durl[0]?.url;
  console.log(`durl url: ${String(target).slice(0, 140)}`);
  console.log(`durl size=${durl[0]?.size} length=${durl[0]?.length}`);
  if (!target) {
    console.log('no durl in the response — progressive is disabled for this video');
    app.exit(0);
    return;
  }

  const variants = [
    ['as-is', baseHeaders],
    ['root-referer', { ...baseHeaders, Referer: 'https://www.bilibili.com/' }],
    ['no-origin', { ...baseHeaders, Origin: undefined }],
    ['no-cookie', { ...baseHeaders, Cookie: undefined }],
    ['ua-only', { 'User-Agent': ua }],
    ['range-inline', { ...baseHeaders, Range: 'bytes=0-1' }],
    ['no-range-ua-chrome', { ...baseHeaders, Range: 'bytes=0-1', 'User-Agent': ua, 'Accept': '*/*', 'Accept-Encoding': 'identity' }],
  ];

  for (const [name, headers] of variants) {
    const clean = Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined));
    try {
      const response = await fetch(target, { headers: clean });
      console.log(`${name.padEnd(20)} -> ${response.status} ${response.headers.get('content-type') || ''} ${response.headers.get('content-range') || ''}`);
      await response.arrayBuffer().catch(() => undefined);
    } catch (error) {
      console.log(`${name.padEnd(20)} -> ERROR ${error.message}`);
    }
  }

  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});

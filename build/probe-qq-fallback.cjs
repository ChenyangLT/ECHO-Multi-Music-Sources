// Reproduces the patched searchOnce flow by hand: call musicu.fcg, then the
// legacy fallback, and confirm the fallback returns usable songs.
const { app } = require('electron');
const nodePath = require('node:path');

const packageRoot = process.env.ECHO_MMS_PACKAGE_ROOT || nodePath.resolve(__dirname, '..', 'mod');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const qqHeaders = { Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com', 'User-Agent': UA };

const run = async () => {
  const loaded = require(nodePath.join(packageRoot, 'bridge', 'provider-bridge.cjs'));
  const bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
    ? loaded.createMultiMusicSourcesBridge()
    : loaded?.default?.createMultiMusicSourcesBridge?.();

  // 1) musicu (may be throttled)
  const musicuBody = {
    comm: { ct: '19', cv: '1859', uin: '0' },
    req_1: { module: 'music.search.SearchCgiService', method: 'DoSearchForQQMusicDesktop', param: { query: '周杰伦', page_num: 1, num_per_page: 3, search_type: 0 } },
  };
  const musicu = await bridge.debugFetch({ url: 'https://u.y.qq.com/cgi-bin/musicu.fcg', method: 'POST', headers: qqHeaders, body: musicuBody, preview: 200 });
  let musicuSongs = -1;
  try {
    const parsed = JSON.parse(musicu.helper || '{}');
    musicuSongs = parsed?.req_1?.data?.body?.song?.list?.length ?? -1;
  } catch { /* ignore */ }
  console.log(`musicu: songs=${musicuSongs} helperError=${musicu.helperError || 'none'}`);

  // 2) legacy fallback exactly as the patch builds it
  const params = new URLSearchParams({ format: 'json', p: '1', n: '3', w: '周杰伦', new_json: '1', t: '0' });
  const legacy = await bridge.debugFetch({ url: 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?' + params.toString(), method: 'GET', headers: qqHeaders, preview: 400 });
  let legacySongs = -1;
  try {
    const parsed = JSON.parse(legacy.helper || '{}');
    legacySongs = parsed?.data?.song?.list?.length ?? -1;
    console.log(`legacy: songs=${legacySongs} total=${parsed?.data?.song?.totalnum}`);
    console.log(`legacy first mid=${parsed?.data?.song?.list?.[0]?.mid} name=${parsed?.data?.song?.list?.[0]?.name}`);
  } catch (error) {
    console.log(`legacy parse failed: ${error.message}; helperError=${legacy.helperError || 'none'}`);
    console.log(`  raw=${String(legacy.helper).slice(0, 200)}`);
  }

  // 3) what the patched provider returns end to end
  const result = await bridge.search({ provider: 'qqmusic', query: '周杰伦', mediaTypes: ['track'], page: 1, pageSize: 3 });
  console.log(`bridge.search: tracks=${result?.tracks?.length} total=${result?.total}`);
  for (const track of result?.tracks || []) console.log(`   ${track.title} / ${track.artist} [${track.providerTrackId}] playable=${track.playable}`);
  console.log(`patched counters: ${JSON.stringify(bridge.debugCounters?.() ?? {})}`);

  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});

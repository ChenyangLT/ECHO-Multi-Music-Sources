// Probes QQ Music search from the built bridge to find why search fails.
// Runs inside Electron's main process so it uses the same network path as ECHO.
const { app } = require('electron');
const nodePath = require('node:path');

const packageRoot = process.env.ECHO_MMS_PACKAGE_ROOT || nodePath.resolve(__dirname, '..', 'mod');

const run = async () => {
  const loaded = require(nodePath.join(packageRoot, 'bridge', 'provider-bridge.cjs'));
  const bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
    ? loaded.createMultiMusicSourcesBridge()
    : loaded?.default?.createMultiMusicSourcesBridge?.();

  const queries = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const list = queries.length ? queries : ['周杰伦', '晴天', 'Jay Chou', 'Aimer'];

  for (const query of list) {
    const started = Date.now();
    try {
      const result = await bridge.search({ provider: 'qqmusic', query, mediaTypes: ['track'], page: 1, pageSize: 3 });
      const tracks = result?.tracks || [];
      console.log(`qqmusic "${query}": total=${result?.total} tracks=${tracks.length} (${Date.now() - started}ms)`);
      for (const track of tracks) {
        console.log(`   title=${JSON.stringify(track.title)} artist=${JSON.stringify(track.artist)} id=${track.providerTrackId} playable=${track.playable}`);
        console.log(`   cover=${String(track.coverThumb || track.coverUrl || '').slice(0, 120)}`);
      }
    } catch (error) {
      console.log(`qqmusic "${query}": THREW ${error?.message || error}`);
    }
  }

  // Compare with the raw public endpoint the provider uses, to separate a
  // platform-side change from a mod-side bug.
  try {
    const url = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&p=1&n=3&w=%E5%91%A8%E6%9D%B0%E4%BC%A6&new_json=1';
    const response = await fetch(url, {
      headers: {
        Referer: 'https://y.qq.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      },
    });
    const text = await response.text();
    console.log(`\nraw client_search_cp: status=${response.status} len=${text.length}`);
    console.log(`   head=${JSON.stringify(text.slice(0, 200))}`);
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = null; }
    if (parsed) {
      console.log(`   code=${parsed.code} hasData=${Boolean(parsed.data)} songCount=${parsed.data?.song?.list?.length ?? 'n/a'} totalnum=${parsed.data?.song?.totalnum ?? 'n/a'}`);
      const first = parsed.data?.song?.list?.[0];
      if (first) console.log(`   first=${JSON.stringify({ name: first.name ?? first.title, singer: first.singer?.map((s) => s.name) })}`);
    }
  } catch (error) {
    console.log(`\nraw client_search_cp THREW ${error?.message || error}`);
  }

  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});

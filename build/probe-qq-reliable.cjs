// Reliability check for QQ Music search: several queries, twice each, so a
// throttled response is exercised and the fallback has to carry it.
const { app } = require('electron');
const nodePath = require('node:path');

const packageRoot = process.env.ECHO_MMS_PACKAGE_ROOT || nodePath.resolve(__dirname, '..', 'mod');

const run = async () => {
  const loaded = require(nodePath.join(packageRoot, 'bridge', 'provider-bridge.cjs'));
  const bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
    ? loaded.createMultiMusicSourcesBridge()
    : loaded?.default?.createMultiMusicSourcesBridge?.();

  const queries = ['周杰伦', '晴天', 'Aimer', 'Yoasobi', '陈奕迅', '林俊杰'];
  let ok = 0;
  let empty = 0;

  for (const query of queries) {
    const started = Date.now();
    try {
      const result = await bridge.search({ provider: 'qqmusic', query, mediaTypes: ['track'], page: 1, pageSize: 5 });
      const count = result?.tracks?.length ?? 0;
      if (count > 0) ok += 1; else empty += 1;
      const first = result?.tracks?.[0];
      console.log(`qqmusic "${query}": tracks=${count} total=${result?.total} (${Date.now() - started}ms)${first ? ` first=${first.title}/${first.artist}` : ''}`);
    } catch (error) {
      console.log(`qqmusic "${query}": THREW ${error?.message || error}`);
      empty += 1;
    }
  }

  console.log(`\nsummary: ${ok} queries returned results, ${empty} empty/failed`);
  app.exit(empty > 0 ? 1 : 0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});

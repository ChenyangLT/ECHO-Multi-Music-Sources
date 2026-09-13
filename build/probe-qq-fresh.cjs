// Tests QQ search with never-before-seen queries, so a cached empty result
// cannot mask the provider's behaviour.
const { app } = require('electron');
const nodePath = require('node:path');

const packageRoot = process.env.ECHO_MMS_PACKAGE_ROOT || nodePath.resolve(__dirname, '..', 'mod');

const run = async () => {
  const loaded = require(nodePath.join(packageRoot, 'bridge', 'provider-bridge.cjs'));
  const bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
    ? loaded.createMultiMusicSourcesBridge()
    : loaded?.default?.createMultiMusicSourcesBridge?.();

  const stamp = Date.now();
  const queries = [`周杰伦 ${stamp}`, `周杰伦 ${stamp}`, `Aimer ${stamp}`];
  for (const query of queries) {
    const started = Date.now();
    try {
      const result = await bridge.search({ provider: 'qqmusic', query, mediaTypes: ['track'], page: 1, pageSize: 3 });
      console.log(`qqmusic "${query}": tracks=${result?.tracks?.length ?? -1} total=${result?.total ?? 'n/a'} cached=${result?.cached === true} ${Date.now() - started}ms`);
    } catch (error) {
      console.log(`qqmusic "${query}": THREW ${error.message}`);
    }
  }
  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});

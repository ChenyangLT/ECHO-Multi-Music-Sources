// Compares the QQ Music provider's own request helper against the raw network
// path, so a platform change can be told apart from a provider-side bug.
const { app } = require('electron');
const nodePath = require('node:path');

const packageRoot = process.env.ECHO_MMS_PACKAGE_ROOT || nodePath.resolve(__dirname, '..', 'mod');

const qqHeaders = {
  Referer: 'https://y.qq.com/',
  Origin: 'https://y.qq.com',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

const body = {
  comm: { ct: '19', cv: '1859', uin: '0' },
  req_1: {
    module: 'music.search.SearchCgiService',
    method: 'DoSearchForQQMusicDesktop',
    param: { query: '周杰伦', page_num: 1, num_per_page: 3, search_type: 0 },
  },
};

const run = async () => {
  const loaded = require(nodePath.join(packageRoot, 'bridge', 'provider-bridge.cjs'));
  const bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
    ? loaded.createMultiMusicSourcesBridge()
    : loaded?.default?.createMultiMusicSourcesBridge?.();

  const report = await bridge.debugFetch({
    url: 'https://u.y.qq.com/cgi-bin/musicu.fcg',
    method: 'POST',
    headers: qqHeaders,
    body,
    preview: 700,
  });
  console.log('=== debugFetch report ===');
  console.log(JSON.stringify(report, null, 2).slice(0, 3000));

  const legacy = await bridge.debugFetch({
    url: 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&p=1&n=3&w=%E5%91%A8%E6%9D%B0%E4%BC%A6&new_json=1',
    method: 'GET',
    headers: qqHeaders,
    preview: 300,
  });
  console.log('\n=== legacy endpoint via helper ===');
  console.log(JSON.stringify({ helper: legacy.helper?.slice(0, 260), helperError: legacy.helperError, proxyStatus: legacy.proxyStatus }, null, 2));

  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});

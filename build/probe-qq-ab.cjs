// Controlled A/B: alternates the provider helper and a raw fetch for the same
// QQ Music request, several times, to find the discriminating factor.
const { app } = require('electron');
const nodePath = require('node:path');

const packageRoot = process.env.ECHO_MMS_PACKAGE_ROOT || nodePath.resolve(__dirname, '..', 'mod');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const baseHeaders = { Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com', 'User-Agent': UA };
const url = 'https://u.y.qq.com/cgi-bin/musicu.fcg';

const payload = (overrides = {}) => ({
  comm: { ct: '19', cv: '1859', uin: '0', ...(overrides.comm || {}) },
  req_1: {
    module: 'music.search.SearchCgiService',
    method: 'DoSearchForQQMusicDesktop',
    param: { query: '周杰伦', page_num: 1, num_per_page: 3, search_type: 0, ...(overrides.param || {}) },
  },
});

const summarize = (label, text) => {
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }
  const song = parsed?.req_1?.data?.body?.song;
  const meta = parsed?.req_1?.data?.meta;
  console.log(`  ${label}: code=${parsed?.code} req1=${parsed?.req_1?.code} songs=${song?.list?.length ?? 'n/a'} sum=${meta?.sum ?? 'n/a'} is_filter=${meta?.is_filter ?? 'n/a'}`);
};

const rawPost = async (body, headers) => {
  const response = await fetch(url, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return response.text();
};

const run = async () => {
  const loaded = require(nodePath.join(packageRoot, 'bridge', 'provider-bridge.cjs'));
  const bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
    ? loaded.createMultiMusicSourcesBridge()
    : loaded?.default?.createMultiMusicSourcesBridge?.();

  for (let round = 1; round <= 2; round += 1) {
    console.log(`\n--- round ${round} ---`);

    const rawText = await rawPost(payload(), baseHeaders);
    summarize('raw fetch (no Content-Type casing change)', rawText);

    const viaBridge = await bridge.debugFetch({ url, method: 'POST', headers: baseHeaders, body: payload(), preview: 400 });
    console.log(`  bridge jsonFetch error: ${viaBridge.helperError || 'none'}`);
    if (viaBridge.helper) summarize('bridge jsonFetch', viaBridge.helper === undefined ? '' : viaBridge.helper);

    // Same payload, but sent by a raw fetch that mimics jsonFetch exactly:
    // Accept header present, Content-Type application/json, UA as given.
    const mimicked = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': 'Mozilla/5.0 ECHO-Next/1.0',
        'Content-Type': 'application/json',
        ...baseHeaders,
      },
      body: JSON.stringify(payload()),
    });
    summarize('raw fetch with jsonFetch headers', await mimicked.text());

    await new Promise((resolveWait) => setTimeout(resolveWait, 1500));
  }

  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});

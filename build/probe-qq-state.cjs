// Is QQ Music's legacy search endpoint still answering, and is the mod's
// fallback reaching it? Writes findings to a file for reliable capture.
const { app } = require('electron');
const nodePath = require('node:path');
const nodeFs = require('node:fs');

const packageRoot = process.env.ECHO_MMS_PACKAGE_ROOT || nodePath.resolve(__dirname, '..', 'mod');
const outFile = nodePath.join(process.env.TEMP || '.', 'echo-mms-qq-report.txt');
const lines = [];
const note = (line) => { lines.push(line); console.log(line); };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const headers = { Referer: 'https://y.qq.com/', Origin: 'https://y.qq.com', 'User-Agent': UA };

const run = async () => {
  // 1) legacy endpoint, plain fetch
  try {
    const params = new URLSearchParams({ format: 'json', p: '1', n: '3', w: '周杰伦', new_json: '1', t: '0' });
    const url = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?' + params.toString();
    const response = await fetch(url, { headers });
    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* not json */ }
    const songs = parsed?.data?.song?.list?.length ?? -1;
    note(`legacy fetch: status=${response.status} songs=${songs} total=${parsed?.data?.song?.totalnum ?? 'n/a'} len=${text.length}`);
    note(`  head=${JSON.stringify(text.slice(0, 140))}`);
  } catch (error) {
    note(`legacy fetch THREW: ${error.message}`);
  }

  // 2) legacy endpoint through the bridge's own helper path
  const loaded = require(nodePath.join(packageRoot, 'bridge', 'provider-bridge.cjs'));
  const bridge = typeof loaded?.createMultiMusicSourcesBridge === 'function'
    ? loaded.createMultiMusicSourcesBridge()
    : loaded?.default?.createMultiMusicSourcesBridge?.();

  const viaHelper = await bridge.debugFetch({
    url: 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?format=json&p=1&n=3&w=' + encodeURIComponent('周杰伦') + '&new_json=1&t=0',
    method: 'GET',
    headers,
    preview: 300,
  });
  note(`legacy via helper: error=${viaHelper.helperError || 'none'} head=${String(viaHelper.helper).slice(0, 140)}`);

  // 3) musicu endpoint right now
  const musicuBody = {
    comm: { ct: '19', cv: '1859', uin: '0' },
    req_1: { module: 'music.search.SearchCgiService', method: 'DoSearchForQQMusicDesktop', param: { query: '周杰伦', page_num: 1, num_per_page: 3, search_type: 0 } },
  };
  const musicu = await bridge.debugFetch({ url: 'https://u.y.qq.com/cgi-bin/musicu.fcg', method: 'POST', headers, body: musicuBody, preview: 4000 });
  let musicuCode = null;
  let songListLength = 'unknown';
  let sum = 'unknown';
  try {
    const parsed = JSON.parse(musicu.helper || '{}');
    musicuCode = parsed?.req_1?.code ?? null;
    const list = parsed?.req_1?.data?.body?.song?.list;
    songListLength = Array.isArray(list) ? list.length : `not-array(${typeof list})`;
    sum = parsed?.req_1?.data?.meta?.sum ?? null;
  } catch { /* ignore */ }
  note(`musicu via helper: req1code=${musicuCode} songList=${songListLength} sum=${sum} error=${musicu.helperError || 'none'}`);

  // 4) what the provider returns end to end
  const result = await bridge.search({ provider: 'qqmusic', query: '周杰伦', mediaTypes: ['track'], page: 1, pageSize: 3 });
  note(`bridge.search: tracks=${result?.tracks?.length ?? -1} total=${result?.total ?? 'n/a'}`);

  // 5) a never-seen query, so no cache can be involved
  const fresh = await bridge.search({ provider: 'qqmusic', query: `周杰伦 ${Date.now()}`, mediaTypes: ['track'], page: 1, pageSize: 3 });
  note(`bridge.search (fresh query): tracks=${fresh?.tracks?.length ?? -1} total=${fresh?.total ?? 'n/a'}`);

  nodeFs.writeFileSync(outFile, lines.join('\n') + '\n', 'utf8');
  note(`report written to ${outFile}`);
  app.exit(0);
};

app.disableHardwareAcceleration();
app.whenReady().then(run).catch((error) => {
  console.error('probe error:', error);
  app.exit(2);
});
